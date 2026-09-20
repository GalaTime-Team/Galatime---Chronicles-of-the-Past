import React, { useState, useRef, useCallback } from 'react';

interface CommonSliderProps {
    title: string;
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
    /** Called when the user releases the slider with the final value. */
    onValueCommitted?: (value: number) => void;
    numBars?: number;
    snapToGrid?: boolean;
    className?: string;
    /** Extra classes for the slider track (e.g. margins). The width is computed from bars + gaps. */
    sliderContainerClassName?: string;
    /** Height in px of the first (shortest) bar. */
    baseHeight?: number;
    /** Height in px of the last (tallest) bar. */
    maxBarHeight?: number;
    /** Width in px of each bar. */
    barWidth?: number;
    /** Distance in px between each bar. */
    barGap?: number;
    step?: number;
    /** Optional formatter for the current value; when provided, the value is shown next to the slider. */
    formatValue?: (value: number) => string;
}

const CommonSlider: React.FC<CommonSliderProps> = ({
    title,
    min,
    max,
    value,
    onChange,
    onValueCommitted,
    numBars = 10,
    snapToGrid = true,
    className = '',
    sliderContainerClassName = '',
    baseHeight = 12,
    maxBarHeight = 40,
    barWidth = 6,
    barGap = 10,
    step = 1,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragValue, setDragValue] = useState<number | null>(null);

    // A largura da track é definida pelas próprias barras, para que a área
    // clicável coincida sempre com o que se vê (sem espaço vazio entre beads).
    const trackWidth = numBars * barWidth + (numBars - 1) * barGap;

    const bars = Array.from({ length: numBars }, (_, i) => {
        const height = baseHeight + (maxBarHeight - baseHeight) * (i / (numBars - 1));
        return Math.round(height / step) * step;
    });

    const handleMove = useCallback((clientX: number) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percentage = offsetX / rect.width;
        let rawValue = min + percentage * (max - min);

        if (snapToGrid) {
            // Mantém os pontos de snap em 0%, 10%, ..., 100%.
            const gridStep = (max - min) / numBars;
            const closestStep = Math.round((rawValue - min) / gridStep);
            rawValue = min + closestStep * gridStep;
        } else {
            rawValue = Math.round(rawValue / step) * step;
        }

        const newValue = Math.max(min, Math.min(max, rawValue));
        setDragValue(newValue);
        onChange(newValue);
    }, [min, max, snapToGrid, numBars, step, onChange]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
        setDragValue(null);
        handleMove(e.clientX);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const increment = e.shiftKey ? step * 5 : step;
        const direction = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (direction === 0) return;

        e.preventDefault();
        onChange(Math.max(min, Math.min(max, value + direction * increment)));
    };

    const displayValue = dragValue !== null ? dragValue : value;
    const percentage = Math.max(0, Math.min(100, ((displayValue - min) / (max - min)) * 100));

    // 0% = nenhuma barra; 100% = todas as barras.
    // Cada barra acrescenta exatamente 1 / numBars da escala.
    const activeBars = percentage <= 0
        ? 0
        : Math.min(numBars, Math.ceil((percentage / 100) * numBars));

    return (
        <div className={`flex flex-row items-center w-full gap-4 select-none ${className}`}>
            <span className="text-white text-lg font-medium whitespace-nowrap">
                {title}
            </span>

            <div className="flex-1" />

            <div
                ref={containerRef}
                className={`relative flex items-center shrink-0 cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-galatime-accent ${sliderContainerClassName}`}
                style={{ width: `${trackWidth}px`, height: `${maxBarHeight}px` }}
                role="slider"
                tabIndex={0}
                aria-label={title}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={displayValue}
                onPointerDown={onPointerDown}
                onPointerMove={(e) => { if (isDragging) handleMove(e.clientX); }}
                onPointerUp={() => {
                    const finalValue = dragValue !== null ? dragValue : value;
                    setIsDragging(false);
                    setDragValue(null);
                    onValueCommitted?.(finalValue);
                }}
                onPointerCancel={() => { setIsDragging(false); setDragValue(null); }}
                onKeyDown={onKeyDown}
            >
                <div
                    className="absolute inset-x-0 flex items-center pointer-events-none"
                    style={{ height: `${maxBarHeight}px`, gap: `${barGap}px` }}
                >
                    {bars.map((h, i) => {
                        const isActive = i < activeBars;

                        return (
                            <div
                                key={i}
                                style={{ height: `${h}px`, width: `${barWidth}px` }}
                                className={`shrink-0 transition-colors duration-150 ${isActive
                                    ? 'bg-white/70 group-hover:bg-white'
                                    : 'bg-white/15'
                                    }`}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default CommonSlider;