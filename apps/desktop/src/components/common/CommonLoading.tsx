import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface CommonLoadingProps {
    /** Array of 4 image paths to rotate through */
    images?: [string, string, string, string];
    /** Time in milliseconds between each image change (default: 500ms) */
    interval?: number;
    /** Main loading text (default: translated "Loading...") */
    loadingText?: string;
    /** Subtext or tips to display below the animation */
    subtext?: string;
    /** Custom class for the main container */
    containerClassName?: string;
    /** Custom class for the loading text */
    textClassName?: string;
    /** Custom class for the rotating image */
    imageClassName?: string;
    /** Custom class for the subtext */
    subtextClassName?: string;
}

const CommonLoading: React.FC<CommonLoadingProps> = ({
    images = [
        '/images/ui/loading/loading_0.svg',
        '/images/ui/loading/loading_1.svg',
        '/images/ui/loading/loading_2.svg',
        '/images/ui/loading/loading_3.svg',
    ],
    interval = 500,
    loadingText,
    subtext,
    containerClassName = '',
    textClassName = '',
    imageClassName = '',
    subtextClassName = '',
}) => {
    const { t } = useTranslation('common');
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
        }, interval);

        return () => clearInterval(timer);
    }, [images.length, interval]);

    // Use prop or fall back to translated default
    const displayText = loadingText ? t(loadingText) : null;
    const altText = t('loading.alt');

    return (
        <div
            className={`flex flex-col items-center justify-center select-none ${containerClassName}`}
        >
            {/* Animated Image Section */}
            <div className="flex items-center justify-center">
                <img
                    src={images[currentIndex]}
                    alt={altText}
                    className={`h-12 w-auto transition-all duration-75 ${imageClassName}`}
                />
            </div>

            {/* Loading Text Section */}
            {displayText && (
                <h1 className={`font-pixel text-xl animate-pulse ${textClassName}`}>
                    {displayText}
                </h1>
            )}

            {/* Subtext / Tips Section */}
            {subtext && (
                <div className={`mt-4 text-lg text-center max-w-md px-4 ${subtextClassName}`}>
                    {subtext}
                </div>
            )}
        </div>
    );
};

export default CommonLoading;