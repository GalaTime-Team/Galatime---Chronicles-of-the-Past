/**
 * Initiative and turn progression.
 *
 * Turn frequency is proportional to speed. Every living unit banks its speed at
 * the start of a round; a turn costs {@link SPEED_PER_TURN} points, so a unit
 * with speed 60 acts three times while one with speed 20 acts once. What a unit
 * does not spend carries into the next round, so a speed that does not divide
 * evenly still keeps its edge.
 *
 * The result is a *queue*, not a roster: a unit that acts several times appears
 * several times in {@link CombatState.order}, and its turns are spread evenly
 * through the round so a fast unit interleaves with a slow one instead of
 * running its turns back to back.
 *
 * Nothing here is random — a fight replays identically from the same roster.
 */

import { SPEED_PER_TURN } from '../../constants/CombatConstants';
import type { CombatState, CombatTurnGauges, CombatUnit } from '../../types/CombatType';
import { effectiveStats } from './effectResolver';

/** One scheduled turn, and where in the round it falls. */
interface QueuedTurn {
    unitId: string;
    /** Fraction of the round at which the turn happens, in `[0, 1)`. */
    position: number;
    unit: CombatUnit;
}

/** A round's turn queue, plus the speed each unit banks towards the next one. */
export interface TurnOrderPlan {
    /** Unit ids in the order they act; a faster unit repeats. */
    order: string[];
    /** Speed left over per unit, to be spent in the following round. */
    gauges: CombatTurnGauges;
}

/**
 * Builds the turn queue for one round from the units still standing.
 *
 * Every living unit acts at least once, so a slow unit is never skipped; from
 * there a unit earns one extra turn per {@link SPEED_PER_TURN} points of speed.
 * Exact ties resolve towards the player (allies, front line, lower slot) so a
 * round is reproducible.
 */
export function planTurnOrder(
    units: readonly CombatUnit[],
    gauges: CombatTurnGauges = {},
): TurnOrderPlan {
    const living = units.filter((unit) => unit.status === 'alive');
    const banked: CombatTurnGauges = {};
    const queued: QueuedTurn[] = [];

    for (const unit of living) {
        const total = (gauges[unit.id] ?? 0) + Math.max(0, effectiveStats(unit).speed);
        const turns = Math.max(1, Math.floor(total / SPEED_PER_TURN));
        banked[unit.id] = Math.max(0, total - turns * SPEED_PER_TURN);

        for (let turn = 0; turn < turns; turn += 1) {
            // Evenly spread turns, so three turns of a fast unit surround the
            // single turn of a slow one rather than bunching up at the start.
            queued.push({ unitId: unit.id, position: (turn + 0.5) / turns, unit });
        }
    }

    queued.sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;

        // Same moment in the round: the faster unit goes first, then the stable
        // battle order keeps the sequence reproducible.
        const speed = effectiveStats(b.unit).speed - effectiveStats(a.unit).speed;
        if (speed !== 0) return speed;
        if (a.unit.side !== b.unit.side) return a.unit.side === 'allies' ? -1 : 1;
        if (a.unit.line !== b.unit.line) return a.unit.line === 'front' ? -1 : 1;
        if (a.unit.slot !== b.unit.slot) return a.unit.slot - b.unit.slot;
        return a.unit.id.localeCompare(b.unit.id);
    });

    return { order: applyTurnOffsets(queued.map((turn) => turn.unitId), living), gauges: banked };
}

/**
 * How many places a unit's place in the order is pushed by its live effects.
 *
 * A `turn_offset` effect moves the unit one place forward or back in the
 * queue: positive is earlier, negative is later.
 */
function turnOffsetOf(unit: CombatUnit): number {
    return unit.effects.reduce((sum, effect) => sum + (effect.turnOffset ?? 0), 0);
}

/**
 * Applies the turn offsets to the queue.
 *
 * The offset moves the unit's *first* turn in the round, which is the one the
 * order speaks about: a unit pushed back acts later, a unit pulled forward
 * acts sooner.
 */
function applyTurnOffsets(order: string[], units: readonly CombatUnit[]): string[] {
    const result = [...order];

    for (const unit of units) {
        const offset = turnOffsetOf(unit);
        if (offset === 0) continue;

        const index = result.indexOf(unit.id);
        if (index < 0) continue;

        result.splice(index, 1);
        const target = Math.min(Math.max(index + offset, 0), result.length);
        result.splice(target, 0, unit.id);
    }

    return result;
}

export interface TurnAdvance {
    /** Queue for the round the next unit acts in. */
    order: string[];
    /** Banked speed after the round that just ended. */
    gauges: CombatTurnGauges;
    turnIndex: number;
    round: number;
    /** The unit whose turn is starting, or `null` when nobody can act. */
    unit: CombatUnit | null;
    /** `true` when a new round was planned to reach `unit`. */
    wrapped: boolean;
}

/**
 * Finds the next living unit, planning a fresh round when the queue runs out.
 *
 * Defeated units are skipped wherever they sit in the queue; a round that ends
 * with survivors is replanned from whoever is left, counting their banked speed.
 */
export function advanceTurnIndex(state: CombatState): TurnAdvance {
    let turnIndex = state.turnIndex;
    let round = state.round;
    let order = state.order;
    let gauges = state.turnGauges;
    let wrapped = false;

    // One step per queued turn, plus one so a full round can still roll over.
    for (let step = 0; step <= state.order.length; step += 1) {
        turnIndex += 1;

        if (turnIndex >= order.length) {
            round += 1;
            wrapped = true;
            const plan = planTurnOrder(state.units, gauges);
            order = plan.order;
            gauges = plan.gauges;
            turnIndex = 0;
        }

        if (order.length === 0) break;

        const unit = state.units.find((candidate) => candidate.id === order[turnIndex]) ?? null;
        if (unit && unit.status === 'alive') {
            return { order, gauges, turnIndex, round, unit, wrapped };
        }
    }

    return { order, gauges, turnIndex, round, unit: null, wrapped };
}
