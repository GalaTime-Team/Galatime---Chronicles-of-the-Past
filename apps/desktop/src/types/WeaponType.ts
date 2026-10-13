/**
 * Weapon vocabulary.
 *
 * A weapon is *data*: the shared catalogue (`data/combat/weapons/weapons.yaml`)
 * authors a {@link WeaponDefinition} once and entities reference it by id (or
 * keep an inline block for natural mob attacks). The combat engine projects an
 * equipped definition onto two runtime shapes:
 *
 * - {@link WeaponActionSpec} rides on the `CombatAction` a weapon produces, so
 *   the per-swing mechanics (throw variant, exponential stacks, per-range
 *   accuracy, random damage) travel with the action.
 * - {@link WeaponRuntimeState} rides on the `CombatUnit`, holding the state the
 *   *holder* accumulates (durability, ammo) and the passive multipliers the
 *   weapon projects onto everything the holder does (cost, damage, status
 *   output).
 *
 * Keeping the two apart is what lets a weapon be described once and shared by
 * many units: only the runtime state is cloned per unit.
 */

import type { AbilityDefinition } from './AbilityType';
import type { AttackEffect } from './AttackDataType';

/** The eight weapon families. A type supplies defaults over the sword baseline. */
export type WeaponTypeId =
    | 'sword'
    | 'dagger'
    | 'lance'
    | 'mace'
    | 'longsword'
    | 'greatsword'
    | 'staff'
    | 'bow';

/** Damage channels a weapon can use (`physical` unless authored otherwise). */
export type WeaponDamageChannel = 'physical' | 'magical';

/** Reach, mirroring `CombatRange` without importing the combat module. */
export type WeaponRange = 'short' | 'medium' | 'long';

/**
 * The closed flag set.
 *
 * A flag is behaviour that cannot be expressed as a number or an ability, which
 * is why the set is deliberately small — a new *value* on an axis or a new
 * ability needs no code, a new flag does.
 */
export type WeaponFlag =
    /** `damage_modifiers.atk_def_ratio` — damage scales with ATK/RES. */
    | 'royal'
    /** The damage of each swing is rolled in `[0.6, 1.4]` instead of a fixed power. */
    | 'randomize_power'
    /** A flat chance to shatter at the end of a swing, ignoring durability. */
    | 'fragile'
    /** Extra durability loss and a stamina tax while equipped. */
    | 'cursed'
    /** Loot-only, never sold, cannot be reforged. */
    | 'legendary'
    /** Reforging the material is blocked. */
    | 'no_reforge';

/** A flat stat change, authored with the snake_case keys of `CombatStatDelta`. */
export type WeaponStatDelta = Record<string, number>;

/** Per-instance durability. `indestructible` never loses a point. */
export interface WeaponDurability {
    max: number;
    /** Lost per weapon action used (default `1`). */
    wear?: number;
    indestructible?: boolean;
}

/** Dagger/lance stacking bonus: +`per_hit` per consecutive landed hit. */
export interface WeaponExponential {
    per_hit: number;
    /** Ceiling of the stacking multiplier (default `1`). */
    cap?: number;
    /** Events that clear the stacks (default `['miss', 'target_change']`). */
    reset_on?: string[];
}

/** Accuracy that depends on which line the target stands in. */
export interface WeaponAccuracyByRange {
    /** Target in the front line ("close"). */
    front: number;
    /** Target in the rear line ("far"). */
    rear: number;
}

/** A second action a lance/Gungnir offers: hurl the weapon. */
export interface WeaponThrow {
    power?: number;
    accuracy?: number;
    range?: WeaponRange;
    /** `true` when the weapon comes back (no ammo/durability spent). */
    returns?: boolean;
}

/** A ranged weapon's ammunition. */
export interface WeaponAmmo {
    /** A specific item id the weapon insists on (e.g. `arrow`). */
    item?: string;
    /**
     * An item *type* the weapon feeds on (e.g. `arrow`): every item carrying
     * that type in the holder's inventory is interchangeable ammunition. This
     * is how `weapon_types.bow` declares its family default — see
     * `services/inventory/ammoService.ts` for how an inventory qualifies.
     */
    item_type?: string;
    /** Chance the shot spends a unit; `1` (default) always spends. */
    consume_chance?: number;
}

/** Special damage formulas keyed off the weapon. */
export interface WeaponDamageModifiers {
    /** Final damage becomes `x ATK/RES` of the target (John II). */
    atk_def_ratio?: boolean;
}

/** Mana/stamina discount the weapon grants to its holder's skills. */
export interface WeaponCostModifiers {
    mana?: {
        multiplier: number;
        /** Elements the discount applies to; absent = all. */
        elements?: string[];
    };
}

