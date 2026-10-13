import type {
    DialogueError,
    DialogueErrorCode,
    DialogueIssue,
    DialogueIssueSeverity,
    DialogueSegment,
} from '../types/DialogueType';

/**
 * Pure helpers shared by the dialogue and world-state services.
 *
 * Error and issue construction lives here so both service folders can build
 * consistent values without depending on each other.
 */

/** Builds a failure value. `details` is omitted entirely when not supplied. */
export function createDialogueError(
    code: DialogueErrorCode,
    message: string,
    details?: Record<string, unknown>,
): DialogueError {
    return details ? { code, message, details } : { code, message };
}

/** Builds a validation finding. `path` is omitted entirely when not supplied. */
export function createDialogueIssue(
    severity: DialogueIssueSeverity,
    code: string,
    message: string,
    path?: string,
): DialogueIssue {
    return path ? { severity, code, message, path } : { severity, code, message };
}

/** Constrains a value to an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Returns the value only when it is a usable number.
 *
 * Used by numeric effects so a malformed state entry degrades to a default
 * instead of propagating `NaN` through the rest of the conversation.
 */
export function toFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reads a state entry as a yes/no answer.
 *
 * This is what lets a boolean literal ask "is this entry there?" instead of
 * having to name the value that happens to be stored. It matters most for
 * inventory, where the entry is always a count: `inventory.caixa = true` has to
 * mean "the player is holding the box" for a count of `1`, and `= false` has to
 * cover `0`, an item that was taken away and an item that was never given —
 * three states that are the same answer to the question but three different
 * numbers. A flag is a truth already, and passes straight through.
 *
 * Absence counts as "no": an entry that does not exist is not something the
 * player has.
 */
export function toStateBoolean(value: unknown): boolean {
    if (value === null || value === undefined) {
        return false;
    }

    if (Array.isArray(value)) {
        return value.length > 0;
    }

    if (typeof value === 'string') {
        return value !== '';
    }

    return Boolean(value);
}

/**
 * Accepts both text shapes the format allows and returns segments.
 *
 * A bare string is the shorthand a hand-written file uses for a question; a
 * segment list is what a line has always been. Normalising once, at the edge,
 * means no consumer ever has to branch on the shape it was given.
 */
export function normalizeSegments(text: string | DialogueSegment[]): DialogueSegment[] {
    if (typeof text === 'string') {
        return text === '' ? [] : [{ type: 'text', value: text }];
    }

    return text;
}
