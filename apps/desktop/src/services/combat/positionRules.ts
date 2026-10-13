/**
 * Positioning rules.
 *
 * Where a unit stands decides the damage multiplier of its hits and what it can
 * reach. The rules are pure so the presentation layer can ask the same questions
 * the resolver answers (preview a modifier, grey out an action).
 */

import {
    MAX_UNITS_PER_LINE,
    POSITION_DAMAGE_MODIFIERS,
    RANGE_ALLOWED_FROM_LINE,
    RANGE_REACHES_LINE,
} from '../../constants/CombatConstants';
import type { CombatLine, CombatRange, CombatSide, CombatUnit } from '../../types/CombatType';

/**
 * Damage multiplier for a hit from one line into another.
 *
 * Same-side targets (heals, buffs, an ally hit by an AoE) are never penalised;
 * the plan's penalties only describe cross-battlefield attacks.
 */
export function positionDamageModifier(
    attackerLine: CombatLine,
    targetLine: CombatLine,
    sameSide: boolean,
): number {
    if (sameSide) return 1;
    return POSITION_DAMAGE_MODIFIERS[attackerLine][targetLine];
}

/** Whether a unit standing in `line` is allowed to use an action of this reach. */
export function isRangeAllowedFromLine(range: CombatRange, line: CombatLine): boolean {
    return RANGE_ALLOWED_FROM_LINE[range].includes(line);
}

/** Whether an action of this reach can cross into the given enemy line. */
export function rangeReachesLine(range: CombatRange, line: CombatLine): boolean {
    return RANGE_REACHES_LINE[range].includes(line);
}

/** The units of one side standing in one line, in slot order. */
export function unitsInLine(
    units: readonly CombatUnit[],
    side: CombatSide,
    line: CombatLine,
): CombatUnit[] {
    return units
        .filter((unit) => unit.side === side && unit.line === line)
        .sort((a, b) => a.slot - b.slot);
}

/** Whether a line has room for another unit. */
export function canPlaceInLine(
    units: readonly CombatUnit[],
    side: CombatSide,
    line: CombatLine,
): boolean {
    return unitsInLine(units, side, line).length < MAX_UNITS_PER_LINE;
}
