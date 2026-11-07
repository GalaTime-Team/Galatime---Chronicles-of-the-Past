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

/** Renumbers the slots of a line so they run 0, 1, 2 … without gaps. */
function compactLine(units: readonly CombatUnit[], side: CombatSide, line: CombatLine): void {
    unitsInLine(units, side, line).forEach((unit, index) => {
        unit.slot = index;
    });
}

/**
 * Whether the move would leave a side with nobody alive in its front line.
 *
 * A unit never counts as its own company: the mover and the fallen are
 * ignored. A living swap partner is not — the swap puts it in the mover's
 * place, so it can hold the line on its own.
 */
export function wouldLeaveFrontLineEmpty(
    units: readonly CombatUnit[],
    unit: CombatUnit,
    line: CombatLine,
    swapWith: CombatUnit | null = null,
): boolean {
    if (unit.status !== 'alive' || unit.line !== 'front' || line !== 'rear') return false;

    const anotherAliveFrontUnit = units.some((candidate) =>
        candidate.id !== unit.id
        && candidate.id !== swapWith?.id
        && candidate.side === unit.side
        && candidate.line === 'front'
        && candidate.status === 'alive',
    );
    if (anotherAliveFrontUnit) return false;

    return !(swapWith
        && swapWith.side === unit.side
        && swapWith.status === 'alive');
}

/**
 * Moves a unit to another battle line.
 *
 * The slot numbers of both lines are closed up afterwards, so the formation
 * board never draws a gap where the unit used to stand. A swap trades places
 * with another unit instead of just stepping across.
 *
 * Returns `false` when the move cannot happen — the destination line is full,
 * or the move would leave the front line with no living unit — so the caller
 * can leave the unit where it is.
 */
export function moveUnitToLine(
    units: readonly CombatUnit[],
    unit: CombatUnit,
    line: CombatLine,
    swapWith: CombatUnit | null = null,
): boolean {
    if (swapWith && swapWith.id !== unit.id) {
        if (wouldLeaveFrontLineEmpty(units, unit, swapWith.line, swapWith)) return false;

        const unitLine = unit.line;
        const unitSlot = unit.slot;
        unit.line = swapWith.line;
        unit.slot = swapWith.slot;
        swapWith.line = unitLine;
        swapWith.slot = unitSlot;
        compactLine(units, unit.side, unit.line);
        compactLine(units, unit.side, swapWith.line);
        return true;
    }

    if (unit.line === line) return true;

    if (!canPlaceInLine(units, unit.side, line)) return false;
    if (wouldLeaveFrontLineEmpty(units, unit, line)) return false;

    const origin = unit.line;
    unit.line = line;
    compactLine(units, unit.side, origin);
    unit.slot = unitsInLine(units, unit.side, line).filter((other) => other.id !== unit.id).length;
    compactLine(units, unit.side, line);

    return true;
}
