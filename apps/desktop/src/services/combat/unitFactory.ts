/**
 * Combat unit factory.
 *
 * Projects an entity from `data/entities/*` onto the runtime {@link CombatUnit}.
 * The entity files are untyped YAML, so every read goes through the tolerant
 * helpers and a malformed field degrades to a safe default instead of crashing
 * the fight.
 */

import type { EntitiesData } from '../../types/EntityDataType';
import type { CombatAbilityInstance } from '../../types/AbilityType';
import type { WeaponRuntimeState, WeaponStatDelta } from '../../types/WeaponType';
import type {
    CombatAction,
    CombatEffectInstance,
    CombatEntityType,
    CombatLine,
    CombatSide,
    CombatStats,
    CombatUnit,
} from '../../types/CombatType';
import { readNumber, readString } from '../../utils/combatUtils';
import { createAbilityInstances } from './abilityFactory';
import { createAiProfile } from './ai/aiProfileFactory';

/** An entity as loaded from the catalogue; characters and mobs both carry a name. */
export type CombatEntitySource = EntitiesData & { name?: string };

export interface CreateUnitParams {
    /** Unique id within the fight, e.g. `enemies_front_0_slime`. */
    id: string;
    /** Catalogue id used to load the entity. */
    entityId: string;
    entityType: CombatEntityType;
    entity: CombatEntitySource;
    side: CombatSide;
    line: CombatLine;
    slot: number;
    /** Actions available to the unit (skills, weapon, universal movements). */
    actions: CombatAction[];
    /**
     * Abilities to give the unit.
     *
     * Defaults to the entity's own `abilities:` list; a blueprint passes the
     * normalised instances so the per-unit trigger state is cloned once.
     */
    abilities?: CombatAbilityInstance[];
    isPlayerControlled?: boolean;
    /** Display override. */
    name?: string;
    /** Max-HP override; defaults to the entity's `base_stats.hp`. */
    hp?: number;
    /** The equipped weapon's runtime state (cloned per unit). */
    weapon?: WeaponRuntimeState | null;
    /** Stat modifiers the weapon applies while equipped. */
    weaponStats?: WeaponStatDelta | null;
}

/**
 * Builds the permanent effect a weapon's `stats:` produce.
 *
 * It carries the delta on `buff` (negative values read as a drop), lasting until
 * the fight ends, so the flat modifier flows through `effectiveStats` like any
 * other buff.
 */
export function createWeaponStatEffect(weaponId: string, stats: WeaponStatDelta): CombatEffectInstance {
    return {
        effectId: `weapon:${weaponId}:stats`,
        sourceId: `weapon:${weaponId}`,
        statusEffect: null,
        elementId: null,
        turns: null,
        applyTo: null,
        buff: stats as CombatEffectInstance['buff'],
        debuff: null,
        statMultipliers: null,
        preventActions: null,
        damagePerTurn: 0,
        stacks: 1,
        canStack: false,
    };
}

/** Reads an entity's `base_stats` into the runtime stat block. */
export function buildCombatStats(entity: CombatEntitySource): CombatStats {
    const base = entity.base_stats ?? null;

    return {
        maxHp: Math.max(1, Math.round(readNumber(base?.hp, 1))),
        maxMana: Math.max(0, Math.round(readNumber(base?.mana, 0))),
        maxStamina: Math.max(0, Math.round(readNumber(base?.stamina, 0))),
        physicalAttack: readNumber(base?.physical_attack, 0),
        magicalAttack: readNumber(base?.magical_attack, 0),
        physicalDefense: readNumber(base?.physical_defense, 0),
        magicalDefense: readNumber(base?.magical_defense, 0),
        speed: readNumber(base?.speed, 0),
    };
}

/** Builds a fresh, full-health combat unit from an entity. */
export function createCombatUnit(params: CreateUnitParams): CombatUnit {
    const stats = buildCombatStats(params.entity);
    const maxHp = params.hp && params.hp > 0 ? Math.round(params.hp) : stats.maxHp;
    const resolved: CombatStats = { ...stats, maxHp };

    const abilities = params.abilities ?? createAbilityInstances(params.entity.abilities);

    const unit: CombatUnit = {
        id: params.id,
        entityId: params.entityId,
        entityType: params.entityType,
        name: params.name ?? readString(params.entity.name, params.entityId),
        side: params.side,
        line: params.line,
        slot: params.slot,
        isPlayerControlled: params.isPlayerControlled ?? false,
        status: 'alive',
        elementIds: Array.isArray(params.entity.elements)
            ? params.entity.elements.filter((element): element is string => typeof element === 'string')
            : [],
        stats: resolved,
        currentHp: resolved.maxHp,
        currentMana: resolved.maxMana,
        currentStamina: resolved.maxStamina,
        actions: params.actions,
        effects: [],
        abilities,
        aiProfile: createAiProfile(params.entity.ai, abilities),
        immunities: [],
        turnCount: 0,
        resourceIdleTurns: { mana: 0, stamina: 0 },
        resourceSpentSinceTurnStart: { mana: false, stamina: false },
        eventCounts: {},
        flags: {},
        cooldowns: {},
        defending: false,
        weapon: params.weapon ?? null,
        carriedWeapons: [],
    };

    // A weapon's `stats:` become one permanent effect, so the flat deltas flow
    // through `effectiveStats` exactly like a skill's buff — the modifier chips
    // on the tooltip pick them up for free.
    if (params.weaponStats && Object.keys(params.weaponStats).length > 0) {
        unit.effects.push(createWeaponStatEffect(params.weapon?.id ?? 'weapon', params.weaponStats));
    }

    return unit;
}
