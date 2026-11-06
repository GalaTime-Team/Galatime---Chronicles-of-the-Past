import React, { useEffect, useState } from 'react';
import { getElementsWeaknesses, ElementMultiplierResult, getElementsDamage } from '../../controllers/elementController';
import { ElementIcon } from '../../assets/GalatimeIcon';
import { ELEMENT_DAMAGE_MULTIPLIERS } from '../../constants/CombatConstants';
import CommonTooltipCard from './CommonTooltipCard';

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
        const ladder = ELEMENT_DAMAGE_MULTIPLIERS;
        if (multiplier === ladder.immune) return 'text-galatime-element-immune font-bold';
        if (multiplier <= ladder.super_strong) return 'text-galatime-element-superStrong font-bold';
        if (multiplier < ladder.normal) return 'text-galatime-element-strong font-bold';
        if (multiplier === ladder.normal) return 'text-galatime-element-normal';
        if (multiplier < ladder.super_weak) return 'text-galatime-element-weak font-bold';
        return 'text-galatime-element-superWeak font-bold';
    };

    // Split the weakness entries into two columns
    const getSplitWeaknessEntries = () => {
        if (!data) return [[], []];
        // Attack tooltips are built from the target elements, so `type` holds the
        // element's own type and the filter keeps the corrupted ones out. Defence
        // tooltips carry the relationship itself (immune, strong, weak...)
        // in `type`, but the controller already returns only natural elements, so
        // every combined entry must be kept.
        const entries = Object.entries(data.multipliers)
            .filter(([_, multiplier]) => (isAttack ? multiplier.type === 'natural' : true));
        const half = Math.ceil(entries.length / 2);
        return [entries.slice(0, half), entries.slice(half)];
    };

    const [leftColumn, rightColumn] = getSplitWeaknessEntries();

    // Resolve display names
    const displayName = Array.isArray(elementName)
        ? elementName.join(' / ')
        : (elementName || resolvedIds.join(' / ') || elementId || '');

    return (
        <CommonTooltipCard className={`flex flex-col z-50 ${className}`}>
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
        </CommonTooltipCard>
    );
};

export default CommonHoverElement;