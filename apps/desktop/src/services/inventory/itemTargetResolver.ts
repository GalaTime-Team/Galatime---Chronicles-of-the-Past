/**
 * Item target resolution.
 *
 * Turns an item's authored {@link ItemTargetRule} into the concrete units it
 * addresses in one fight. Owns the ally/dead-ally reading the combat target
 * vocabulary does not model, so an item can heal a friend without being mistaken
 * for a weapon.
 *
 * Single Responsibility: this module only resolves a rule to units. Applying an
 * effect lives in `itemEffectApplier`.
 */

import type { CombatState, CombatUnit } from '../../types/CombatType';
import type { ItemTargetRule } from '../../types/InventoryType';

/** Whether a rule addresses one unit, so the caller must name it. */
export function isSingleTargetRule(rule: ItemTargetRule): boolean {
    return rule === 'one_ally' || rule === 'one_enemy' || rule === 'dead_ally';
}

/**
 * Units a rule addresses, given the actor and the caller's chosen target.
 *
 * `self` and the team scopes ignore the chosen target; a single-target rule
 * returns the chosen unit only when it is legal (right side, right life state),
 * and an empty list otherwise.
 */
export function resolveItemTargets(
    state: CombatState,
    actor: CombatUnit,
    rule: ItemTargetRule,
    explicitTarget: CombatUnit | null,
): CombatUnit[] {
    const aliveAllies = state.units.filter((unit) => unit.side === actor.side && unit.status === 'alive');
    const aliveEnemies = state.units.filter((unit) => unit.side !== actor.side && unit.status === 'alive');
    const defeatedAllies = state.units.filter((unit) => unit.side === actor.side && unit.status !== 'alive');

    switch (rule) {
        case 'self':
            return [actor];
        case 'one_ally':
            return explicitTarget && aliveAllies.includes(explicitTarget) ? [explicitTarget] : [];
        case 'one_enemy':
            return explicitTarget && aliveEnemies.includes(explicitTarget) ? [explicitTarget] : [];
        case 'dead_ally':
            return explicitTarget && defeatedAllies.includes(explicitTarget) ? [explicitTarget] : [];
        case 'all_allies':
            return aliveAllies;
        case 'all_enemies':
            return aliveEnemies;
        case 'both_teams':
            return [...aliveAllies, ...aliveEnemies];
        default:
            return [actor];
    }
}

/**
 * Unit ids the rule may be aimed at right now.
 *
 * Empty for an untargeted rule (`self`, the team scopes): the HUD shows no
 * target picker for those. Used by the combat item picker.
 */
export function legalItemTargetIds(
    state: CombatState,
    actor: CombatUnit,
    rule: ItemTargetRule,
): string[] {
    switch (rule) {
        case 'one_ally':
            return state.units
                .filter((unit) => unit.side === actor.side && unit.status === 'alive')
                .map((unit) => unit.id);
        case 'one_enemy':
            return state.units
                .filter((unit) => unit.side !== actor.side && unit.status === 'alive')
                .map((unit) => unit.id);
        case 'dead_ally':
            return state.units
                .filter((unit) => unit.side === actor.side && unit.status !== 'alive')
                .map((unit) => unit.id);
        default:
            return [];
    }
}
