import React, { useId, useMemo } from 'react';
import CommonTooltip from './CommonTooltip';

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

    const characters = useMemo(() => splitGraphemes(value), [value]);
    const characterCount = characters.length;

    // Titled variants keep the compact content-driven width; `bare` fills its container.
    const widthClassName = isBare ? 'w-full' : 'w-auto min-w-7.5';
    // Allow callers to override alignment via inputClassName (e.g. `text-right`).
    const hasCustomAlign = /\btext-(left|center|right|justify|start|end)\b/.test(inputClassName);
    const alignClassName = hasCustomAlign ? '' : isTitleLeft || isBare ? 'text-left' : 'text-center';
    const stretchClassName = isBare ? 'w-full' : '';
    const hasCustomItems = /\bitems-(start|end|center|baseline|stretch)\b/.test(containerClassName);

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
                className={`relative flex flex-col items-center justify-center ${showTitle && !isTitleLeft ? 'mt-1' : ''} ${stretchClassName}`}
            >
                {/* Description floats above the layout so it is never clipped by the tab panel */}
                <CommonTooltip
                    content={description}
                    disabled={!isTitleLeft || !showDescription}
                    textClassName={descriptionClassName}
                >
                    <div className={`flex flex-col items-center justify-center ${stretchClassName}`}>
                        <input
                            ref={inputRef}
                            type={type}
                            value={value}
                            onChange={handleChange}
                            disabled={disabled}
                            placeholder={placeholder}
                            aria-label={title}
                            aria-describedby={showInlineDescription ? descriptionId : undefined}
                            className={`bg-transparent border-0 border-b text-lg border-galatime-primary/40 text-white placeholder:text-galatime-primary/40 focus:outline-none focus:ring-0 px-0 leading-2.5 transition ${widthClassName} ${alignClassName} ${inputClassName}`}
                        />

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