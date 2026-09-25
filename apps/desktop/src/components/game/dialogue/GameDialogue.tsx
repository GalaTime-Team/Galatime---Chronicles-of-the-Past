import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { DialogueSegment } from '../../../types/DialogueType';
import {
    DIALOGUE_AUTO_ADVANCE_HOLD_MS,
    DIALOGUE_DEFAULT_MAX_ROWS,
    DIALOGUE_DEFAULT_TEXT_SPEED,
} from '../../../constants/DialogueConstants';
import { sliceSegmentsByRange } from '../../../services/dialogueTextService';
import { useDialoguePagination } from '../../../hooks/useDialoguePagination';
import { useDialogueTyping } from '../../../hooks/useDialogueTyping';
import { DialogueTextRenderer } from './DialogueTextRenderer';

/**
 * The dialogue box: a name plate, a text area and the `>>` indicator.
 *
 * It owns the two things that depend on its own geometry — how a line is split
 * into pages, and how fast a page types out — because both are measured against
 * the box it actually draws. Everything above it (which node is showing, what a
 * click means, where the sprites stand) belongs to `DialogueView`.
 *
 * It therefore does not read the controls. The advance key means different things
 * at different moments — finish the page, turn the page, confirm a choice — and
 * only the view knows which of them applies.
 */

export interface GameDialogueHandle {
    /** Reveals the rest of the current page. Returns false when nothing was typing. */
    skipTyping: () => boolean;
}

export interface GameDialogueProps {
    /** Resolved through the character registry, never read from the dialogue file. */
    speakerName: string;
    /** The current node's text, as the backend resolved it. */
    segments: DialogueSegment[];
    textSpeed?: number;
    maxRows?: number;
    /** Hides the `>>` indicator while the player is choosing an option instead. */
    showIndicator?: boolean;
    /**
     * Turns the pages and advances the line on its own once a page has finished
     * appearing, instead of waiting for the player.
     *
     * The line still types out at its normal pace; only the wait afterwards is
     * removed. The player may still click or press to finish a page early, so an
     * anxious reader is never trapped by the timer.
     */
    autoAdvance?: boolean;
    /** Ignores clicks while a step is in flight. */
    disabled?: boolean;
    /** Replaces the typewriter with an instant reveal. */
    reduceMotion?: boolean;
    className?: string;
    textClassName?: string;
    nameClassName?: string;
    boxClassName?: string;
    /** A clickable phrase inside the line was followed. */
    onInteraction?: (interactionId: string) => void;
    /** The player advanced past the last page of the line. */
    onAdvance?: () => void;
    /** Reports typing state so the view can route the advance control. */
    onTypingChange?: (isTyping: boolean) => void;
}

