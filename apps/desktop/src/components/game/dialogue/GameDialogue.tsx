import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useControlListener } from '../../../context/GameContext';

interface GameDialogueProps {
    speakerName: string;
    text: string;
    textSpeed?: number;
    maxRows?: number;
    className?: string;
    textClassName?: string;
    nameClassName?: string;
    boxClassName?: string;
    onComplete?: () => void;
}

const GameDialogue: React.FC<GameDialogueProps> = ({
    speakerName,
    text,
    textSpeed = 30,
    maxRows = 2,
    className = '',
    textClassName = '',
    nameClassName = '',
    boxClassName = '',
    onComplete,
}) => {
    const [pages, setPages] = useState<string[]>([]);
    const [pageIndex, setPageIndex] = useState(0);
    const [displayedText, setDisplayedText] = useState('');
    const [isPageDone, setIsPageDone] = useState(false);
    const textRef = useRef<HTMLParagraphElement>(null);
    const measureRef = useRef<HTMLParagraphElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const typingTimerRef = useRef<number | null>(null);

    // Count actual rendered lines instead of estimating from offsetHeight.
    // Range.getClientRects() returns one rectangle per visual line fragment.
    const countRenderedLines = useCallback((value: string) => {
        const measure = measureRef.current;
        if (!measure) return 1;

        measure.textContent = value || ' ';

        const range = document.createRange();
        range.selectNodeContents(measure);

        const lineTops = Array.from(range.getClientRects()).map((rect) =>
            Math.round(rect.top),
        );

        range.detach();

        return Math.max(1, new Set(lineTops).size);
    }, []);

    // Build pages containing whole words whenever possible. A single unusually
    // long word may exceed maxRows, because splitting that word is worse than
    // allowing one page to be taller than the normal limit.
    const paginate = useCallback(() => {
        if (!text) {
            setPages([]);
            return;
        }

        const nextPages: string[] = [];
        let currentPage = '';
        const tokens = text.match(/\S+(?:\s+|$)|\s+/g) ?? [text];

        for (const token of tokens) {
            const candidate = currentPage + token;
            const wouldOverflow =
                Boolean(currentPage) &&
                countRenderedLines(candidate) > Math.max(1, maxRows);

            if (wouldOverflow) {
                nextPages.push(currentPage.trimEnd());
                // Do not leave a leading space at the beginning of a page.
                currentPage = token.trimStart();
            } else {
                currentPage = candidate;
            }
        }

        if (currentPage.trim()) nextPages.push(currentPage.trimEnd());
        setPages(nextPages);
    }, [text, maxRows, countRenderedLines]);

    // `isPageDone` is also the indicator state:
    // - false: the indicator is hidden, so a click completes the typing animation;
    // - true: the indicator is visible, so a click advances to the next page.

    useEffect(() => {
        paginate();
    }, [paginate]);

    // Reset pagination state whenever the measured pages change.
    useEffect(() => {
        setPageIndex(0);
        setDisplayedText('');
        setIsPageDone(false);
    }, [pages]);

    // Repaginate when the dialogue width changes.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(() => paginate());
        observer.observe(container);
        return () => observer.disconnect();
    }, [paginate]);

    // Type only the current two-row page.
    useEffect(() => {
        const pageText = pages[pageIndex] ?? '';
        setDisplayedText('');
        setIsPageDone(false);

        if (!pageText) {
            setIsPageDone(true);
            return;
        }

        let index = 0;
        const timer = window.setInterval(() => {
            index += 1;
            setDisplayedText(pageText.slice(0, index));

            if (index >= pageText.length) {
                window.clearInterval(timer);
                typingTimerRef.current = null;
                setIsPageDone(true);
            }
        }, textSpeed);

        typingTimerRef.current = timer;

        return () => {
            window.clearInterval(timer);
            if (typingTimerRef.current === timer) {
                typingTimerRef.current = null;
            }
        };
    }, [pages, pageIndex, textSpeed]);



    const isIndicatorVisible =
        isPageDone && typingTimerRef.current === null;

    const handleBoxClick = useCallback(() => {
        if (!isIndicatorVisible) {
            // The indicator is hidden: cancel the active timer before showing
            // the complete page. This prevents the old animation from resuming.
            if (typingTimerRef.current !== null) {
                window.clearInterval(typingTimerRef.current);
                typingTimerRef.current = null;
            }

            setDisplayedText(pages[pageIndex] ?? '');
            setIsPageDone(true);
            return;
        }

        // The indicator is visible: confirm this page and advance.
        if (pageIndex < pages.length - 1) {
            // Hide the old indicator immediately while the next page starts.
            setIsPageDone(false);
            setDisplayedText('');
            setPageIndex((previous) => previous + 1);
            return;
        }

        onComplete?.();
    }, [isIndicatorVisible, pages, pageIndex, onComplete]);

    // Keyboard input goes through the centralized bindings: the dialogue only
    // knows the `advance` control, never a physical key, so rebinding it in
    // Settings keeps working here (defaults: Space and ArrowRight).
    useControlListener({ advance: handleBoxClick});

    return (
        <div
            onClick={handleBoxClick}
            className={`relative w-full cursor-pointer select-none ${className}`}
        >
            <div
                ref={containerRef}
                className={`relative w-full bg-galatime-dark outline-2 outline-white flex flex-col overflow-hidden ${boxClassName}`}
            >
                <div className="w-full border-b border-white/20 px-4 py-2">
                    <span
                        className={`text-2xl font-bold uppercase tracking-widest text-white ${nameClassName}`}
                    >
                        {speakerName}
                    </span>
                </div>

                <div className="px-4 py-3 overflow-hidden">
                    <p
                        ref={textRef}
                        className={`overflow-hidden text-white text-sm leading-2.5 font-custom ${textClassName}`}
                        style={{ height: `${Math.max(1, maxRows) * 24}px`, margin: 0, padding: 0 }}
                    >
                        {displayedText}
                        {!isPageDone && (
                            <span className="inline-block w-0.5 h-[1em] bg-white ml-0.5 align-middle animate-pulse" />
                        )}
                    </p>
                </div>

                <AnimatePresence>
                    {isIndicatorVisible && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, x: [0, 5, 0] }}
                            exit={{ opacity: 0 }}
                            transition={{
                                opacity: { duration: 0.3 },
                                x: {
                                    duration: 1.5,
                                    repeat: Infinity,
                                    ease: 'easeInOut',
                                },
                            }}
                            className="absolute bottom-2 right-4 text-white text-lg font-bold leading-2.5"
                        >
                            &gt;&gt;
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Must use the same width, font, line-height, and whitespace rules as the visible text. */}
            <div className="absolute top-[-9999px] left-0 w-full pointer-events-none opacity-0">
                <div className="px-4">
                    <p
                        ref={measureRef}
                        className={`text-white text-sm leading-2.5 font-custom ${textClassName}`}
                        style={{
                            width: '100%',
                            margin: 0,
                            padding: 0,
                            whiteSpace: 'pre-wrap',
                            overflow: 'visible'
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default GameDialogue;