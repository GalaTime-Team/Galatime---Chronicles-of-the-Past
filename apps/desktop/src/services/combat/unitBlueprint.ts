/**
 * Unit blueprints.
 *
 * Projecting a catalogue entity onto a fresh `CombatUnit` is the same job
 * wherever it happens: the opening roster (`combatService.buildUnits`), a summon
 * and a transform all need the entity's actions and abilities resolved.
 *
 * This module owns that projection once. Loading a blueprint is async (it reads
 * YAML and resolves skill tiers), so a fight pre-loads the blueprints its
 * abilities can reach in `preloadAbilityBlueprints` — the turn loop itself can
 * then instantiate a unit synchronously.
 */

import type {
    CarriedWeapon,
    CombatAction,
    CombatEntityType,
    CombatLine,
    CombatSide,
    CombatUnit,
} from '../../types/CombatType';
import type { CombatAbilityInstance } from '../../types/AbilityType';
import { resolveAttack } from '../attackContentService';
import type { ResolvedAttack } from '../attackContentService';
import { getCharacterData, getMobData } from '../entityService';
import { createAbilityInstances, readAbilityEntityTarget } from './abilityFactory';
import { createCombatActionFromSkill, createUniversalActions } from './actionFactory';
import { createCombatUnit } from './unitFactory';
import type { CombatEntitySource } from './unitFactory';
import { cloneCarriedWeapon, equipCarriedWeapon, isWeaponUsable, resolveCarriedWeapon } from './weaponLoadout';

/** Everything needed to spin up a unit, resolved once per entity. */
export interface UnitBlueprint {
    entityId: string;
    entityType: CombatEntityType;
    /** The catalogue entity the blueprint was built from. */
    entity: CombatEntitySource;
    /** Skills (highest tier per base id) and universal movements. */
    actions: CombatAction[];
    /** The entity's own abilities. Weapon passives come from {@link weapons}. */
    abilities: CombatAbilityInstance[];
    /**
     * The weapons a unit of this entity carries by default: its own `weapon:`,
     * as a template. Empty when the entity has none.
     */
    weapons: CarriedWeapon[];
}

export interface UnitInstantiationParams {
    /** Unique id within the fight. */
    id: string;
    side: CombatSide;
    line: CombatLine;
    slot: number;
    isPlayerControlled?: boolean;
    /** Display override. */
    name?: string;
    /** Max-HP override; defaults to the entity's `base_stats.hp`. */
    hp?: number;
    /** Fraction of max HP to start on; `1` (the default) is full health. */
    hpRatio?: number;
    /**
     * Weapons the unit carries instead of the blueprint's default. The first usable
     * one is equipped. An empty list fights unarmed.
     */
    weapons?: CarriedWeapon[];
}

/** How many transform/summon hops a preload follows before it gives up. */
const MAX_BLUEPRINT_HOPS = 4;

const blueprintCache = new Map<string, UnitBlueprint>();

function blueprintKey(entityId: string, entityType: CombatEntityType): string {
    return `${entityType}:${entityId}`;
}

/** Resolves an entity's skills (highest tier per base id). */
async function resolveSkillActions(entity: CombatEntitySource): Promise<CombatAction[]> {
    const skillTiers = new Map<string, ResolvedAttack>();
    for (const skillId of Array.isArray(entity.skills) ? entity.skills : []) {
        const resolved = await resolveAttack(skillId);
        if (!resolved) continue;
        const current = skillTiers.get(resolved.baseId);
        if (!current || resolved.level > current.level) skillTiers.set(resolved.baseId, resolved);
    }

    return [...skillTiers.values()].map((resolved) => createCombatActionFromSkill(resolved.attack));
}

/**
 * Loads (and caches) the blueprint for one entity, or `null` when it is absent.
 *
 * A natural mob weapon (garras, mandíbulas) stays inline and carries no durability;
 * an equippable weapon is a catalogue reference. Both go through the same projection.
 */