export const GameDialogue = forwardRef<GameDialogueHandle, GameDialogueProps>(function GameDialogue({
    speakerName,
    segments,
    textSpeed = DIALOGUE_DEFAULT_TEXT_SPEED,
    maxRows = DIALOGUE_DEFAULT_MAX_ROWS,
    showIndicator = true,
    autoAdvance = false,
    disabled = false,
    reduceMotion = false,
    className = '',
    textClassName = '',
    nameClassName = '',
    boxClassName = '',
    onInteraction,
    onAdvance,
    onTypingChange,
}, ref) {
    // The hidden mirror the paginator measures. It renders the whole line, so it
    // is the only element that knows where every word of it lands.
    const measureRef = useRef<HTMLDivElement>(null);

    const pages = useDialoguePagination(segments, { maxRows, mirrorRef: measureRef });

    const [pageIndex, setPageIndex] = useState(0);

    // A new node always starts on its first page, even when the previous line
    // happened to end on the same page number.
    useEffect(() => {
        setPageIndex(0);
    }, [segments]);

    // Repagination can leave the box on a page that no longer exists — a wider
    // window fits the same line in fewer pages — so the index is clamped rather
    // than trusted.
    const currentPageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
    const currentPage = pages[currentPageIndex] ?? [];

    const { revealedCount, isTyping, skip } = useDialogueTyping(currentPage, {
        textSpeed,
        instant: reduceMotion,
    });

    // The view needs this to decide what the advance key means right now: finish
    // the page, turn it, or confirm a choice.
    useEffect(() => {
        onTypingChange?.(isTyping);
    }, [isTyping, onTypingChange]);

    const revealed = sliceSegmentsByRange(currentPage, 0, revealedCount);
    const isLastPage = currentPageIndex >= pages.length - 1;

    // The self-driving part of `handleActivate`. Deliberately duplicated instead
    // of calling it, so the timer does not restart every time a memoised handler
    // gets a new identity: the hold is keyed on the page, not on the render.
    useEffect(() => {
        if (!autoAdvance || disabled || isTyping) {
            return undefined;
        }

        const timer = window.setTimeout(() => {
            if (!isLastPage) {
                setPageIndex(currentPageIndex + 1);
                return;
            }

            onAdvance?.();
        }, DIALOGUE_AUTO_ADVANCE_HOLD_MS);

        return () => window.clearTimeout(timer);
    }, [autoAdvance, disabled, isTyping, isLastPage, currentPageIndex, onAdvance]);

    const handleActivate = useCallback(() => {
        if (disabled) {
            return;
        }

        if (isTyping) {
            skip();
            return;
        }

        if (!isLastPage) {
            setPageIndex(currentPageIndex + 1);
            return;
        }

        onAdvance?.();
    }, [disabled, isTyping, skip, isLastPage, currentPageIndex, onAdvance]);

    // Exposed so the view can collapse the typewriter into the same press that
    // would otherwise do nothing: a key held down must not skip a whole line.
    useImperativeHandle(ref, () => ({
        skipTyping: () => {
            if (!isTyping) {
                return false;
            }

            skip();
            return true;
        },
    }), [isTyping, skip]);

    // A self-advancing line never shows the `>>`: there is nothing to press for.
    const isIndicatorVisible = showIndicator && !isTyping && !disabled && !autoAdvance;

    /*
      `cursor-default` on purpose: the box is one large click target, but a pointer
      over the prose promises a link that is not there. Only the things that really
      are pressable — the phrases inside the line, and the options in
      `DialogueChoiceList` — take the pointer cursor.
    */
    return (
        <div
            onClick={handleActivate}
            className={`relative w-full cursor-default select-none ${className}`}
        >
            <div
                className={`relative flex w-full flex-col overflow-hidden bg-galatime-dark outline-2 outline-white ${boxClassName}`}
            >
                {/*
                  No rule under the plate: the name and the line are one block. The
                  name is deliberately dimmer than the line, so the eye separates
                  who is talking from what they say without a divider to draw.
                */}
                {/*
                  `leading-none` keeps the plate to the glyphs' own height: with the font's
                  default line box the name carried half a line of leading above and below,
                  which is most of the space that used to sit between it and the line.
                */}
                <div className="w-full px-4 pt-1 pb-0">
                    <span
                        className={`text-2xl font-bold uppercase leading-none tracking-widest text-white/60 ${nameClassName}`}
                    >
                        {speakerName}
                    </span>
                </div>

                {/*
                  The gutter belongs to the line, not to the box. A glyph that
                  leans past its own advance width — or the italic of a styled
                  segment — starts flush against the text's left edge, so a
                  gutter taken from this wrapper would put the clip edge exactly
                  on top of the first character of every line. The clip stays
                  here instead, where the padding gives the ink room to lean.

                  The bottom padding is the `>>`'s own strip: the line area is
                  exactly `maxRows` rows tall, so the indicator needs somewhere
                  of its own to sit rather than lying across the last row.
                */}
                <div className="overflow-hidden pb-6">
                    <div
                        aria-live="polite"
                        className={`px-4 font-custom text-base text-white whitespace-pre-wrap ${textClassName}`}
                        // The type size and the row height come from the same two variables,
                        // so a full page always fills the box exactly instead of floating in
                        // the top of a box taller than the text it holds.
                        style={{
                            fontSize: 'var(--dialogue-text-size)',
                            height: `calc(${Math.max(1, maxRows)} * var(--dialogue-line-height))`,
                            lineHeight: 'var(--dialogue-line-height)',
                        }}
                    >
                        <DialogueTextRenderer
                            segments={revealed}
                            interactiveEnabled={!isTyping && !disabled}
                            onInteraction={onInteraction}
                            reduceMotion={reduceMotion}
                        />
                        {isTyping && (
                            <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-white align-middle" />
                        )}
                    </div>
                </div>

                {/*
                  Mounted for as long as the line is, and only ever fading. It
                  used to be added and removed, and to travel as it appeared,
                  which is what made the row it sits on look like it shifted.
                  Nothing about it moves now: the only thing that changes is how
                  opaque it is, and it is never absent.
                */}
                <motion.div
                    aria-hidden="true"
                    initial={false}
                    animate={{ opacity: isIndicatorVisible ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                    className="pointer-events-none absolute bottom-2 right-4 text-lg font-bold leading-2.5 text-white"
                >
                    &gt;&gt;
                </motion.div>
            </div>

            <div
                aria-hidden="true"
                className="pointer-events-none absolute top-[-9999px] left-0 w-full opacity-0"
            >
                {/*
                  The same gutter, font and row height as the visible copy. The
                  paginator measures this element, so anything that differs here
                  breaks the line into pages the box cannot actually hold.
                */}
                <div
                    ref={measureRef}
                    className={`px-4 font-custom text-base text-white whitespace-pre-wrap ${textClassName}`}
                    // The same type size and row height as the visible copy, read from the
                    // same variables. The paginator measures this element, so anything that
                    // differs here breaks the line into pages the box cannot hold.
                    style={{
                        fontSize: 'var(--dialogue-text-size)',
                        lineHeight: 'var(--dialogue-line-height)',
                    }}
                >
                    <DialogueTextRenderer
                        segments={segments}
                        measureTokens
                        // Disabled so the hidden copy holds no focusable elements.
                        interactiveEnabled={false}
                        reduceMotion
                    />
                </div>
            </div>
        </div>
    );
});

export default GameDialogue;