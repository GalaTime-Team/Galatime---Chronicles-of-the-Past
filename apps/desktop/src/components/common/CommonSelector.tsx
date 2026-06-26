import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SelectorItem {
    id: string;
    title: string;
    description?: string;
}

interface CommonSelectorProps {
    /** List of items to select from */
    items: SelectorItem[];
    /** The ID of the item to select by default */
    defaultId?: string;
    /** The title displayed above the selector */
    title: string;
    /** Callback function called when the selection changes */
    onChange: (item: SelectorItem) => void;
    /** Custom class for the main container */
    containerClassName?: string;
    /** Custom class for the title text */
    titleClassName?: string;
    /** Custom class for the options text container */
    optionsClassName?: string;
    /** Custom class for the description text */
    descriptionClassName?: string;
    /** Orientation of the selector: 'horizontal' or 'vertical' */
    orientation?: 'horizontal' | 'vertical';
    /** Whether to show the description or not */
    showDescription?: boolean;
}

const CommonSelector: React.FC<CommonSelectorProps> = ({
    items,
    defaultId,
    title,
    onChange,
    orientation = 'horizontal',
    containerClassName = '',
    titleClassName = '',
    optionsClassName = '',
    descriptionClassName = '',
    showDescription = false,
}) => {
    const { t } = useTranslation('common');
    // Find the initial index based on defaultId or fallback to 0
    const initialIndex = items.findIndex((item) => item.id === defaultId);
    const [currentIndex, setCurrentIndex] = useState(initialIndex !== -1 ? initialIndex : 0);

    const currentItem = items[currentIndex];
    const isHorizontal = orientation === 'horizontal';

    const handlePrev = () => {
        if (currentIndex > 0) {
            const nextIndex = currentIndex - 1;
            setCurrentIndex(nextIndex);
            onChange(items[nextIndex]);
        }
    };

    const handleNext = () => {
        if (currentIndex < items.length - 1) {
            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            onChange(items[nextIndex]);
        }
    };

    const isAtStart = currentIndex === 0;
    const isAtEnd = currentIndex === items.length - 1;

    return (
        <div
            className={`select-none ${isHorizontal
                    ? 'flex flex-row items-center justify-between w-full'
                    : 'flex flex-col items-center justify-center'
                } ${containerClassName}`}
        >
            {/* Title */}
            <h2
                className={`${isHorizontal ? 'text-lg text-white' : 'text-2xl text-white/70'
                    } ${titleClassName}`}
            >
                {title}
            </h2>

            {/* Options + Description wrapper */}
            <div
                className={`group relative flex flex-col items-center justify-center ${isHorizontal ? '' : 'mt-1'}`}
            >
                {/* Chevron + Option + Chevron */}
                <div className="flex items-center justify-center">
                    {/* Left Chevron */}
                    <button
                        onClick={handlePrev}
                        disabled={isAtStart}
                        className={`mr-2 transition-all duration-200 ${isAtStart
                                ? 'opacity-40 cursor-not-allowed'
                                : 'opacity-100 cursor-pointer hover:scale-110 active:scale-95'
                            }`}
                        aria-label={t('selector.previous')}
                    >
                        <img
                            src="/images/ui/chevron/chevron_left.svg"
                            alt={t('selector.chevronLeft')}
                            className="h-[0.80em] w-auto block"
                            style={{ height: '0.80em' }}
                        />
                    </button>

                    {/* Selected Option Title */}
                    <div className={`text-lg text-white text-center ${optionsClassName}`}>
                        {t(currentItem?.title || '')}
                    </div>

                    {/* Right Chevron */}
                    <button
                        onClick={handleNext}
                        disabled={isAtEnd}
                        className={`ml-2 transition-all duration-200 ${isAtEnd
                                ? 'opacity-40 cursor-not-allowed'
                                : 'opacity-100 cursor-pointer hover:scale-110 active:scale-95'
                            }`}
                        aria-label={t('selector.next')}
                    >
                        <img
                            src="/images/ui/chevron/chevron_right.svg"
                            alt={t('selector.chevronRight')}
                            className="h-[0.80em] w-auto block"
                            style={{ height: '0.80em' }}
                        />
                    </button>
                </div>

                {/* Description Section */}
                {showDescription && currentItem?.description && (
                    isHorizontal ? (
                        <div
                            className={`absolute top-full z-10 mt-1 text-galatime-accent text-xs text-center max-w-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ${descriptionClassName}`}
                        >
                            {t(currentItem.description)}
                        </div>
                    ) : (
                        <div className={`mt-1 text-galatime-accent text-xs text-center max-w-xs ${descriptionClassName}`}>
                            {t(currentItem.description)}
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default CommonSelector;
