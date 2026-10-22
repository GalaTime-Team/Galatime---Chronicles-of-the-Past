/**
 * Action factories.
 *
 * Normalises the three authored action sources — a skill from the shared
 * catalogue, an entity's weapon, and the universal movements — into the single
 * {@link CombatAction} shape the resolver consumes.
 *
 * The catalogue does not author a reach, so a skill defaults to `medium` and a
 * weapon to `short`. Authors can set `range: short|medium|long` on a skill (or
 * weapon) to opt into the plan's range restrictions.
 */

import {
    CURSED_WEAR_BONUS,
    DEFAULT_ACCURACY,
    DEFAULT_SKILL_RANGE,
    DEFAULT_WEAPON_RANGE,
    WEAPON_DAMAGE_TYPE,
} from '../../constants/CombatConstants';
import type { AttackEffect, PublicAttack } from '../../types/AttackDataType';
import type {
    CombatAction,
    CombatActionCost,
    CombatRange,
    CombatTargetRule,
    DamageType,
} from '../../types/CombatType';
import type { WeaponDefinition, WeaponRuntimeState, WeaponTypeId } from '../../types/WeaponType';
import { asRecord, clamp, readBoolean, readNumber, readPower, readString, readVariance } from '../../utils/combatUtils';
import { effectHeals } from './effectResolver';

/** Maps every authored targeting word onto the runtime rule. */
export function normalizeTargeting(raw: unknown): CombatTargetRule {
    const value = typeof raw === 'string' ? raw : readString(asRecord(raw)?.target, '');

    switch (value) {
        case 'enemies_all':
        case 'all_enemies':
        case 'enemies':
            return 'enemies_all';
        case 'allies_all':
        case 'all_allies':
        case 'allies':
            return 'allies_all';
        case 'self':
            return 'self';
        case 'both_teams':
        case 'all':
            return 'both_teams';
        case 'enemy_one':
        case 'individual':
        case 'single':
        case 'enemy':
        default:
            return 'enemy_one';
    }
}

/** Reads an authored reach, falling back when it is missing or unrecognised. */
function readRange(raw: unknown, fallback: CombatRange): CombatRange {
    const value = readString(raw, '');
    return value === 'short' || value === 'medium' || value === 'long' ? value : fallback;
}

function readDamageType(raw: unknown, fallback: DamageType): DamageType {
    const value = readString(raw, '');
    return value === 'physical' || value === 'magical' ? value : fallback;
}

function readCosts(source: Record<string, unknown> | null, fallbackStamina: number): CombatActionCost {
    return {
        mana: readNumber(source?.mana, 0),
        stamina: readNumber(source?.stamina, fallbackStamina),
        hp: Math.max(0, readNumber(source?.hp, 0)),
        cooldown: readNumber(source?.cooldown, 0),
    };
}

/** Reads a record of multipliers, keeping only the usable numbers. */
function readMultiplierRecord(source: unknown): Record<string, number> {
    const record = asRecord(source);
    if (!record) return {};

    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(record)) {
        const value = readNumber(raw, Number.NaN);
        if (Number.isFinite(value)) result[key] = value;
    }

    return result;
}

/** Reads the extra multiplier a skill gets against a wounded target. */
function readBonusVsHpBelow(source: unknown): { threshold: number; multiplier: number } | null {
    const record = asRecord(source);
    if (!record) return null;

    const threshold = readNumber(record.threshold, Number.NaN);
    const multiplier = readNumber(record.multiplier, Number.NaN);
    if (!Number.isFinite(threshold) || !Number.isFinite(multiplier)) return null;

    return { threshold, multiplier };
}

/**
 * The traits every action carries, whatever it came from.
 *
 * A weapon or a universal movement has none of them: the traits belong to the
 * skills the catalogue authors.
 */
function defaultTraits(): Pick<
    CombatAction,
    'solar' | 'nocturnal' | 'critChance' | 'ignoreAccuracy' | 'defensePierce'
    | 'bonusVsElements' | 'bonusVsHpBelow' | 'fleeBelowHp' | 'guaranteedCritVsStatus'
> {
    return {
        solar: false,
        nocturnal: false,
        critChance: 0,
        ignoreAccuracy: false,
        defensePierce: 0,
        bonusVsElements: {},
        bonusVsHpBelow: null,
        fleeBelowHp: null,
        guaranteedCritVsStatus: null,
    };
}

