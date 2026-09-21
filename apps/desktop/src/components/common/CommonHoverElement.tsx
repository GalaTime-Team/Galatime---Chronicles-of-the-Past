import React, { useEffect, useState } from 'react';
import { getElementsWeaknesses, ElementMultiplierResult, getElementsDamage } from '../../controllers/elementController';
import { ElementIcon } from '../../assets/GalatimeIcon';

interface CommonHoverElementProps {
    /** Single element ID (backwards-compatible) */
    elementId?: string;
    /** Multiple element IDs — takes precedence over elementId */
    elementIds?: string[];
    /** Display name(s) for the element(s). String for single, array for multi. */
    elementName?: string | string[];
    isVisible: boolean;
    isTooltip?: boolean;
    isAttack?: boolean;
    className?: string;
}

const CommonHoverElement: React.FC<CommonHoverElementProps> = ({
    elementId,
    elementIds,
    elementName,
    isVisible,
    isTooltip = false,
    isAttack = true,
    className = '',
}) => {
    const [data, setData] = useState<ElementMultiplierResult | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    // Resolve to a normalised array of element IDs
    const resolvedIds: string[] = elementIds ?? (elementId ? [elementId] : []);
    // Stable key so we re-fetch when the combination changes
    const idsKey = resolvedIds.join(',');

    // Fetch tooltip data
    useEffect(() => {
        if (isVisible && resolvedIds.length > 0 && isTooltip && !loading) {
            const fetchData = async () => {
                setLoading(true);
                try {
                    let result: any;
                    if (isAttack) {
                        result = await getElementsDamage(resolvedIds);
                    } else {
                        result = await getElementsWeaknesses(resolvedIds);
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
    }, [idsKey, isVisible, isTooltip, isAttack]);

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
        // Attack tooltips are built from the target elements, so `type` holds the
        // element's own type and the filter keeps the corrupted ones out. Defence
        // tooltips carry the relationship itself (immune_to, strong_vs, weak_to...)
        // in `type`, but the controller already returns only common elements, so
        // every combined entry must be kept.
        const entries = Object.entries(data.multipliers)
            .filter(([_, multiplier]) => (isAttack ? multiplier.type === 'common' : true));
        const half = Math.ceil(entries.length / 2);
        return [entries.slice(0, half), entries.slice(half)];
    };

    const [leftColumn, rightColumn] = getSplitWeaknessEntries();

    // Resolve display names
    const displayName = Array.isArray(elementName)
        ? elementName.join(' / ')
        : (elementName || resolvedIds.join(' / ') || elementId || '');

    return (
        <div className={`flex flex-col border-2 border-white bg-galatime-dark z-50 pointer-events-none select-none ${className}`}>
            {/* Header: Name(s) and Icon(s) */}
            <div className="flex items-center justify-center gap-2 mx-4">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                    {displayName}
                </h2>
                {resolvedIds.map((id) => (
                    <ElementIcon key={id} id={id} className="w-5 h-5" />
                ))}
            </div>

            {/* Weakness Table */}
            {isTooltip && (
                <div className="flex gap-1 p-2 w-full">
                    {/* Left Column */}
                    <div className="flex-1 flex flex-col">
                        {leftColumn.map(([id, multiplier]) => (
                            <div key={id} className="flex items-center justify-between mb-[-10px] whitespace-nowrap">
                                <div className="flex items-center w-4 h-4 mr-1">
                                    <ElementIcon id={id} className="w-4 h-4" />
                                </div>
                                <span className={`text-lg ${getMultiplierStyle(multiplier.score)}`}>
                                    x{multiplier.score}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Right Column */}
                    <div className="flex-1 flex flex-col">
                        {rightColumn.map(([id, multiplier]) => (
                            <div key={id} className="flex items-center justify-between mb-[-10px] whitespace-nowrap">
                                <div className="flex items-center w-4 h-4 mr-1">
                                    <ElementIcon id={id} className="w-4 h-4" />
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