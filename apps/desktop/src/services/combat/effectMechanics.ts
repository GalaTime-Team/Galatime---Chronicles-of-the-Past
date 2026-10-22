/**
 * The effects that change the battlefield rather than a number.
 *
 * Most effects move a number around: a stat, a pool of health, a status. A few
 * do something else entirely — they clean the curses off a unit, strip its
 * gifts, walk it to the other line of the field or take its last turns back.
 *
 * They live here so the action resolver only has to ask "what does this effect
 * *do*", and so the same rule is never written twice.
 */

import type { AttackEffect } from '../../types/AttackDataType';
import type { CombatEvent, CombatState, CombatUnit } from '../../types/CombatType';
import { asRecord, readBoolean, readNumber, readString } from '../../utils/combatUtils';
import {
    cleanseEffects,
    dispelEffects,
    readMoveSpec,
    readRewindSpec,
} from './effectResolver';
import { moveUnitToLine } from './positionRules';
import { rewindUnit } from './rewind';

/**
 * The curses a cleanse takes off a unit.
 *
 * `cleanse: 2` removes at most two; `cleanse_all: true` removes every one.
 */
export function applyCleanse(unit: CombatUnit, effect: AttackEffect): CombatEvent[] {
    const record = asRecord(effect) ?? {};
    const all = readBoolean(record.cleanse_all, false);
    const count = readNumber(record.cleanse, 0);

    if (!all && count <= 0) return [];

    return cleanseEffects(unit, { count, all });
}

/**
 * The gifts a dispel takes off a unit.
 *
 * `dispel: 1` removes at most one; `dispel_all: true` removes every one;
 * `dispel_status` removes one named status whatever its polarity.
 */
export function applyDispel(unit: CombatUnit, effect: AttackEffect): CombatEvent[] {
    const record = asRecord(effect) ?? {};
    const statusId = readString(record.dispel_status, '');
    const all = readBoolean(record.dispel_all, false);
    const count = readNumber(record.dispel, 0);

    if (!statusId && !all && count <= 0) return [];

    return dispelEffects(unit, { count, all, statusId: statusId || undefined });
}

/**
 * Walks a unit to the line the effect names.
 *
 * `who` decides whether the caster or the target moves; `to_line` decides
 * where they land, and `other` means "the line they are not in". The move is
 * refused when the destination line is full — nobody walks off the field.
 */
export function applyMove(
    state: CombatState,
    actor: CombatUnit,
    unit: CombatUnit,
    effect: AttackEffect,
): CombatEvent[] {
    const spec = readMoveSpec(effect);
    if (!spec) return [];

    const mover = spec.who === 'self' ? actor : unit;
    if (mover.status !== 'alive') return [];

    const destination = spec.toLine === 'other'
        ? (mover.line === 'front' ? 'rear' : 'front')
        : spec.toLine;

    const swapWith = spec.swapWithCaster && actor.id !== mover.id ? actor : null;
    const previousLine = mover.line;
    const previousSlot = mover.slot;

    if (!moveUnitToLine(state.units, mover, destination, swapWith)) return [];

    if (mover.line === previousLine && mover.slot === previousSlot && !swapWith) return [];

    return [{ type: 'unit_line_changed', unitId: mover.id, line: mover.line, slot: mover.slot }];
}

/**
 * Takes a unit's last turns back.
 *
 * The pools named by the effect go back to what they were, and the statuses of
 * the rewound turns are undone with them.
 */
export function applyRewind(unit: CombatUnit, effect: AttackEffect): CombatEvent[] {
    const spec = readRewindSpec(effect);
    if (!spec) return [];

    return rewindUnit(unit, spec);
}
