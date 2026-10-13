/**
 * Pure helpers shared by the combat services.
 *
 * Error construction and the tolerant readers live here so every rule module
 * can build consistent values without depending on each other. Catalogue YAML
 * is untyped, so the readers degrade to a fallback instead of propagating
 * `NaN`/`undefined` through a fight.
 */

import type { CombatError, CombatErrorCode, CombatResult } from '../types/CombatType';

/** Builds a failure value. `details` is omitted entirely when not supplied. */
export function createCombatError(
    code: CombatErrorCode,
    message: string,
    details?: Record<string, unknown>,
): CombatError {
    return details ? { code, message, details } : { code, message };
}

/** Wraps a value in a successful result. */
export function combatOk<T>(data: T): CombatResult<T> {
    return { ok: true, data };
}

/** Wraps an error in a failed result. */
export function combatFail<T>(error: CombatError): CombatResult<T> {
    return { ok: false, error };
}

/** Constrains a value to an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/** Returns the value only when it is a usable number. */
export function readNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Returns the value only when it is a non-empty string. */
export function readString(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** Returns the value only when it is a boolean. */
export function readBoolean(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

/**
 * Reads a probability as a fraction in `0 … 1`.
 *
 * Authored content writes chances both ways (`0.25` and `25`), so a value above
 * one is read as a percentage. Non-numbers fall back untouched.
 */
export function readChance(value: unknown, fallback = 1): number {
    const raw = readNumber(value, Number.NaN);
    if (!Number.isFinite(raw)) return fallback;
    if (raw <= 0) return 0;
    return clamp(raw <= 1 ? raw : raw / 100, 0, 1);
}

/** Narrows an object entry to a record so unknown YAML can be indexed safely. */
export function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/**
 * Reads a damage-power specification.
 *
 * Accepts a plain number, `{ kind: 'fixed', value }`, or `{ min, max }`, which
 * are the three shapes the catalogue uses.
 */
export function readPower(value: unknown): number {
    const direct = readNumber(value, Number.NaN);
    if (Number.isFinite(direct)) return direct;

    const spec = asRecord(value);
    if (!spec) return 0;

    const fixed = readNumber(spec.value, Number.NaN);
    if (Number.isFinite(fixed)) return fixed;

    const min = readNumber(spec.min, Number.NaN);
    const max = readNumber(spec.max, Number.NaN);
    if (Number.isFinite(min) && Number.isFinite(max)) return (min + max) / 2;

    return 0;
}

/** Reads a `[min, max]` multiplier pair, returning `null` when absent. */
export function readVariance(value: unknown): [number, number] | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const min = readNumber(value[0], Number.NaN);
    const max = readNumber(value[1], Number.NaN);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return [Math.min(min, max), Math.max(min, max)];
}

/** Picks only the known stat keys out of an authored `buff`/`debuff` record. */
export function readStatDelta(value: unknown): Record<string, number> | null {
    const record = asRecord(value);
    if (!record) return null;
    const delta: Record<string, number> = {};
    for (const [key, raw] of Object.entries(record)) {
        const amount = readNumber(raw, Number.NaN);
        if (Number.isFinite(amount)) delta[key] = amount;
    }
    return Object.keys(delta).length > 0 ? delta : null;
}

/** Appends feedback to the log, trimming the oldest entries past the cap. */
export function trimLog<T>(log: T[], maxEntries: number): void {
    const overflow = log.length - maxEntries;
    if (overflow > 0) log.splice(0, overflow);
}
