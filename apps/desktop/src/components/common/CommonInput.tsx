import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import CommonTooltip from './CommonTooltip';
import { resolveInputLineWidth } from './commonInputStyles';

/** Visual arrangement of the input relative to its title. */
export type CommonInputVariant =
    /** Title centered above the input (default). */
    | 'title-top'
    /** Title to the left of the input. */
    | 'title-left'
    /** No visible title — only the input field. */
    | 'bare';

interface CommonInputProps {
    /**
     * Title displayed with the input: above it for `title-top`, to its left for `title-left`.
     * For `bare` it is not rendered — it only becomes the input's accessible label.
     */
    title?: string;
    /** Optional description */
    description?: string;
    /** Current value */
    value: string;
    /** Called whenever the value changes */
    onChange: (value: string) => void;
    /** Placeholder */
    placeholder?: string;
    /** Maximum visible characters (graphemes) */
    maxCharacters?: number;
    /** Disable the input */
    disabled?: boolean;
    /** Input type */
    type?: React.HTMLInputTypeAttribute;
    /** Layout of the input. Defaults to `'title-top'`. */
    variant?: CommonInputVariant;
    /** Show description */
    showDescription?: boolean;
    /** Show character counter */
    showCounter?: boolean;
    /** Container classes */
    containerClassName?: string;
    /** Title classes */
    titleClassName?: string;
    /** Input classes */
    inputClassName?: string;
    /** Description classes */
    descriptionClassName?: string;
    /** Counter classes */
    counterClassName?: string;
    /**
     * The field itself, for a caller that needs to focus it.
     *
     * A question the game asks should have the caret in it from the start, so
     * the player can answer without reaching for the mouse.
     */
    inputRef?: React.Ref<HTMLInputElement>;
}

const segmenter =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;

const splitGraphemes = (text: string): string[] => {
    if (!segmenter) {
        return Array.from(text);
    }

    return [...segmenter.segment(text)].map((s) => s.segment);
};

