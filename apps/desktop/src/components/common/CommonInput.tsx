import React, { useId, useMemo } from 'react';
import CommonTooltip from './CommonTooltip';

interface CommonInputProps {
    /** Title displayed above the input */
    title: string;
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
    /** Orientation */
    orientation?: 'horizontal' | 'vertical';
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
    orientation = 'horizontal',
    showDescription = false,
    showCounter = false,
    containerClassName = '',
    titleClassName = '',
    inputClassName = '',
    descriptionClassName = '',
    counterClassName = '',
}) => {
    const isHorizontal = orientation === 'horizontal';
    const descriptionId = useId();

    const characters = useMemo(() => splitGraphemes(value), [value]);
    const characterCount = characters.length;

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
            className={`${isHorizontal
                ? 'flex flex-row items-start justify-between w-full gap-4'
                : 'flex flex-col items-center w-full'
                } ${containerClassName}`}
        >
            <div className={isHorizontal ? 'flex-1' : 'w-full'}>
                <h2
                    className={`${isHorizontal
                        ? 'text-lg text-white'
                        : 'text-white/70 text-2xl text-center'
                        } ${titleClassName}`}
                >
                    {title}
                </h2>
            </div>

            <div
                className={`relative flex flex-col items-center justify-center ${isHorizontal ? '' : 'mt-1'}`}
            >
                {/* Description floats above the layout so it is never clipped by the tab panel */}
                <CommonTooltip
                    content={description}
                    disabled={!isHorizontal || !showDescription}
                    textClassName={descriptionClassName}
                >
                    <div className="flex flex-col items-center justify-center">
                        <input
                            type={type}
                            value={value}
                            onChange={handleChange}
                            disabled={disabled}
                            placeholder={placeholder}
                            aria-label={title}
                            aria-describedby={description ? descriptionId : undefined}
                            className={`bg-transparent border-0 border-b text-lg border-galatime-primary/40 text-white placeholder:text-galatime-primary/40 focus:outline-none focus:ring-0 px-0 w-auto min-w-7.5 leading-2.5 transition ${isHorizontal ? 'text-left' : 'text-center'} ${inputClassName}`}
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

                {/* Description Section — vertical layouts keep the text inline */}
                {!isHorizontal && showDescription && description && (
                    <div id={descriptionId} className={`mt-1 text-galatime-accent text-xs text-center max-w-xs ${descriptionClassName}`}>
                        {description}
                    </div>
                )}
            </div>

        </div>
    );
};

export default CommonInput;