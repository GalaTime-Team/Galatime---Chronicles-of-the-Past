/**
 * Carried weapons: resolving what a unit brings into a fight, and swapping which
 * one is equipped while the fight runs.
 *
 * A carried weapon is a template built once per catalogue weapon (cached through
 * the blueprint). Each unit gets its own clone, so durability and ammo are never
 * shared between two holders, or between two weapons the same holder carries.
 *
 * Equipping adds a weapon's actions, stat modifiers and passives to the unit, and
 * removes whatever the previously equipped weapon had added. The rest of the unit
 * (skills, universal movements, the entity's own abilities) is left alone.
 */

import type { CarriedWeapon, CombatUnit } from '../../types/CombatType';
import type { WeaponReference, WeaponRuntimeState } from '../../types/WeaponType';
import { resolveWeaponReference } from '../weaponCatalogService';
import { createAbilityInstances } from './abilityFactory';
import { createCombatActionFromWeapon, createWeaponRuntimeState } from './actionFactory';
import { createWeaponStatEffect } from './unitFactory';

/** Prefix of every effect a weapon adds, so a swap can find and remove them. */
const WEAPON_EFFECT_PREFIX = 'weapon:';

/**
 * Builds the template for one weapon reference (a catalogue id or an inline block).
 *
 * `null` when the reference does not resolve to a weapon.
 */
export async function resolveCarriedWeapon(reference: WeaponReference): Promise<CarriedWeapon | null> {
    const definition = await resolveWeaponReference(reference);
    if (!definition) return null;

    const actions = createCombatActionFromWeapon(definition);
    const state = createWeaponRuntimeState(definition, actions.map((action) => action.id));

    return {
        weaponId: definition.id,
        state,
        actions,
        stats: definition.stats ?? null,
        abilities: createAbilityInstances(Array.isArray(definition.abilities) ? definition.abilities : []),
    };
}

/**
 * Copies a template for one unit: its own state and its own ability trigger state.
 *
 * Actions and stat deltas are immutable, so they are shared by reference.
 */
export function cloneCarriedWeapon(weapon: CarriedWeapon): CarriedWeapon {
    return {
        ...weapon,
        state: cloneWeaponState(weapon.state),
        abilities: weapon.abilities.map((ability) => ({ ...ability })),
    };
}

function cloneWeaponState(state: WeaponRuntimeState): WeaponRuntimeState {
    return {
        ...state,
        actionIds: [...state.actionIds],
        flags: [...state.flags],
    };
}

/**
 * Whether a weapon can be equipped right now.
 *
 * A weapon that has worn down to nothing is broken: it stays in the unit's carried
 * list, but it cannot be drawn again for the rest of the fight.
 */
export function isWeaponUsable(weapon: CarriedWeapon): boolean {
    const { durability, indestructible } = weapon.state;
    return indestructible || durability === null || durability > 0;
}

/**
 * Equips one of the unit's carried weapons, replacing the one currently in hand.
 *
 * The caller is responsible for checking the weapon belongs to the unit and is
 * usable; this function only rewrites the unit.
 */
export function equipCarriedWeapon(unit: CombatUnit, weapon: CarriedWeapon): void {
    const previous = unit.weapon
        ? unit.carriedWeapons.find((carried) => carried.state === unit.weapon)
        : undefined;

    // Drop what the previous weapon added: its passives and its stat effect.
    const previousAbilities = new Set(previous?.abilities ?? []);
    unit.abilities = unit.abilities.filter((ability) => !previousAbilities.has(ability));
    unit.effects = unit.effects.filter((effect) => !effect.effectId.startsWith(WEAPON_EFFECT_PREFIX));

    // Swings go in where the weapons already sit: after the skills, before the
    // universal movements, so the extra-movement cards keep their order.
    const kept = unit.actions.filter((action) => !action.weapon);
    const firstMovement = kept.findIndex((action) => action.kind !== 'skill');
    const insertAt = firstMovement < 0 ? kept.length : firstMovement;
    unit.actions = [...kept.slice(0, insertAt), ...weapon.actions, ...kept.slice(insertAt)];

    unit.abilities = [...unit.abilities, ...weapon.abilities];
    if (weapon.stats && Object.keys(weapon.stats).length > 0) {
        unit.effects.push(createWeaponStatEffect(weapon.weaponId, weapon.stats));
    }

    unit.weapon = weapon.state;
}
