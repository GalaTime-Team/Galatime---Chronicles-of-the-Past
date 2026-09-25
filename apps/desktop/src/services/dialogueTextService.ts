import type {
    DialogueInteractiveTextSegment,
    DialogueSegment,
} from '../types/DialogueType';
import { DIALOGUE_PUNCTUATION_HOLDS } from '../constants/DialogueConstants';

/**
 * Turns a line's authored segments into the two things the box needs: a flat
 * string it can measure and reveal character by character, and the timing of
 * that reveal.
 *
 * Everything here is pure. The typewriter hook, the pagination hook and the
 * renderer all read the same flattening rules, so a page boundary and a typing
 * boundary can never disagree about where character 40 is.
 */

/** A run of the flattened text that came from one authored segment. */
export interface SegmentRun {
    /** Index of the segment in the authored list. */
    segmentIndex: number;
    /** First character of the flattened text this run covers, inclusive. */
    start: number;
    /** One past the last character this run covers. */
    end: number;
}

/** The flattened line plus the map back to its segments. */
export interface FlattenedText {
    /** Every text-bearing segment concatenated, `pause` segments skipped. */
    text: string;
    /** One entry per text-bearing segment, in order. */
    runs: SegmentRun[];
}

/** Segments that carry characters; a `pause` carries none. */
function isTextBearing(
    segment: DialogueSegment,
): segment is Exclude<DialogueSegment, { type: 'pause' }> {
    return segment.type !== 'pause';
}

/** Concatenates the segments and records where each one landed. */
export function flattenSegments(segments: DialogueSegment[]): FlattenedText {
    let text = '';
    const runs: SegmentRun[] = [];

    segments.forEach((segment, segmentIndex) => {
        if (!isTextBearing(segment)) {
            return;
        }

        const start = text.length;
        text += segment.value;
        runs.push({ segmentIndex, start, end: text.length });
    });

    return { text, runs };
}

/** How many characters the line will reveal. */
export function countCharacters(segments: DialogueSegment[]): number {
    return flattenSegments(segments).text.length;
}

/** The line as plain prose, for measuring and for the debug readout. */
export function toPlainText(segments: DialogueSegment[]): string {
    return flattenSegments(segments).text;
}

/** Every clickable segment of a line, in reading order. */
export function findInteractiveSegments(
    segments: DialogueSegment[],
): DialogueInteractiveTextSegment[] {
    return segments.filter(
        (segment): segment is DialogueInteractiveTextSegment => segment.type === 'interactive_text',
    );
}

/**
 * The slice of a line between two character offsets, as renderable segments.
 *
 * Used twice: to reveal a prefix while typing, and to hand the renderer exactly
 * the page it should show. A `pause` has no characters, so it is kept only when
 * its position falls inside the range — that way the pacing inside a page
 * survives, and a pause belonging to a later page does not fire early. The lower
 * bound is exclusive so a pause sitting exactly on a page boundary belongs to the
 * page it ends, not to both.
 */
export function sliceSegmentsByRange(
    segments: DialogueSegment[],
    from: number,
    to: number,
): DialogueSegment[] {
    const start = Math.max(0, Math.floor(from));
    const end = Math.max(start, Math.floor(to));
    const sliced: DialogueSegment[] = [];

    let offset = 0;

    for (const segment of segments) {
        if (segment.type === 'pause') {
            if (offset > start && offset <= end) {
                sliced.push(segment);
            }
            continue;
        }

        const segmentStart = offset;
        const segmentEnd = offset + segment.value.length;
        offset = segmentEnd;

        const overlapStart = Math.max(segmentStart, start);
        const overlapEnd = Math.min(segmentEnd, end);

        if (overlapStart >= overlapEnd) {
            continue;
        }

        sliced.push({
            ...segment,
            value: segment.value.slice(overlapStart - segmentStart, overlapEnd - segmentStart),
        });
    }

    return sliced;
}

/**
 * One measurable piece of a line.
 *
 * The box paginates by measuring where each token lands, so a page break can
 * fall between two tokens but never inside one. A plain `text` segment therefore
 * contributes one token per word, while a styled or interactive segment is a
 * single token: splitting it would break the styling across two pages.
 */
export interface DialogueToken {
    /** Position in the token list; the renderer mirrors it in `data-dialogue-token`. */
    index: number;
    /** Index of the segment this token came from. */
    segmentIndex: number;
    /** First character of the flattened text this token covers. */
    start: number;
    /** One past the last character this token covers. */
    end: number;
    /** True when the token must not be split across pages. */
    atomic: boolean;
}

/**
 * A word plus the whitespace around it.
 *
 * The whitespace is kept inside the token so the concatenation of every token is
 * the segment verbatim: a page rebuilt from tokens reproduces the original
 * spacing exactly.
 */
const WORD_PATTERN = /\s*\S+\s*/g;