const CommonInput: React.FC<CommonInputProps> = ({
    title,
    description,
    value,
    onChange,
    placeholder = '',
    maxCharacters = 100,
    disabled = false,
    type = 'text',
    variant = 'title-top',
    showDescription = false,
    showCounter = false,
    containerClassName = '',
    titleClassName = '',
    inputClassName = '',
    descriptionClassName = '',
    counterClassName = '',
    inputRef,
}) => {
    const isTitleLeft = variant === 'title-left';
    const isBare = variant === 'bare';
    const showTitle = !isBare && Boolean(title);
    const showInlineDescription = !isTitleLeft && showDescription && Boolean(description);
    const descriptionId = useId();
    const [isFocused, setIsFocused] = useState(false);
    const [fontsReady, setFontsReady] = useState(false);
    const lineRef = useRef<HTMLSpanElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);

    const characters = useMemo(() => splitGraphemes(value), [value]);
    const characterCount = characters.length;
    const hasText = characterCount > 0;

    /*
     * The rule is measured from the rendered text instead of assuming a fixed
     * character advance: m5x7 is proportional, so `ch` drifts for narrow or wide
     * glyphs. The hidden mirror below renders exactly what the field shows; an
     * empty field at rest mirrors the full length it may fill.
     */
    const measurementText = hasText || isFocused
        ? value
        : '0'.repeat(Math.max(1, maxCharacters));

    useEffect(() => {
        if (typeof document === 'undefined' || !document.fonts) return;

        let active = true;
        document.fonts.ready.then(() => {
            if (active) setFontsReady(true);
        });

        return () => {
            active = false;
        };
    }, []);

    // Allow callers to override alignment via inputClassName (e.g. `text-right`).
    const customAlign = inputClassName.match(/\btext-(left|center|right|start|end)\b/)?.[1];
    const hasCustomAlign = /\btext-(left|center|right|justify|start|end)\b/.test(inputClassName);
    const alignClassName = hasCustomAlign ? '' : isTitleLeft || isBare ? 'text-left' : 'text-center';
    // Anchor the rule to the same edge the text is aligned to, so it grows with
    // the text instead of dragging it sideways.
    const isCenteredLine = customAlign ? customAlign === 'center' : !isTitleLeft && !isBare;
    const isRightLine = customAlign === 'right' || customAlign === 'end';
    const lineAlignClassName = isCenteredLine
        ? 'left-1/2 -translate-x-1/2'
        : isRightLine
            ? 'right-0'
            : 'left-0';
    // The field itself keeps the full width so typing never scrolls the text;
    // only the rule under it animates.
    const fieldWidth = `${Math.max(1, maxCharacters)}ch`;
    const stretchClassName = isBare ? 'w-full' : '';
    // Left-anchored layouts keep the rule starting where the title/text starts.
    const itemsClassName = isTitleLeft || isBare ? 'items-start' : 'items-center';
    const hasCustomItems = /\bitems-(start|end|center|baseline|stretch)\b/.test(containerClassName);

    useLayoutEffect(() => {
        const line = lineRef.current;
        const mirror = measureRef.current;

        if (!line || !mirror) return;

        line.style.setProperty(
            '--common-input-line-width',
            resolveInputLineWidth({
                textWidth: mirror.getBoundingClientRect().width,
                hasText,
                isFocused,
            }),
        );
    }, [fontsReady, hasText, isFocused, maxCharacters, value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextCharacters = splitGraphemes(e.target.value);

        if (nextCharacters.length <= maxCharacters) {
            onChange(e.target.value);
        } else {
            onChange(nextCharacters.slice(0, maxCharacters).join(''));
        }
    };

    return (
        <div
            className={`${isTitleLeft
                ? 'flex flex-row items-start justify-between w-full gap-4'
                : `flex flex-col w-full ${hasCustomItems ? '' : 'items-center'}`
                } ${containerClassName}`}
        >
            {showTitle && (
                <div className={isTitleLeft ? 'flex-1' : 'w-full'}>
                    <h2
                        className={`${isTitleLeft
                            ? 'text-lg text-white'
                            : 'text-white/70 text-2xl text-center'
                            } ${titleClassName}`}
                    >
                        {title}
                    </h2>
                </div>
            )}

            <div
                className={`relative flex flex-col items-center justify-center ${showTitle && isTitleLeft ? 'mt-1' : ''} ${stretchClassName}`}
            >
                {/* Description floats above the layout so it is never clipped by the tab panel */}
                <CommonTooltip
                    content={description}
                    disabled={!isTitleLeft || !showDescription}
                    textClassName={descriptionClassName}
                >
                    <div className={`flex ${itemsClassName} flex-col justify-center max-w-full ${stretchClassName}`}>
                        <div className="relative max-w-full" style={{ width: fieldWidth }}>
                            <input
                                ref={inputRef}
                                type={type}
                                value={value}
                                onChange={handleChange}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                disabled={disabled}
                                placeholder={placeholder}
                                aria-label={title}
                                aria-describedby={showInlineDescription ? descriptionId : undefined}
                                className={`w-full bg-transparent border-0 border-b-game border-transparent text-lg text-white placeholder:text-galatime-primary/40 focus:placeholder:opacity-0 focus:outline-none focus:ring-0 px-0 ${alignClassName} ${inputClassName}`}
                            />
                            <span
                                ref={lineRef}
                                aria-hidden="true"
                                className={`common-input-line pointer-events-none absolute bottom-0 h-[var(--game-border-width)] bg-galatime-primary/40 text-lg ${lineAlignClassName}`}
                            />
                            <span
                                ref={measureRef}
                                aria-hidden="true"
                                className="pointer-events-none invisible absolute top-0 left-0 whitespace-pre text-lg"
                            >
                                {measurementText}
                            </span>
                        </div>

                        {showCounter && (
                            <div
                                className={`mt-1 text-right text-xs text-white/60 ${counterClassName}`}
                                aria-live="polite"
                            >
                                {characterCount} / {maxCharacters}
                            </div>
                        )}
                    </div>
                </CommonTooltip>

                {/* Description Section — `title-top` and `bare` layouts keep the text inline */}
                {showInlineDescription && (
                    <div id={descriptionId} className={`mt-1 text-galatime-accent text-xs text-center max-w-xs ${descriptionClassName}`}>
                        {description}
                    </div>
                )}
            </div>

        </div>
    );
};

export default CommonInput;