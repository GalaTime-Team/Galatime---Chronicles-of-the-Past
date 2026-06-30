import React, { useState, useRef, useEffect, useCallback } from 'react';

interface CommonSliderProps {
    title: string;
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
    numBars?: number;
    snapToGrid?: boolean;
    className?: string;
    sliderContainerClassName?: string;
    baseHeight?: number;
    maxBarHeight?: number;
    step?: number;
}

const CommonSlider: React.FC<CommonSliderProps> = ({
    title,
    min,
    max,
    value,
    onChange,
    numBars = 11,
    snapToGrid = true,
    className = "",
    sliderContainerClassName = "w-48",
    baseHeight = 8,
    maxBarHeight = 24,
    step = 1,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragValue, setDragValue] = useState<number | null>(null);

    const bars = Array.from({ length: numBars }, (_, i) => {
        const height = baseHeight + (maxBarHeight - baseHeight) * (i / (numBars - 1));
        return Math.round(height / step) * step;
    });

    const handleMove = useCallback((clientX: number) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        // Limit offsetX to be within the container width
        const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percentage = offsetX / rect.width;
        let rawValue = min + percentage * (max - min);

        if (snapToGrid) {
            const step = (max - min) / (numBars - 1);
            const closestStep = Math.round((rawValue - min) / step);
            rawValue = min + closestStep * step;
        } else {
            rawValue = Math.round(rawValue);
        }

        const newValue = Math.max(min, Math.min(max, rawValue));
        setDragValue(newValue);
        onChange(newValue);
    }, [min, max, snapToGrid, numBars, onChange]);

    const onMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragValue(null);
        handleMove(e.clientX);
    };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (isDragging) handleMove(e.clientX);
        };
        const onMouseUp = () => {
            setIsDragging(false);
            setDragValue(null);
        };

        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging, handleMove]);

    const displayValue = dragValue !== null ? dragValue : value;
    const percentage = ((displayValue - min) / (max - min)) * 100;

    return (
        <div className={`flex flex-row items-center w-full gap-4 select-none ${className}`}>
            {/* Title */}
            <span className="text-white text-lg font-medium whitespace-nowrap">
                {title}
            </span>

            {/* Espaço flexível entre o título e o slider */}
            <div className="flex-1"></div>

            {/* Slider Container (largura fixa) */}
            <div
                ref={containerRef}
                className={`relative flex items-center cursor-pointer group ${sliderContainerClassName}`}
                style={{ height: `${maxBarHeight}px` }}
                onMouseDown={onMouseDown}
            >

                {/* Bars */}
                <div
                    className="absolute inset-x-0 flex items-center justify-between pointer-events-none"
                    style={{ height: `${maxBarHeight}px` }}
                >
                    {bars.map((h, i) => {
                        const barPosPercent = (i / (numBars - 1)) * 100;
                        const isActive = barPosPercent <= percentage;

                        return (
                            <div
                                key={i}
                                style={{ height: `${h}px` }}
                                className={`w-1 transition-colors duration-150 ${isActive ? 'bg-white' : 'bg-white/30'}`}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default CommonSlider;