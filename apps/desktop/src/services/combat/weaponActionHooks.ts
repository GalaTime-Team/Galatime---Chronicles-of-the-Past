/**
 * Post-action weapon hooks.
 *
 * A weapon action that has already resolved still has bookkeeping to do: bank
 * the exponential hit streak, spend a round of ammunition, and wear the
 * durability (destroying the weapon at zero). Keeping every rule here means the
 * resolver only calls one function after the attack, and the weapon state stays
 * the single place these counters live.
 *
 * The functions are tolerant: a unit with no weapon, a weapon with no durability
 * or no ammo, and an indestructible weapon all fall through untouched.
 */

import type {
    AttackResolution,
    CombatAction,
    CombatEvent,
    CombatRandom,
    CombatUnit,
} from '../../types/CombatType';
import type { WeaponRuntimeState } from '../../types/WeaponType';
import { consumeAmmoUnit } from '../inventory/ammoService';

/** Applies every post-action weapon rule; returns the feedback events. */
export function applyWeaponActionHooks(
    unit: CombatUnit,
    action: CombatAction,
    resolutions: readonly AttackResolution[],
    random: CombatRandom,
    /** The actor's live inventory; ammo spent leaves it when provided. */
    unitInventory?: Record<string, number>,
): CombatEvent[] {
    const weapon = unit.weapon;
    if (!weapon || action.kind !== 'weapon') return [];

    const primaryTargetId = resolutions[0]?.targetId ?? null;
    const landed = resolutions.some((resolution) => resolution.isHit);

    bankStacks(weapon, action, landed, primaryTargetId);

    return [
        ...spendAmmo(unit, action, random, unitInventory),
        ...spendDurability(unit, action, random),
    ];
}

/** Extends or resets an exponential weapon's consecutive-hit streak. */
function bankStacks(
    weapon: WeaponRuntimeState,
    action: CombatAction,
    landed: boolean,
    targetId: string | null,
): void {
    if (!action.weapon?.exponential) return;

    if (!landed) {
        weapon.stacks = 0;
        weapon.stackTargetId = null;
        return;
    }

    if (weapon.stackTargetId === targetId && targetId !== null) {
        weapon.stacks += 1;
    } else {
        weapon.stacks = 1;
        weapon.stackTargetId = targetId;
    }
}

/**
 * Spends a round of ammunition for a ranged shot.
 *
 * `consume_chance` is the weapon's own chance to *spend* a unit (Fairy Bow is
 * `0.6`, so 40% of shots keep the arrow). A throw never spends its ammo — the
 * weapon itself is the projectile.
 *
 * When the actor's inventory is available the spent unit also leaves it —
 * matching either the pinned item id or every item of the ammo's `item_type` —
 * so a fight's shots show up in the holder's quiver once it is flushed back.
 */
function spendAmmo(
    unit: CombatUnit,
    action: CombatAction,
    random: CombatRandom,
    unitInventory?: Record<string, number>,
): CombatEvent[] {
    const weapon = unit.weapon;
    if (!weapon || !action.weapon?.ammo || action.weapon.throw) return [];
    if (weapon.ammoItem === null && weapon.ammoType === null) return [];
    // An empty quiver spends nothing: the availability gate should have kept
    // the shot from happening, and the inventory must not pay for it either.
    if (weapon.ammo === null || weapon.ammo <= 0) return [];

    const chance = Math.max(0, Math.min(1, weapon.ammoConsumeChance));
    const consumed = random() < chance;
    let itemId = weapon.ammoItem ?? weapon.ammoType ?? 'ammo';

    if (consumed) {
        weapon.ammo = Math.max(0, weapon.ammo - 1);
        const spent = unitInventory ? consumeAmmoUnit(unitInventory, action.weapon.ammo) : null;
        if (spent) itemId = spent;
    }

    return [{
        type: 'weapon_ammo_changed',
        unitId: unit.id,
        itemId,
        consumed,
        remaining: weapon.ammo,
    }];
}

/** Wears the weapon's durability, destroying it at zero (unless it returns). */
function spendDurability(
    unit: CombatUnit,
    action: CombatAction,
    random: CombatRandom,
): CombatEvent[] {
    const weapon = unit.weapon;
    if (!weapon || weapon.durability === null) return [];

    // A thrown weapon that comes back was never at risk: no wear, no shatter.
    if (action.weapon?.throw && action.weapon.returns) return [];

    if (weapon.breakChance > 0 && random() < weapon.breakChance) {
        return breakWeapon(unit, weapon);
    }

    if (weapon.indestructible || weapon.wear <= 0) return [];

    const previous = weapon.durability;
    const next = Math.max(0, previous - weapon.wear);
    if (next === previous) return [];

    weapon.durability = next;
    const events: CombatEvent[] = [{
        type: 'weapon_durability_changed',
        unitId: unit.id,
        weaponId: weapon.id,
        previous,
        next,
    }];

    if (next <= 0) events.push(...breakWeapon(unit, weapon));
    return events;
}

/**
 * Destroys a weapon: it stops being an option and leaves the HUD.
 *
 * `unit.actions` is reassigned rather than mutated because the list is shared
 * between every unit of the same blueprint — filtering in place would disarm the
 * others too.
 */
function breakWeapon(unit: CombatUnit, weapon: WeaponRuntimeState): CombatEvent[] {
    if (weapon.durability !== null) weapon.durability = 0;
    weapon.stacks = 0;
    weapon.stackTargetId = null;

    const broken = new Set(weapon.actionIds);
    unit.actions = unit.actions.filter((action) => !broken.has(action.id));

    return [{ type: 'weapon_broken', unitId: unit.id, weaponId: weapon.id, weaponName: weapon.name }];
}
