/**
 * The world clock.
 *
 * One hour, shared by everything that asks "what time is it?" — the dialogue
 * engine when it reads `time.hour`, and the combat engine when a fight opens
 * and has to decide whether the sun is up.
 *
 * The clock is deliberately *not* part of `WorldState`: that slice belongs to
 * the dialogue engine, which creates a fresh copy for every conversation. A
 * fight needs the hour of the world it happens in, and the world outlives the
 * conversation that described it.
 */

import { DAY_START_HOUR, NIGHT_START_HOUR } from '../../constants/CombatConstants';
import type { CombatTimePhase } from '../../types/CombatType';

/** The hour the world starts at: mid-morning, so the sun is up. */
const DEFAULT_WORLD_HOUR = 10;

let currentHour = DEFAULT_WORLD_HOUR;

/** The current hour of the world, in the 24-hour clock (0 … 23). */
export function getWorldHour(): number {
    return currentHour;
}

/**
 * Moves the world clock to `hour`.
 *
 * The hour wraps around the day, so 25 is 1 and -1 is 23.
 */
export function setWorldHour(hour: number): void {
    if (!Number.isFinite(hour)) return;
    currentHour = ((Math.round(hour) % 24) + 24) % 24;
}

/** Puts the clock back where it started. */
export function resetWorldClock(): void {
    currentHour = DEFAULT_WORLD_HOUR;
}

/**
 * Whether the sun is up at `hour`.
 *
 * Daytime runs from {@link DAY_START_HOUR} to {@link NIGHT_START_HOUR}; the
 * two boundary hours belong to the night, so a fight that starts exactly at
 * dusk is a fight at dusk.
 */
export function timePhaseForHour(hour: number): CombatTimePhase {
    const normalized = ((Math.round(hour) % 24) + 24) % 24;
    return normalized >= DAY_START_HOUR && normalized < NIGHT_START_HOUR ? 'day' : 'night';
}

/** The phase the world is in right now. */
export function currentTimePhase(): CombatTimePhase {
    return timePhaseForHour(currentHour);
}

/**
 * The hour a fight should use.
 *
 * An explicit hour wins over the clock, so a scripted fight can happen at
 * dusk without moving the world.
 */
export function resolveFightHour(hour?: number): number {
    if (hour !== undefined && Number.isFinite(hour)) {
        return ((Math.round(hour) % 24) + 24) % 24;
    }
    return currentHour;
}
