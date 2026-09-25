import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DialogueSegment } from '../types/DialogueType';
import { buildTextSchedule } from '../services/dialogueTextService';

/**
 * Types a page of dialogue out one character at a time.
 *
 * The pacing comes from `buildTextSchedule`, so a segment's
 * `speed_multiplier`, a `pause` segment and a punctuation hold all land in the
 * right place. This hook only walks that schedule and reports how much of the
 * page is visible.
 *
 * It never renders anything: the box asks it for `revealedCount` and slices the
 * page itself. That keeps the typing rules testable and lets the box be
 * replaced without touching the pacing.
 */

export interface UseDialogueTypingOptions {
    /** Base milliseconds per character. */
    textSpeed: number;
    /**
     * Reveals the whole page at once. Used when the player skips, and when the
     * accessibility setting asks for reduced motion.
     */
    instant?: boolean;
    /** Called once per page, after the last character is revealed. */
    onFinished?: () => void;
}

export interface DialogueTypingState {
    /** How many characters of the page are currently visible. */
    revealedCount: number;
    /** True while characters are still appearing. */
    isTyping: boolean;
    /** Reveals the rest of the page immediately. */
    skip: () => void;
}

export function useDialogueTyping(
    segments: DialogueSegment[],
    { textSpeed, instant = false, onFinished }: UseDialogueTypingOptions,
): DialogueTypingState {
    const schedule = useMemo(() => buildTextSchedule(segments, textSpeed), [segments, textSpeed]);

    const [revealedCount, setRevealedCount] = useState(0);

    const timerRef = useRef<number | null>(null);
    /**
     * Invalidates a running chain.
     *
     * `skip()` cannot just clear the pending timeout: the chain is a closure
     * that would resume on the next tick and walk `revealedCount` back down.
     * Bumping this makes the in-flight closure retire instead.
     */
    const generationRef = useRef(0);
    const finishedRef = useRef(false);

    const onFinishedRef = useRef(onFinished);
    onFinishedRef.current = onFinished;

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // A new page, speed or skip mode restarts the reveal from the first character.
    useEffect(() => {
        generationRef.current += 1;
        const generation = generationRef.current;

        clearTimer();
        finishedRef.current = false;

        if (schedule.length === 0 || instant) {
            setRevealedCount(schedule.length);
            return undefined;
        }

        setRevealedCount(0);

        let index = 0;

        const revealNext = () => {
            if (generationRef.current !== generation) {
                return;
            }

            index += 1;
            setRevealedCount(index);

            if (index < schedule.length) {
                timerRef.current = window.setTimeout(revealNext, schedule.steps[index].delayMs);
            } else {
                timerRef.current = null;
            }
        };

        timerRef.current = window.setTimeout(revealNext, schedule.steps[0].delayMs);

        return () => {
            generationRef.current += 1;
            clearTimer();
        };
    }, [schedule, instant, clearTimer]);

    // Reported from an effect rather than from the chain so that skipping and
    // reduced motion finish through exactly the same path as typing to the end.
    useEffect(() => {
        if (schedule.length === 0 || revealedCount < schedule.length || finishedRef.current) {
            return;
        }

        finishedRef.current = true;
        onFinishedRef.current?.();
    }, [revealedCount, schedule.length]);

    const skip = useCallback(() => {
        generationRef.current += 1;
        clearTimer();
        setRevealedCount(schedule.length);
    }, [schedule.length, clearTimer]);

    return {
        revealedCount,
        isTyping: revealedCount < schedule.length,
        skip,
    };
}