export async function loadUnitBlueprint(
    entityId: string,
    entityType: CombatEntityType,
): Promise<UnitBlueprint | null> {
    const cached = blueprintCache.get(blueprintKey(entityId, entityType));
    if (cached) return cached;

    const entity = entityType === 'mob'
        ? await getMobData(entityId)
        : await getCharacterData(entityId);

    if (!entity) return null;

    const source = entity as CombatEntitySource;
    const weapon = source.weapon ? await resolveCarriedWeapon(source.weapon) : null;
    const blueprint: UnitBlueprint = {
        entityId,
        entityType,
        entity: source,
        actions: [...await resolveSkillActions(source), ...createUniversalActions()],
        abilities: createAbilityInstances((entity as { abilities?: unknown }).abilities),
        weapons: weapon ? [weapon] : [],
    };

    blueprintCache.set(blueprintKey(entityId, entityType), blueprint);
    return blueprint;
}

/** The blueprint already in cache, for the synchronous turn loop. */
export function getUnitBlueprint(
    entityId: string,
    entityType: CombatEntityType,
): UnitBlueprint | null {
    return blueprintCache.get(blueprintKey(entityId, entityType)) ?? null;
}

/**
 * Builds a live unit from a blueprint.
 *
 * Ability state is cloned per unit, so two slimes split from the same parent do
 * not share a `triggered` flag; actions and definitions are immutable and are
 * shared by reference. Each weapon is cloned per unit too, and the first usable
 * one is equipped.
 */
export function instantiateUnit(
    blueprint: UnitBlueprint,
    params: UnitInstantiationParams,
): CombatUnit {
    const unit = createCombatUnit({
        id: params.id,
        entityId: blueprint.entityId,
        entityType: blueprint.entityType,
        entity: blueprint.entity,
        side: params.side,
        line: params.line,
        slot: params.slot,
        actions: blueprint.actions,
        abilities: blueprint.abilities.map((ability) => ({ ...ability })),
        isPlayerControlled: params.isPlayerControlled ?? false,
        name: params.name,
        hp: params.hp,
    });

    unit.carriedWeapons = (params.weapons ?? blueprint.weapons).map(cloneCarriedWeapon);
    const inHand = unit.carriedWeapons.find(isWeaponUsable);
    if (inHand) equipCarriedWeapon(unit, inHand);

    const ratio = params.hpRatio ?? 1;
    if (ratio < 1) {
        unit.currentHp = Math.max(1, Math.round(unit.stats.maxHp * Math.max(0, ratio)));
    }

    return unit;
}

/**
 * Pre-loads every blueprint a roster's abilities can reach.
 *
 * A summon or transform resolves its target entity by id at trigger time, which
 * must be synchronous — so the reachable blueprints are fetched up front here.
 * The walk follows summon/transform targets transitively (a soul that turns into
 * a soul that turns back), bounded by {@link MAX_BLUEPRINT_HOPS} and de-duplicated
 * by entity id.
 */
export async function preloadAbilityBlueprints(units: readonly CombatUnit[]): Promise<void> {
    const pending: Array<{ entityId: string; entityType: CombatEntityType; depth: number }> = [];
    const visited = new Set<string>();

    const enqueueFrom = (abilities: readonly CombatAbilityInstance[], depth: number) => {
        for (const ability of abilities) {
            const target = readAbilityEntityTarget(ability.definition);
            if (target) pending.push({ ...target, depth });
        }
    };

    for (const unit of units) enqueueFrom(unit.abilities, 0);

    while (pending.length > 0) {
        const next = pending.shift();
        if (!next || next.depth >= MAX_BLUEPRINT_HOPS) continue;

        const key = blueprintKey(next.entityId, next.entityType);
        if (visited.has(key)) continue;
        visited.add(key);

        const blueprint = await loadUnitBlueprint(next.entityId, next.entityType);
        if (!blueprint) continue;

        enqueueFrom(blueprint.abilities, next.depth + 1);
        for (const weapon of blueprint.weapons) enqueueFrom(weapon.abilities, next.depth + 1);
    }
}

/** Clears the blueprint cache (tests, development reloads). */
export function clearUnitBlueprintCache(): void {
    blueprintCache.clear();
}
