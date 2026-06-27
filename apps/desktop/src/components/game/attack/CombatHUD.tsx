import React, { useState, useMemo } from 'react';
import CombatStatsBar from './CombatStatsBar';
import AttackCard, { Attack } from './AttackCard';
import ExtraMovementCard from './ExtraMovementCard';

/**
 * Interfaces based on the provided snippet
 */

export type { Attack } from './AttackCard';

export interface Weapon {
    id: string;
    name: string;
}

interface CombatHUDProps {
    // Stats
    hp: { current: number; max: number };
    mana: { current: number; max: number };
    stamina: { current: number; max: number };

    // Attacks & Actions
    attacks: Attack[];
    weapon?: Weapon;

    // Callbacks
    onAttackClick: (attack: Attack) => void;
    onExtraMovementClick: (movement: 'defend' | 'weapon' | 'rest' | 'inventory') => void;

    // Grid Config
    gridConfig?: {
        columns: number;
        rows: number;
    };

    // External component overrides/props if needed
    className?: string;
}

/**
 * CombatHUD Component
 * 
 * Purpose: Show the combat HUD combining HP, MN, SN bars, Attack grid, and Extra movements.
 */
export const CombatHUD: React.FC<CombatHUDProps> = ({
    hp,
    mana,
    stamina,
    attacks,
    weapon,
    onAttackClick,
    onExtraMovementClick,
    gridConfig = { columns: 2, rows: 2 },
    className = "",
}) => {
    // State for previewing costs on hover
    const [previewManaDeplete, setPreviewManaDeplete] = useState(0);
    const [previewStaminaDeplete, setPreviewStaminaDeplete] = useState(0);

    // Calculate total slots for the attack grid
    const totalSlots = gridConfig.columns * gridConfig.rows;

    // Prepare attacks array to match grid size (fill with null for empty slots)
    const displayAttacks = useMemo(() => {
        const arr = [...attacks];
        while (arr.length < totalSlots) {
            arr.push(null as any);
        }
        return arr.slice(0, totalSlots);
    }, [attacks, totalSlots]);

    const handleAttackHover = (attack: Attack | null) => {
        if (attack) {
            setPreviewManaDeplete(attack.mana_cost);
            setPreviewStaminaDeplete(attack.stamina_cost);
        } else {
            setPreviewManaDeplete(0);
            setPreviewStaminaDeplete(0);
        }
    };

    return (
        <div className={`flex flex-row items-stretch ${className}`}>

            {/* Left Column: Attacks & Extra Movements */}
            <div className="flex flex-col gap-2 flex-1">
                {/* HP Bar */}
                <div className="w-full pr-2">
                    <CombatStatsBar
                        title="HP"
                        showTitle
                        current={hp.current}
                        max={hp.max}
                        orientation="ltr"
                        className="w-full"
                    />
                </div>

                {/* Attack Grid */}
                <div
                    className="grid gap-2"
                    style={{
                        gridTemplateColumns: `repeat(${gridConfig.columns}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${gridConfig.rows}, minmax(0, 1fr))`
                    }}
                >
                    {displayAttacks.map((attack, index) => (
                        <div
                            key={attack?.id || `empty-${index}`}
                            onMouseEnter={() => handleAttackHover(attack)}
                            onMouseLeave={() => handleAttackHover(null)}
                        >
                            {attack ? (
                                <AttackCard
                                    attack={attack}
                                    onClick={() => onAttackClick(attack)}
                                />
                            ) : (
                                <div className="h-full min-h-[80px] rounded-lg border-2 border-dashed border-gray-700/20 bg-gray-800/5" />
                            )}
                        </div>
                    ))}
                </div>

                {/* Extra Movements */}
                <div className="flex flex-row gap-2 items-center justify-center">
                    <ExtraMovementCard
                        iconPath="/images/elements/extra/defend.svg"
                        title="Defend"
                        onClick={() => onExtraMovementClick('defend')}
                    />

                    {weapon && (
                        <ExtraMovementCard
                            iconPath="/images/elements/extra/weapon.svg"
                            title="Weapon"
                            onClick={() => onExtraMovementClick('weapon')}
                        />
                    )}

                    <ExtraMovementCard
                        iconPath="/images/elements/extra/rest.svg"
                        title="Rest"
                        onClick={() => onExtraMovementClick('rest')}
                    />

                    <ExtraMovementCard
                        iconPath="/images/elements/extra/inventory.svg"
                        title="Inventory"
                        onClick={() => onExtraMovementClick('inventory')}
                    />
                </div>
            </div>

            {/* MN & SN */}
            <div className="flex flex-row gap-4 pt-1">
                <CombatStatsBar
                    title="MN"
                    showTitle
                    current={mana.current}
                    max={mana.max}
                    orientation="btt"
                    className="h-full"
                    healthClass="bg-gradient-to-t from-galatime-stats-manaFrom to-galatime-stats-manaTo"
                    previewDeplete={previewManaDeplete}
                    previewDepleteClass="bg-black/60"
                />

                <CombatStatsBar
                    title="SN"
                    showTitle
                    current={stamina.current}
                    max={stamina.max}
                    orientation="btt"
                    className="h-full"
                    healthClass="bg-galatime-stats-stamina"
                    previewDeplete={previewStaminaDeplete}
                    previewDepleteClass="bg-black/60"
                />
            </div>
        </div>
    );
};

export default CombatHUD;