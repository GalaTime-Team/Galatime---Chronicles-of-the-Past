/**
 * Positioning queries.
 *
 * The presentation layer asks the same questions the resolver answers: how much
 * a line swap costs, whether a reach is allowed, and how many units a lane
 * holds. Keeping the answers here stops the HUD from re-deriving the rules.
 */

import { MAX_UNITS_PER_LINE, POSITION_DAMAGE_MODIFIERS } from '../constants/CombatConstants';
import {
    canPlaceInLine,
    isRangeAllowedFromLine,
    positionDamageModifier,
    rangeReachesLine,
    unitsInLine,
} from '../services/combat/positionRules';
import { legalTargetIds } from '../services/combat/targetResolver';
import type {
    CombatAction,
    CombatLine,
    CombatRange,
    CombatSide,
    CombatState,
    CombatUnit,
} from '../types/CombatType';

/** Damage multiplier when an attacker in one line hits a unit in another. */
export function getPositionDamageModifier(
    attackerLine: CombatLine,
    targetLine: CombatLine,
    sameSide: boolean,
): number {
    return positionDamageModifier(attackerLine, targetLine, sameSide);
}

/** Whether a unit in `line` may use an action of this reach. */
export function isCombatRangeAllowedFromLine(range: CombatRange, line: CombatLine): boolean {
    return isRangeAllowedFromLine(range, line);
}

/** Whether an action of this reach can cross into an enemy line. */
export function doesCombatRangeReachLine(range: CombatRange, line: CombatLine): boolean {
    return rangeReachesLine(range, line);
}

/** Units a battle line can hold. */
export function getMaxUnitsPerLine(): number {
    return MAX_UNITS_PER_LINE;
}

/** The units of one side standing in one line, in slot order. */
export function fetchUnitsInLine(
    state: CombatState,
    side: CombatSide,
    line: CombatLine,
): CombatUnit[] {
    return unitsInLine(state.units, side, line);
}

/** Whether a line still has room for another unit. */
export function hasRoomInLine(state: CombatState, side: CombatSide, line: CombatLine): boolean {
    return canPlaceInLine(state.units, side, line);
}

/** Ids of the units an action may be aimed at, position rules included. */
export function fetchLegalTargetIds(
    state: CombatState,
    actor: CombatUnit,
    action: CombatAction,
): string[] {
    return legalTargetIds(state, actor, action);
}

/** The full position-modifier table, for documentation and tooltips. */
export function getPositionDamageModifierTable(): typeof POSITION_DAMAGE_MODIFIERS {
    return POSITION_DAMAGE_MODIFIERS;
}