/** A character range inside one segment's value. */
export interface WordRange {
    start: number;
    end: number;
}

/**
 * The word ranges a plain text value is split into.
 *
 * Shared with the renderer, which wraps each of these in its own element so the
 * paginator can measure them. Both sides derive their boundaries from this one
 * function, so a measurement can never refer to a word the renderer drew
 * differently.
 */
export function splitSegmentWords(value: string): WordRange[] {
    if (value.length === 0) {
        return [];
    }

    const words = value.match(WORD_PATTERN) ?? [];

    // A whitespace-only value matches nothing; keeping it whole is better than
    // dropping characters the line actually contains.
    if (words.length === 0) {
        return [{ start: 0, end: value.length }];
    }

    const ranges: WordRange[] = [];
    let cursor = 0;

    for (const word of words) {
        ranges.push({ start: cursor, end: cursor + word.length });
        cursor += word.length;
    }

    return ranges;
}

/** Splits a line into the tokens a page break may fall between. */
export function tokenizeSegments(segments: DialogueSegment[]): DialogueToken[] {
    const tokens: DialogueToken[] = [];
    let offset = 0;

    segments.forEach((segment, segmentIndex) => {
        if (segment.type === 'pause') {
            return;
        }

        const start = offset;
        offset += segment.value.length;

        const pushToken = (tokenStart: number, tokenEnd: number, atomic: boolean) => {
            tokens.push({ index: tokens.length, segmentIndex, start: tokenStart, end: tokenEnd, atomic });
        };

        // A styled or interactive segment is one token: splitting it would break
        // its styling across two pages, or half of a clickable span.
        if (segment.type !== 'text') {
            pushToken(start, offset, true);
            return;
        }

        for (const range of splitSegmentWords(segment.value)) {
            pushToken(start + range.start, start + range.end, false);
        }
    });

    return tokens;
}

/** When one character is revealed, relative to the one before it. */
export interface TextStep {
    /** Zero-based index of the character this step reveals. */
    index: number;
    /** Milliseconds to wait after the previous character before revealing this one. */
    delayMs: number;
}

/** The full reveal plan for one page of text. */
export interface TextSchedule {
    steps: TextStep[];
    /** Number of characters to reveal. */
    length: number;
    /** Sum of every delay, i.e. how long the page takes to type out. */
    totalDurationMs: number;
}

/**
 * Computes the delay in front of every character.
 *
 * Four things add to a character's delay, and they stack:
 * - the base speed, divided by the segment's `speed_multiplier` (a multiplier
 *   below 1 slows the text down, so it divides rather than multiplies);
 * - a hold after the previous character when it was punctuation;
 * - a `pause` segment sitting between the two characters;
 * - the previous segment's `pause_after_ms`, an explicit hold at its end.
 */
export function buildTextSchedule(segments: DialogueSegment[], baseSpeed: number): TextSchedule {
    const base = Number.isFinite(baseSpeed) && baseSpeed > 0 ? baseSpeed : 1;

    const perCharacterDelay: number[] = [];
    const holdsAfter: number[] = [];
    let leadingDelayMs = 0;

    /** Adds a hold after the most recently queued character. */
    const holdAfterLastCharacter = (duration: number) => {
        if (duration <= 0) {
            return;
        }

        if (perCharacterDelay.length === 0) {
            leadingDelayMs += duration;
            return;
        }

        holdsAfter[holdsAfter.length - 1] += duration;
    };

    for (const segment of segments) {
        if (segment.type === 'pause') {
            holdAfterLastCharacter(Math.max(0, segment.duration_ms));
            continue;
        }

        const style = segment.type === 'styled_text' ? segment.style : undefined;
        const multiplier = style?.speed_multiplier;
        const speed = typeof multiplier === 'number' && multiplier > 0 ? base / multiplier : base;

        for (const character of segment.value) {
            perCharacterDelay.push(speed);
            holdsAfter.push(0);

            const punctuationHold = DIALOGUE_PUNCTUATION_HOLDS[character];
            if (punctuationHold) {
                holdsAfter[holdsAfter.length - 1] += punctuationHold;
            }
        }

        holdAfterLastCharacter(style?.pause_after_ms ?? 0);
    }

    const steps: TextStep[] = perCharacterDelay.map((delay, index) => ({
        index,
        delayMs: delay + (index === 0 ? leadingDelayMs : holdsAfter[index - 1]),
    }));

    const trailingHold = holdsAfter.length > 0 ? holdsAfter[holdsAfter.length - 1] : 0;

    // With no characters the only time the page takes is the leading hold, which
    // the per-step sum below would miss.
    const totalDurationMs = steps.length === 0
        ? leadingDelayMs
        : steps.reduce((total, step) => total + step.delayMs, 0) + trailingHold;

    return { steps, length: perCharacterDelay.length, totalDurationMs };
}
