/**
 * Battlefield-wide phase overrides (Solar Eclipse).
 *
 * A fight normally keeps the hour it opened at. A skill may force the opposite
 * phase for a few rounds, and everything that reads the hour — direct damage,
 * effect magnitudes, previews and the HUD — must read the forced one instead.
 */

import type { CombatState, CombatTimePhase } from '../../types/CombatType';

/** The phase damage and effects actually see, honouring an active override. */
export function effectiveTimePhase(
    state: Pick<CombatState, 'timePhase' | 'phaseOverride'>,
): CombatTimePhase {
    return state.phaseOverride?.phase ?? state.timePhase;
}

/**
 * Forces the battlefield's phase for `rounds` rounds.
 *
 * A second override replaces the first: two eclipses do not stack, the newest
 * one wins and restarts the clock.
 */
export function setPhaseOverride(
    state: CombatState,
    phase: CombatTimePhase,
    rounds: number,
    sourceId: string,
): void {
    state.phaseOverride = {
        phase,
        rounds: Math.max(1, Math.round(rounds)),
        sourceId,
    };
}

/** Spends one round of an active override, clearing it when it runs out. */
export function tickPhaseOverride(state: CombatState): void {
    const override = state.phaseOverride;
    if (!override) return;

    const rounds = override.rounds - 1;
    state.phaseOverride = rounds > 0 ? { ...override, rounds } : null;
}
