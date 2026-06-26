import React, { useEffect, useState } from 'react';
import { getElementsWeaknesses, ElementMultiplierResult, getElementsDamage } from '../../controllers/elementController';

interface CommonHoverElementProps {
    elementId: string;
    elementName?: string;
    isVisible: boolean;
    isTooltip?: boolean;
    isAttack?: boolean;
    className?: string;
}

const CommonHoverElement: React.FC<CommonHoverElementProps> = ({
    elementId,
    elementName,
    isVisible,
    isTooltip = false,
    isAttack = true,
    className = '',
}) => {
    const [data, setData] = useState<ElementMultiplierResult | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    // Fetch tooltip data
    useEffect(() => {
        if (isVisible && elementId && isTooltip && !data && !loading) {
            const fetchData = async () => {
                setLoading(true);
                try {
                    let result: any;
                    if (isAttack) {
                        result = await getElementsDamage([elementId]);
                    } else {
                        result = await getElementsWeaknesses([elementId]);
                    }
                    setData(result);
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
        switch (multiplier) {
            case 0: return 'text-galatime-element-immune font-bold';
            case 0.25: return 'text-galatime-element-superStrong font-bold';
            case 0.5: return 'text-galatime-element-strong font-bold';
            case 1: return 'text-galatime-element-normal';
            case 2: return 'text-galatime-element-weak font-bold';
            case 4: return 'text-galatime-element-superWeak font-bold';
            default: return 'text-white';
        }
    };

    // Split the weakness entries into two columns
    const getSplitWeaknessEntries = () => {
        if (!data) return [[], []];
        const entries = Object.entries(data.multipliers)
            .filter(([_, multiplier]) => multiplier.type === 'common');
        const half = Math.ceil(entries.length / 2);
        return [entries.slice(0, half), entries.slice(half)];
    };

    const [leftColumn, rightColumn] = getSplitWeaknessEntries();

    return (
        <div className={`flex flex-col border-2 border-white bg-galatime-dark z-50 pointer-events-none select-none ${className}`}>
            {/* Header: Name and Main Icon */}
            <div className="flex items-center justify-center gap-2 mx-4">
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
                <div className="flex p-2">
                    {/* Left Column */}
                    <div className="flex flex-col mr-2">
                        {leftColumn.map(([id, multiplier]) => (
                            <div key={id} className="flex items-center justify-between mb-[-10px] whitespace-nowrap">
                                <div className="flex items-center mr-1">
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
                                <span className={`text-lg ${getMultiplierStyle(multiplier.score)}`}>
                                    x{multiplier.score}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Right Column */}
                    <div className="flex flex-col">
                        {rightColumn.map(([id, multiplier]) => (
                            <div key={id} className="flex items-center justify-between mb-[-10px] whitespace-nowrap">
                                <div className="flex items-center mr-1">
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
                                <span className={`text-lg ${getMultiplierStyle(multiplier.score)}`}>
                                    x{multiplier.score}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CommonHoverElement;