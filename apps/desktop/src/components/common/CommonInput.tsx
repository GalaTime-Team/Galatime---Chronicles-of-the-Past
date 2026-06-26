import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation('common');

    const isHorizontal = orientation === 'horizontal';

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
                className={`group relative flex flex-col items-center justify-center ${isHorizontal ? '' : 'mt-1'}`}
            >
                <input
                    type={type}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                    placeholder={placeholder}
                    aria-label={title}
                    aria-describedby={
                        description ? `${title}-description` : undefined
                    }
                    className={`bg-transparent border-0 border-b text-lg border-galatime-primary/40 text-white placeholder:text-galatime-primary/40 focus:outline-none focus:ring-0 px-0 w-auto min-w-[30px] leading-none transition ${isHorizontal ? 'text-left' : 'text-center'} ${inputClassName}
                `}
                />

                {showCounter && (
                    <div
                        className={`mt-1 text-right text-xs text-white/60 ${counterClassName}`}
                        aria-live="polite"
                    >
                        {characterCount} / {maxCharacters}
                    </div>
                )}

                {/* Description Section */}
                {showDescription && description && (
                    isHorizontal ? (
                        <div
                            className={`absolute top-full z-10 mt-1 text-galatime-accent text-xs text-center max-w-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ${descriptionClassName}`}
                        >
                            {description}
                        </div>
                    ) : (
                        <div className={`mt-1 text-galatime-accent text-xs text-center max-w-xs ${descriptionClassName}`}>
                            {description}
                        </div>
                    )
                )}
            </div>

        </div>
    );
};

export default CommonInput;