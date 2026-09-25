import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { DialogueSegment } from '../types/DialogueType';
import {
    countCharacters,
    sliceSegmentsByRange,
    tokenizeSegments,
    type DialogueToken,
} from '../services/dialogueTextService';

/**
 * Splits a line into the pages the box shows one at a time.
 *
 * The box has a fixed height of `maxRows` rows, so a longer line has to be
 * broken up. Doing that by counting characters would be wrong the moment a
 * segment is bold, or the font scale changes; instead the whole line is rendered
 * once into a hidden mirror that shares the box's width, font and line height,
 * and the real rendered position of every token is measured. A page then holds
 * whole tokens until the next one would fall outside the row budget.
 *
 * The token list comes from `tokenizeSegments`, which is also what the renderer
 * walks, so a page boundary and a render boundary always agree.
 */

/** First and last rendered line a token occupies, as indices into the line list. */
interface TokenLineSpan {
    firstLine: number;
    lastLine: number;
}

export interface UseDialoguePaginationOptions {
    /** Rows a page may occupy before the line is split. */
    maxRows: number;
    /** Hidden element rendering the whole line, used as the ruler. */
    mirrorRef: React.RefObject<HTMLElement | null>;
}

/** Compares two measurements so an unchanged layout does not re-render. */
function sameLineSpans(previous: TokenLineSpan[] | null, next: TokenLineSpan[]): boolean {
    if (!previous || previous.length !== next.length) {
        return false;
    }

    return previous.every(
        (span, index) => span.firstLine === next[index].firstLine
            && span.lastLine === next[index].lastLine,
    );
}

/**
 * Groups measured tokens into pages.
 *
 * Two rules matter. A page is filled while it fits the row budget, and a page
 * break is taken *before* the token that would overflow — so pages always end on
 * a line boundary and re-wrapping a page never moves text that the mirror had
 * already placed. A single token taller than the whole box (a long styled
 * segment, or one very long word) is given a page of its own rather than being
 * cut in half.
 */
function buildPages(
    segments: DialogueSegment[],
    tokens: DialogueToken[],
    lineSpans: TokenLineSpan[] | null,
    rows: number,
    totalCharacters: number,
): DialogueSegment[][] {
    // Nothing measured yet: the line cannot be split, so it is shown whole and
    // repaginated as soon as the mirror reports its layout.
    if (!lineSpans || lineSpans.length !== tokens.length) {
        return [segments];
    }

    const pages: DialogueSegment[][] = [];
    let pageStart = 0;
    let pageFirstLine: number | null = null;

    tokens.forEach((token, index) => {
        const span = lineSpans[index];

        if (pageFirstLine === null) {
            pageFirstLine = span.firstLine;
        } else if (span.lastLine - pageFirstLine + 1 > rows) {
            pages.push(sliceSegmentsByRange(segments, pageStart, token.start));
            pageStart = token.start;
            pageFirstLine = span.firstLine;
        }

        if (span.lastLine - pageFirstLine + 1 > rows) {
            pages.push(sliceSegmentsByRange(segments, pageStart, token.end));
            pageStart = token.end;
            pageFirstLine = null;
        }
    });

    if (pageStart < totalCharacters) {
        pages.push(sliceSegmentsByRange(segments, pageStart, totalCharacters));
    }

    // A page that only carries a pause has nothing to show.
    const filled = pages.filter((page) => countCharacters(page) > 0);

    return filled.length > 0 ? filled : [segments];
}

export function useDialoguePagination(
    segments: DialogueSegment[],
    { maxRows, mirrorRef }: UseDialoguePaginationOptions,
): DialogueSegment[][] {
    const tokens = useMemo(() => tokenizeSegments(segments), [segments]);
    const totalCharacters = useMemo(() => countCharacters(segments), [segments]);
    const rows = Math.max(1, maxRows);

    const [lineSpans, setLineSpans] = useState<TokenLineSpan[] | null>(null);

    const measure = useCallback(() => {
        const mirror = mirrorRef.current;

        if (!mirror || tokens.length === 0) {
            setLineSpans(null);
            return;
        }

        const nodes = mirror.querySelectorAll<HTMLElement>('[data-dialogue-token]');

        // The mirror has not caught up with the segments yet; the effect runs
        // again as soon as it has.
        if (nodes.length !== tokens.length) {
            return;
        }

        const topsByToken: number[][] = [];

        nodes.forEach((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            // One rectangle per visual line fragment, which is how a token that
            // wraps across two lines reports both of them.
            const rects = Array.from(range.getClientRects());
            range.detach();

            topsByToken.push(rects.map((rect) => Math.round(rect.top)));
        });

        const uniqueTops = [...new Set(topsByToken.flat())].sort((a, b) => a - b);

        if (uniqueTops.length === 0) {
            return;
        }

        const lineOf = new Map(uniqueTops.map((top, index) => [top, index]));

        const next: TokenLineSpan[] = topsByToken.map((tops) => {
            if (tops.length === 0) {
                return { firstLine: 0, lastLine: 0 };
            }

            return {
                firstLine: lineOf.get(tops[0]) ?? 0,
                lastLine: lineOf.get(tops[tops.length - 1]) ?? 0,
            };
        });

        setLineSpans((previous) => (sameLineSpans(previous, next) ? previous : next));
    }, [mirrorRef, tokens]);

    // Measured before paint so the very first frame already shows the right page.
    useLayoutEffect(() => {
        measure();
    }, [measure, rows]);

    // A wider or narrower box fits a different number of words per row, so the
    // same line can need a different number of pages.
    useEffect(() => {
        const mirror = mirrorRef.current;

        if (!mirror) {
            return undefined;
        }

        const observer = new ResizeObserver(() => measure());
        observer.observe(mirror);
        return () => observer.disconnect();
    }, [mirrorRef, measure]);

    return useMemo(
        () => buildPages(segments, tokens, lineSpans, rows, totalCharacters),
        [segments, tokens, lineSpans, rows, totalCharacters],
    );
}
