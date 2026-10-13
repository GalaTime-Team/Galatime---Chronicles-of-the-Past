/**
 * Turns the events of one resolved combat step into a short choreography.
 *
 * The backend resolves an action in a single call and hands back both the new state and
 * the events it produced, so the arena cannot watch the fight unfold on its own. This
 * module is the missing narration: it reads those events once and describes *what* to
 * show (who lunged, who was struck, for how much, in what element, who died), leaving
 * `CombatEncounter` to decide *when* each beat plays and the components to draw them.
 */

import {
    ARENA_IMPACT_MS,
    ARENA_QUIET_TOTAL_MS,
    ARENA_SHAKE_RATIO,
    ARENA_TOTAL_MS,
} from '../../../../constants/CombatAnimationConstants';
import type { CombatEvent, CombatState, CombatUnit } from '../../../../types/CombatType';

/** One unit taking damage or being healed by the action. */
export interface ArenaHit {
    targetId: string;
    /** Damage dealt (positive) or health restored, already resolved. */
    amount: number;
    kind: 'damage' | 'heal';
    /** `false` when the blow missed; the reaction is then a "MISS", not a number. */
    isHit: boolean;
    /** Element of the action, for the flash/spark tint. */
    elementId: string | null;
    /** Element efficacy (`x0`…`x4`), kept for a possible emphasis later. */
    multiplier: number;
    /** The hit brought the target to 0. */
    fatal: boolean;
}

/** A status effect landing on a unit. */
export interface ArenaStatusBeat {
    unitId: string;
    label: string | null;
}

/** Damage thrown back at the unit that dealt it. */
export interface ArenaReflectBeat {
    unitId: string;
    amount: number;
}

/** Everything one resolved step should show on the board. */
export interface ArenaSequence {
    /** Monotonic id, so a component can tell one sequence from the next. */
    id: number;
    actorId: string | null;
    actorName: string | null;
    actionName: string | null;
    /** When the blow lands, in ms from the start of the sequence. */
    impactAtMs: number;
    /** When the whole sequence is over and the next turn may begin. */
    totalMs: number;
    hits: ArenaHit[];
    statuses: ArenaStatusBeat[];
    defeated: string[];
    reflected: ArenaReflectBeat[];
    summoned: string[];
    transformed: string[];
    /** The board should jolt: a fatal blow, or one that took a huge share of a health pool. */
    shake: boolean;
}

/** The element of an action, read off whichever unit still carries it. */
function findActionElement(units: readonly CombatUnit[], actionId: string): string | null {
    for (const unit of units) {
        const action = unit.actions.find((candidate) => candidate.id === actionId);
        if (action) return action.elementId || null;
    }
    return null;
}

/**
 * Builds the choreography for one resolved step.
 *
 * Returns `null` when the step has nothing to show — an empty event list, or events that
 * only move bookkeeping (a turn starting, a cooldown ticking) — in which case the caller
 * applies the new state immediately instead of waiting on an animation.
 */
export function buildArenaSequence(
    id: number,
    events: readonly CombatEvent[],
    state: CombatState,
): ArenaSequence | null {
    const actionUsed = events.find((event) => event.type === 'action_used');

    const hits: ArenaHit[] = [];
    const statuses: ArenaStatusBeat[] = [];
    const defeated: string[] = [];
    const reflected: ArenaReflectBeat[] = [];
    const summoned: string[] = [];
    const transformed: string[] = [];
    let shake = false;

    for (const event of events) {
        switch (event.type) {
            case 'attack_resolved': {
                const { resolution } = event;
                const target = state.units.find((unit) => unit.id === resolution.targetId);
                const maxHp = target?.stats.maxHp ?? 0;
                const fatal = resolution.targetHpAfter <= 0;

                if (fatal || (maxHp > 0 && resolution.finalDamage >= maxHp * ARENA_SHAKE_RATIO)) {
                    shake = true;
                }

                hits.push({
                    targetId: resolution.targetId,
                    amount: resolution.finalDamage,
                    kind: 'damage',
                    isHit: resolution.isHit,
                    elementId: findActionElement(state.units, resolution.actionId),
                    multiplier: resolution.elementMultiplier,
                    fatal,
                });
                break;
            }
            case 'healed': {
                const { resolution } = event;
                hits.push({
                    targetId: resolution.targetId,
                    amount: resolution.amount,
                    kind: 'heal',
                    isHit: true,
                    elementId: findActionElement(state.units, resolution.actionId),
                    multiplier: 1,
                    fatal: false,
                });
                break;
            }
            case 'effect_applied':
                statuses.push({ unitId: event.unitId, label: event.statusEffect });
                break;
            case 'unit_defeated':
                if (!defeated.includes(event.unitId)) defeated.push(event.unitId);
                break;
            case 'damage_reflected':
                reflected.push({ unitId: event.sourceId, amount: event.amount });
                break;
            case 'unit_summoned':
                if (!summoned.includes(event.unitId)) summoned.push(event.unitId);
                break;
            case 'unit_transformed':
                if (!transformed.includes(event.unitId)) transformed.push(event.unitId);
                break;
            default:
                break;
        }
    }

    const actorId = actionUsed?.actorId ?? null;
    const actorName = actorId
        ? state.units.find((unit) => unit.id === actorId)?.name ?? null
        : null;

    const worthShowing = actionUsed !== undefined
        || hits.length > 0
        || statuses.length > 0
        || defeated.length > 0
        || reflected.length > 0
        || summoned.length > 0
        || transformed.length > 0;

    if (!worthShowing) return null;

    // Nothing to react to (a brace, a reposition): the actor's motion is the whole beat.
    const quiet = hits.length === 0
        && statuses.length === 0
        && defeated.length === 0
        && reflected.length === 0
        && summoned.length === 0
        && transformed.length === 0;

    return {
        id,
        actorId,
        actorName,
        actionName: actionUsed?.actionName ?? null,
        impactAtMs: ARENA_IMPACT_MS,
        totalMs: quiet ? ARENA_QUIET_TOTAL_MS : ARENA_TOTAL_MS,
        hits,
        statuses,
        defeated,
        reflected,
        summoned,
        transformed,
        shake,
    };
}

/** The hit a unit took in a sequence, if any. */
export function hitFor(
    sequence: ArenaSequence | null | undefined,
    unitId: string,
): ArenaHit | undefined {
    return sequence?.hits.find((hit) => hit.targetId === unitId);
}