/** Builds an action from one catalogue skill. */
export function createCombatActionFromSkill(skill: PublicAttack): CombatAction {
    const damage = asRecord(skill.damage);
    const effects: AttackEffect[] = Array.isArray(skill.effects) ? skill.effects : [];
    const power = readPower(damage?.power ?? skill.power);
    // `range` and a top-level `damage_variance` are not part of the public skill
    // projection yet, so they are read off the raw record.
    const raw = skill as unknown as Record<string, unknown>;
    const dealsDamage = power > 0;

    return {
        id: skill.id,
        kind: 'skill',
        name: skill.name,
        description: readString(skill.description, ''),
        elementId: skill.element_id,
        damageType: readDamageType(damage?.damage_type ?? damage?.kind, 'magical'),
        range: readRange(raw.range, DEFAULT_SKILL_RANGE),
        power,
        accuracy: readNumber(skill.accuracy, DEFAULT_ACCURACY),
        hitCount: Math.max(1, Math.round(readNumber(skill.hit_count, 1))),
        costs: readCosts(asRecord(skill.costs), 0),
        targeting: normalizeTargeting(skill.targeting),
        effects,
        damageVariance: readVariance(damage?.damage_variance) ?? readVariance(raw.damage_variance),
        dealsDamage,
        // Only a non-damaging action can be a *heal*: a damaging attack with a
        // self-lifesteal effect (Chaoseater) is still an attack, and marking it
        // `heals` would make the AI aim it at allies.
        heals: !dealsDamage && effects.some(effectHeals),
        // The traits the skill forger writes and the engine reads.
        solar: readBoolean(skill.solar, false),
        nocturnal: readBoolean(skill.nocturnal, false),
        critChance: clamp(readNumber(skill.crit_chance, 0), 0, 100),
        ignoreAccuracy: readBoolean(skill.ignore_accuracy, false),
        defensePierce: clamp(readNumber(skill.defense_pierce, 0), 0, 1),
        bonusVsElements: readMultiplierRecord(skill.bonus_vs_elements),
        bonusVsHpBelow: readBonusVsHpBelow(skill.bonus_vs_hp_below),
        fleeBelowHp: typeof skill.flee_below_hp === 'number' && Number.isFinite(skill.flee_below_hp)
            ? clamp(skill.flee_below_hp, 0, 1)
            : null,
        guaranteedCritVsStatus: readString(skill.guaranteed_crit_vs_status, '') || null,
    };
}

/**
 * Builds the action(s) an entity's weapon provides.
 *
 * A weapon resolves through the exact same damage chain as a skill: the same
 * `ATK x EFFECT x PWR / RES` formula, the same element efficacy, variance and
 * hit rolls. Unlike a skill it may also offer a second, thrown action (a lance
 * hurled at the back line), so the factory returns a list — the swing first.
 *
 * The authored `damage_type`, `effects`, `cooldown` and `range` are honoured: a
 * scepter channels magically and a mace can go on cooldown.
 */
export function createCombatActionFromWeapon(weapon: WeaponDefinition): CombatAction[] {
    const actions: CombatAction[] = [buildWeaponAction(weapon)];
    if (weapon.throw) actions.push(buildWeaponAction(weapon, true));
    return actions;
}

/** Builds one weapon action; `throwing` selects the hurl variant. */
function buildWeaponAction(weapon: WeaponDefinition, throwing = false): CombatAction {
    const id = readString(weapon.id, 'weapon');
    const type: WeaponTypeId = weapon.type ?? 'sword';
    const throwSpec = throwing ? weapon.throw : undefined;
    const power = readPower(throwSpec?.power ?? weapon.power);
    const effects: AttackEffect[] = Array.isArray(weapon.effects) ? weapon.effects : [];
    const dealsDamage = power > 0;

    return {
        id: throwing ? `weapon:${id}:throw` : `weapon:${id}`,
        kind: 'weapon',
        name: throwing ? `${readString(weapon.name, 'Attack')} (Thrown)` : readString(weapon.name, 'Attack'),
        // The authored summary is what the hover tooltips read; `description` is
        // the bare fallback the catalogue rarely fills.
        description: readString(weapon.display?.summary, '') || readString(weapon.description, ''),
        elementId: readString(weapon.element, 'inanus'),
        damageType: readDamageType(weapon.damage_type, WEAPON_DAMAGE_TYPE),
        range: readRange(throwSpec?.range ?? weapon.range, DEFAULT_WEAPON_RANGE),
        power,
        accuracy: readNumber(throwSpec?.accuracy ?? weapon.accuracy, DEFAULT_ACCURACY),
        hitCount: Math.max(1, Math.round(readNumber(weapon.hits, 1))),
        costs: {
            mana: 0,
            stamina: readNumber(weapon.stamina_cost, 0),
            hp: 0,
            cooldown: Math.max(0, readNumber(weapon.cooldown, 0)),
        },
        targeting: normalizeTargeting(weapon.target),
        effects,
        damageVariance: readVariance(weapon.damage_variance),
        dealsDamage,
        // See the skill factory: a weapon that also drains/heals is not a heal.
        heals: !dealsDamage && effects.some(effectHeals),
        ...defaultTraits(),
        weapon: {
            weaponId: id,
            type,
            throw: throwing || undefined,
            returns: throwing ? throwSpec?.returns === true : undefined,
            accuracyByRange: weapon.accuracy_by_range,
            exponential: weapon.exponential,
            damageModifiers: weapon.damage_modifiers,
            ammo: throwing ? undefined : weapon.ammo,
            randomizePower: weapon.flags?.includes('randomize_power') ?? false,
        },
    };
}