/** Loot-chance bonus the weapon's holder enjoys. */
export interface WeaponLoot {
    chance_multiplier: number;
}

/** Card/tooltip presentation. */
export interface WeaponDisplay {
    visible?: boolean;
    summary?: string;
    icon?: string;
}

/** One catalogue weapon. Nothing but `id`/`name` is required. */
export interface WeaponDefinition {
    id: string;
    name: string;
    description?: string;
    type?: WeaponTypeId;
    element?: string;
    damage_type?: WeaponDamageChannel;
    target?: string;
    range?: WeaponRange;
    power?: number;
    accuracy?: number;
    hits?: number;
    stamina_cost?: number;
    cooldown?: number;
    damage_variance?: number[];

    durability?: WeaponDurability;
    /** Stat modifiers applied while equipped (folded into a permanent effect). */
    stats?: WeaponStatDelta;
    /** Per-swing status effects, same shape as a skill's `effects[]`. */
    effects?: AttackEffect[];
    /** Output multiplier the holder applies to its heal/buff/debuff (Asclepius). */
    effect_power?: number;

    exponential?: WeaponExponential;
    accuracy_by_range?: WeaponAccuracyByRange;
    throw?: WeaponThrow;
    ammo?: WeaponAmmo;
    damage_modifiers?: WeaponDamageModifiers;
    loot?: WeaponLoot;
    cost_modifiers?: WeaponCostModifiers;

    /** Passives merged into the holder's abilities while equipped. */
    abilities?: AbilityDefinition[];
    flags?: WeaponFlag[];
    tags?: string[];
    display?: WeaponDisplay;
}

/**
 * How an entity declares its weapon: a catalogue id, or an inline definition.
 *
 * Natural mob weapons (claws, mandibles) stay inline and carry no durability;
 * equippable weapons live in the catalogue and are referenced by id.
 */
export type WeaponReference = string | WeaponDefinition;

/** Type-level defaults the engine folds into a weapon before resolving it. */
export type WeaponTypeDefaults = Omit<WeaponDefinition, 'id' | 'name'>;

/** The catalogue root as parsed from `weapons.yaml`. */
export interface WeaponCatalog {
    weapon_types?: Record<string, WeaponTypeDefaults>;
    weapons?: WeaponDefinition[];
}

/**
 * Per-swing mechanics carried on the `CombatAction` a weapon produces.
 *
 * `throw` marks the secondary hurl action; `weaponId` ties the action back to
 * its definition so runtime hooks (durability, ammo) can find the right state.
 */
export interface WeaponActionSpec {
    weaponId: string;
    type: WeaponTypeId;
    /** `true` when this is the hurl action rather than the melee swing. */
    throw?: boolean;
    /** On a throw, whether the weapon comes back (no wear/ammo spent). */
    returns?: boolean;
    accuracyByRange?: WeaponAccuracyByRange;
    exponential?: WeaponExponential;
    damageModifiers?: WeaponDamageModifiers;
    ammo?: WeaponAmmo;
    /** `randomize_power`: the authored power is rolled per hit (bazar goods). */
    randomizePower?: boolean;
}

/** The mutable weapon state a holder carries through a fight. */
export interface WeaponRuntimeState {
    id: string;
    name: string;
    /** Short tooltip line describing the weapon's special rule. */
    summary: string;
    type: WeaponTypeId;
    /** Action ids this weapon provides (the swing, and the throw when present). */
    actionIds: string[];
    /** Remaining durability, or `null` when the weapon has none. */
    durability: number | null;
    maxDurability: number | null;
    indestructible: boolean;
    /** Points lost per weapon action used. */
    wear: number;
    /** Ammo item id the weapon insists on, or `null` when it takes a type. */
    ammoItem: string | null;
    /** Item *type* the weapon feeds on (`arrow`), or `null` when pinned by id. */
    ammoType: string | null;
    /** Chance a shot spends a unit (`1` = always). */
    ammoConsumeChance: number;
    /** Rounds left for an ammo weapon (`null` when the weapon takes no ammo). */
    ammo: number | null;
    /** Passives that scale the holder's heal/buff/debuff output. */
    effectPower: number;
    /** Loot-chance bonus the holder grants the party. */
    lootChanceMultiplier: number;
    costModifiers: WeaponCostModifiers | null;
    damageModifiers: WeaponDamageModifiers | null;
    /** Chance the weapon shatters at the end of a swing (`fragile`), `0` when not. */
    breakChance: number;
    /** Consecutive landed hits on {@link stackTargetId} (exponential weapons). */
    stacks: number;
    /** The target the stacks are building against, or `null`. */
    stackTargetId: string | null;
    flags: WeaponFlag[];
}
