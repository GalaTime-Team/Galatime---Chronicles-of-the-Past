import React, { useState, useEffect } from 'react';

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
}

const CommonSelector: React.FC<CommonSelectorProps> = ({
    items,
    defaultId,
    title,
    onChange,
    containerClassName = '',
    titleClassName = '',
    optionsClassName = '',
    descriptionClassName = '',
}) => {
    // Find the initial index based on defaultId or fallback to 0
    const initialIndex = items.findIndex((item) => item.id === defaultId);
    const [currentIndex, setCurrentIndex] = useState(initialIndex !== -1 ? initialIndex : 0);

    const currentItem = items[currentIndex];

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
        <div className={`flex flex-col items-center justify-center select-none ${containerClassName}`}>
            {/* 1st div: Title + 2nd div */}
            <h2 className={`text-xl text-white ${titleClassName}`}>
                {title}
            </h2>

            {/* 2nd div: 3rd div + Description */}
            <div className="mt-2 flex flex-col items-center justify-center">
                {/* 3rd div: Left Chevron + Option + Right Chevron */}
                <div className="flex items-center justify-center">
                    {/* Left Chevron */}
                    <button
                        onClick={handlePrev}
                        disabled={isAtStart}
                        className={`mr-2 transition-opacity duration-200 ${isAtStart ? 'opacity-40 cursor-not-allowed' : 'opacity-100 cursor-pointer hover:scale-110 active:scale-95'
                            }`}
                        aria-label="Previous option"
                    >
                        <img
                            src="/images/ui/chevron/chevron_left.png"
                            alt="<"
                            className="h-[0.85em] w-auto block"
                            style={{ height: '0.85em' }}
                        />
                    </button>

                    {/* Selected Option Title */}
                    <div className={`text-white text-center ${optionsClassName}`}>
                        {currentItem?.title}
                    </div>

                    {/* Right Chevron */}
                    <button
                        onClick={handleNext}
                        disabled={isAtEnd}
                        className={`ml-2 transition-opacity duration-200 ${isAtEnd ? 'opacity-40 cursor-not-allowed' : 'opacity-100 cursor-pointer hover:scale-110 active:scale-95'
                            }`}
                        aria-label="Next option"
                    >
                        <img
                            src="/images/ui/chevron/chevron_right.png"
                            alt=">"
                            className="h-[0.85em] w-auto block"
                            style={{ height: '0.85em' }}
                        />
                    </button>
                </div>

                {/* Description Section */}
                {currentItem?.description && (
                    <div className={`text-galatime-accent text-xs text-center max-w-xs ${descriptionClassName}`}>
                        {currentItem.description}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommonSelector;
