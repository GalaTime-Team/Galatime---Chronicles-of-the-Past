import React, { useEffect, useState } from 'react';
import { getElementsWeaknesses, ElementWeaknessResult } from '../../controllers/elementController';

interface CommonHoverElementProps {
    elementId: string;
    elementName?: string;
    isVisible: boolean;
    isTooltip?: boolean;
    className?: string;
}
const CommonHoverElement: React.FC<CommonHoverElementProps> = ({
    elementId,
    elementName,
    isVisible,
    isTooltip = false,
    className = '',
}) => {
    const [data, setData] = useState<ElementWeaknessResult | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        if (isVisible && elementId && isTooltip && !data && !loading) {
            const fetchData = async () => {
                setLoading(true);
                try {
                    setLoading(true);
                    const result = await getElementsWeaknesses([elementId]);
                    setData(result);
                    console.log('Fetched element weaknesses:', result);
                } catch (error) {
                    console.error('Failed to fetch element weaknesses:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }
    }, [elementId, isVisible, isTooltip, data, loading]);

    if (!isVisible || loading) return null;

    // Helper to determine color and weight based on multiplier
    const getMultiplierStyle = (multiplier: number) => {
        if (multiplier > 1) return 'text-galatime-errorHover font-bold'; // Weakness (takes more damage)
        if (multiplier < 1) return 'text-galatime-successHover font-bold'; // Resistance (takes less damage)
        return 'text-white'; // Neutral
    };

    return (
        <div className={`flex flex-col p-2 border-2 border-white bg-galatime-dark min-w-[100px] z-50 pointer-events-none select-none ${className}`}>
            {/* Header: Name and Main Icon */}
            <div className="flex items-center justify-center gap-2 mb-1 mx-4">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                    {elementName || elementId}
                </h2>
                <img
                    src={`/images/elements/${elementId}.png`}
                    alt={elementId}
                    className="w-5 h-5 pixelated"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.src.includes('/images/elements/unknown.png')) {
                            target.src = '/images/elements/unknown.png';
                        } else {
                            target.style.display = 'none';
                        }
                    }}
                />
            </div>

            {/* Weakness Table */}
            {isTooltip && (
                <div className="flex flex-col">
                    {loading ? (
                        <div className="text-white text-center py-2 opacity-50">Loading...</div>
                    ) : (
                        data && Object.entries(data.multipliers).map(([id, multiplier]) => (
                            <div key={id} className="flex items-center justify-between mb-[-10px]">
                                {/* Element Icon */}
                                <div className="flex items-center">
                                    <img
                                        src={`/images/elements/${id}.png`}
                                        alt={id}
                                        className="w-4 h-4 pixelated"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            if (!target.src.includes('/images/elements/unknown.png')) {
                                                target.src = '/images/elements/unknown.png';
                                            } else {
                                                target.style.display = 'none';
                                            }
                                        }}
                                    />
                                </div>

                                {/* Multiplier Value */}
                                <span className={`text-lg ${getMultiplierStyle(multiplier)}`}>
                                    x{multiplier}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}

        </div>
    );
};

export default CommonHoverElement;