/**
 * Projects a weapon definition onto the mutable state its holder carries.
 *
 * The action list is shared between every unit of the same blueprint, so the
 * shared parts (power, range, effects) stay on the actions while the per-holder
 * parts — durability, ammo, passive multipliers — are cloned here, once per
 * unit, by {@link instantiateUnit}.
 */
export function createWeaponRuntimeState(
    weapon: WeaponDefinition,
    actionIds: string[],
): WeaponRuntimeState {
    const durability = weapon.durability;
    const max = durability ? Math.max(1, Math.round(readNumber(durability.max, 1))) : null;
    const cursed = weapon.flags?.includes('cursed') === true;

    return {
        id: readString(weapon.id, 'weapon'),
        name: readString(weapon.name, 'Attack'),
        summary: readString(weapon.display?.summary, '') || readString(weapon.description, ''),
        type: weapon.type ?? 'sword',
        actionIds,
        durability: max,
        maxDurability: max,
        indestructible: durability?.indestructible === true,
        // A cursed weapon eats durability faster than it should.
        wear: Math.max(0, readNumber(durability?.wear, 1)) + (cursed ? CURSED_WEAR_BONUS : 0),
        ammoItem: readString(weapon.ammo?.item, '') || null,
        ammoType: readString(weapon.ammo?.item_type, '') || null,
        ammoConsumeChance: readNumber(weapon.ammo?.consume_chance, 1),
        ammo: null,
        effectPower: Math.max(1, readNumber(weapon.effect_power, 1)),
        lootChanceMultiplier: Math.max(0, readNumber(weapon.loot?.chance_multiplier, 1)),
        costModifiers: weapon.cost_modifiers ?? null,
        damageModifiers: weapon.damage_modifiers ?? null,
        breakChance: weapon.flags?.includes('fragile') ? 0.08 : 0,
        stacks: 0,
        stackTargetId: null,
        flags: Array.isArray(weapon.flags) ? weapon.flags : [],
    };
}

/**
 * Small helper so the universal list stays declarative.
 *
 * The reach is `medium`, not the weapon default of `short`: these are not ranged
 * attacks, and a `short` reach is illegal from the rear line — which would leave
 * every rear-line unit unable to brace or recover.
 */
function universalAction(
    id: string,
    name: string,
    kind: CombatAction['kind'],
    description: string,
): CombatAction {
    return {
        id,
        kind,
        name,
        description,
        elementId: 'inanus',
        damageType: 'physical',
        range: 'medium',
        power: 0,
        accuracy: DEFAULT_ACCURACY,
        hitCount: 1,
        costs: { mana: 0, stamina: 0, hp: 0, cooldown: 0 },
        targeting: 'self',
        effects: [],
        damageVariance: null,
        dealsDamage: false,
        heals: false,
        ...defaultTraits(),
    };
}

/**
 * The movements every unit can always pick.
 *
 * Ids are stable (`defend`, `rest`, `inventory`) so the HUD can localise the
 * labels. Fleeing is deliberately not offered: it is not a movement the player
 * should be able to spend a turn on, so no unit ever carries the action.
 */
export function createUniversalActions(): CombatAction[] {
    return [
        universalAction('defend', 'Defend', 'defend', 'Brace: halve incoming damage until your next turn.'),
        universalAction('rest', 'Rest', 'rest', 'Recover a portion of mana and stamina.'),
        universalAction('inventory', 'Inventory', 'inventory', 'Spend the turn using an item from your inventory.'),
        universalAction('switch_line', 'Switch Line', 'switch_line', 'Move to the other battle line, if there is room.'),
    ];
}
