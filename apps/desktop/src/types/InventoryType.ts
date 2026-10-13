/**
 * Types for the inventory system.
 *
 * Each entity (character, mob) owns its own inventory. The dialogue engine
 * interacts with entity inventories through effects, and the combat engine
 * consumes items through the `inventory` action kind.
 *
 * The player's inventory is a special case: it is the inventory of the
 * player entity, stored in `WorldState.inventory` for backwards compatibility
 * with existing dialogue conditions and effects.
 */

import type { CombatEvent } from './CombatType';

// ---------------------------------------------------------------------------
// Item definitions
// ---------------------------------------------------------------------------

/** Category of an item, determining where it can be used. */
export type ItemCategory = 'consumable' | 'key_item' | 'throwable' | 'buff' | 'debuff';

/**
 * Who an item effect addresses, in the catalogue's own vocabulary.
 *
 * Deliberately NOT `CombatTargetRule`: the combat rules have no single-ally or
 * dead-ally scope, and reusing them once mapped "an ally" onto `enemy_one`, which
 * turned every potion into a weapon. `one_ally`/`dead_ally` are resolved by
 * `itemTargetResolver` instead.
 */
export type ItemTargetRule =
    | 'self'
    | 'one_ally'
    | 'one_enemy'
    | 'all_allies'
    | 'all_enemies'
    | 'both_teams'
    | 'dead_ally';

/** Which pool an effect moves. */
export type ItemResourceId = 'hp' | 'mana' | 'stamina';

/** Everything an item effect can do. */
export type ItemEffectType =
    | 'restore'
    | 'restore_percent'
    | 'damage'
    | 'status'
    | 'revive'
    | 'cleanse'
    | 'drain'
    | 'mystery';

/** Fields every item effect shares. */
interface ItemEffectBase {
    /** Target scope; inherits the item's `target` when omitted. */
    target?: ItemTargetRule;
}

/** Restores a flat amount of a pool (`hp_potion`). */
export interface ItemRestoreEffect extends ItemEffectBase {
    type: 'restore';
    resource: ItemResourceId;
    /** Lower bound of the restore; the exact amount when `amountMax` is absent. */
    amount: number;
    /** Optional upper bound, for a random restore (`lucky_coin`). */
    amountMax?: number;
}

/** Restores a percentage of a pool's maximum (`life_dew`). */
export interface ItemRestorePercentEffect extends ItemEffectBase {
    type: 'restore_percent';
    resource: ItemResourceId;
    amountPercent: number;
}

/** Deals flat damage, optionally scaled by the element matrix (`fire_bomb`). */
export interface ItemDamageEffect extends ItemEffectBase {
    type: 'damage';
    amount: number;
    element?: string | null;
    damageVariance?: [number, number] | null;
}

/** Applies a status: a stat buff/debuff and/or damage over time (`power_tonic`, `poison_vial`). */
export interface ItemStatusEffect extends ItemEffectBase {
    type: 'status';
    /** Authored label shown to the player. */
    statusEffect: string;
    /** Stable id, so re-applying refreshes instead of stacking. */
    effectId: string;
    /** Turns the status lasts; `null` means until the fight ends. */
    turns: number | null;
    /** Damage the status deals to its owner at the start of its turn. */
    damagePerTurn?: number;
    /** Stat increases while the status is live (authored stat names). */
    buff?: Record<string, number> | null;
    /** Stat decreases while the status is live (authored stat names). */
    debuff?: Record<string, number> | null;
    element?: string | null;
}

/** Brings a defeated ally back at a percentage of their maximum HP (`phoenix_feather`). */
export interface ItemReviveEffect extends ItemEffectBase {
    type: 'revive';
    amountPercent: number;
}

/** Removes every live status from the target (`antidote`). */
export interface ItemCleanseEffect extends ItemEffectBase {
    type: 'cleanse';
}

/** Damages a target and heals the user for a percentage of the damage (`soul_siphon`). */
export interface ItemDrainEffect extends ItemEffectBase {
    type: 'drain';
    amount: number;
    /** Percent of the damage healed back to the user; defaults to `100`. */
    drainPercent?: number;
}

/** A deliberately unpredictable effect (`mystery_potion`). */
export interface ItemMysteryEffect extends ItemEffectBase {
    type: 'mystery';
    turns: number | null;
}

/** One effect an item applies. */
export type ItemEffect =
    | ItemRestoreEffect
    | ItemRestorePercentEffect
    | ItemDamageEffect
    | ItemStatusEffect
    | ItemReviveEffect
    | ItemCleanseEffect
    | ItemDrainEffect
    | ItemMysteryEffect;

/** A static item definition from the YAML catalogue. */
export interface ItemDefinition {
    id: string;
    name: string;
    description: string;
    category: ItemCategory;
    /** Default target scope for this item's effects. */
    target: ItemTargetRule;
    /** Effects applied when the item is used. Empty for a key item. */
    effects: ItemEffect[];
    /** Whether the item can be used in combat. */
    usable_in_combat: boolean;
    /** Whether the item can be used outside combat. */
    usable_outside_combat: boolean;
    /** Whether using the item consumes it. */
    consumed_on_use: boolean;
    /** Maximum stack size; `null` means unlimited. */
    max_stack: number | null;
    /**
     * Open consumable type a weapon can feed on (`arrow`), matched against
     * `WeaponAmmo.item_type`. `null` when the item is not ammunition; ammo
     * items carry no effects and are never used directly.
     */
    item_type?: string | null;
}

// ---------------------------------------------------------------------------
// Inventory state
// ---------------------------------------------------------------------------

/** Quantity of one item in an inventory. */
export type InventorySlot = number;

/** An entity's inventory: item id to quantity. */
export type EntityInventoryState = Record<string, InventorySlot>;

// ---------------------------------------------------------------------------
// Combat item use
// ---------------------------------------------------------------------------

/** Request to use an item in combat. */
export interface CombatItemUseRequest {
    item_id: string;
    /** Required for the single-target rules (`one_ally`, `one_enemy`, `dead_ally`). */
    target_id?: string;
}

/** Result of using an item in combat. */
export interface CombatItemUseResult {
    success: boolean;
    item_id: string;
    actor_id: string;
    target_id: string | null;
    effects_applied: ItemEffect[];
    /** Everything the item did to the fight, in order (resource, status, deaths). */
    events: CombatEvent[];
    quantity_remaining: number;
    /** Whether the item was removed from the inventory. */
    consumed: boolean;
    error: InventoryError | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Stable error codes for inventory operations. */
export type InventoryErrorCode =
    | 'item_not_found'
    | 'insufficient_quantity'
    | 'item_not_usable_in_combat'
    | 'item_not_usable_outside_combat'
    | 'inventory_full'
    | 'invalid_quantity'
    | 'entity_not_found'
    | 'target_required'
    | 'invalid_target'
    | 'no_target_available'
    | 'max_stack_exceeded';

/** A failure the caller can act on. */
export interface InventoryError {
    code: InventoryErrorCode;
    message: string;
    details?: Record<string, unknown>;
}

/** Discriminated result used instead of throwing. */
export type InventoryResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: InventoryError };
