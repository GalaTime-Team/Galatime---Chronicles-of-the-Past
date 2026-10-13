import React, { useEffect, useMemo, useState } from 'react';
import CombatStatsBar from './CombatStatsBar';
import AttackCard, { Attack } from './AttackCard';
import ExtraMovementCard from './ExtraMovementCard';

/**
 * Interfaces based on the provided snippet
 */

export type { Attack } from './AttackCard';

/** The equipped weapon behind the `weapon` movement, resolved for the tooltip. */
export interface CombatMovementWeapon {
    /** Catalogue id; the game derives the sprite path as `/images/weapons/<id>.png`. */
    id: string;
    name: string;
    elementId: string;
    /** Remaining durability, or `null` when the weapon has none. */
    durability?: number | null;
    /** `indestructible` weapons never lose durability, so they never warn. */
    indestructible?: boolean;
}

/** An action outside the attack grid, rendered as a small card under it. */
export interface CombatExtraMovement {
    id: string;
    title: string;
    iconKind: string;
    /** Backend action kind (`defend`, `weapon`, `rest`, `inventory`, …). */
    kind: string;
    /** Stamina the action costs, previewed on the SN bar while the card is hovered. */
    staminaCost: number;
    /** Mana the action costs, previewed on the MN bar while the card is hovered. */
    manaCost: number;
    /** What the movement does, in the player's words. */
    description?: string;
    /** The equipped weapon, when the movement is the weapon strike. */
    weapon?: CombatMovementWeapon | null;
    /** The backend refuses this movement right now, so the card is drawn out of reach. */
    disabled?: boolean;
    /** Why it is refused, in the player's words (`Not enough stamina.`). */
    disabledReason?: string;
}

/** What the HUD shows when the caller does not supply its own list. */
export const DEFAULT_EXTRA_MOVEMENTS: CombatExtraMovement[] = [
    { id: 'defend', title: 'Defend', iconKind: 'defend', kind: 'defend', staminaCost: 0, manaCost: 0, description: 'Brace: halve incoming damage until your next turn.' },
    { id: 'weapon', title: 'Weapon', iconKind: 'weapon', kind: 'weapon', staminaCost: 0, manaCost: 0, description: 'Strike with the equipped weapon.' },
    { id: 'rest', title: 'Rest', iconKind: 'rest', kind: 'rest', staminaCost: 0, manaCost: 0, description: 'Recover a portion of mana and stamina.' },
    { id: 'inventory', title: 'Inventory', iconKind: 'inventory', kind: 'inventory', staminaCost: 0, manaCost: 0, description: 'Spend the turn using an item from your inventory.' },
];

interface CombatHUDProps {
    // Stats
    hp: { current: number; max: number };
    mana: { current: number; max: number };
    stamina: { current: number; max: number };

    // Attacks & Actions
    attacks: Attack[];
    /** Movements under the attack grid; defaults to {@link DEFAULT_EXTRA_MOVEMENTS}. */
    extraMovements?: CombatExtraMovement[];
    /**
     * Id of the action being aimed, if any.
     *
     * That card is drawn with a white glow and every other card recedes, so the
     * choice is unmistakable while the target is being picked.
     */
    selectedActionId?: string | number | null;

    // Callbacks
    onAttackClick: (attack: Attack) => void;
    onExtraMovementClick: (movement: CombatExtraMovement) => void;

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
    extraMovements = DEFAULT_EXTRA_MOVEMENTS,
    selectedActionId = null,
    onAttackClick,
    onExtraMovementClick,
    gridConfig = { columns: 2, rows: 2 },
    className = "",
}) => {
    /**
     * Id of the card under the pointer.
     *
     * The MN/SN preview is derived from it rather than stored as raw amounts, so
     * a card that disappears mid-hover (it just became unusable, say) can no
     * longer leave a stale cost pinned to the bars.
     */
    const [hoveredActionId, setHoveredActionId] = useState<string | number | null>(null);

    // Calculate total slots for the attack grid
    const totalSlots = gridConfig.columns * gridConfig.rows;
    const aiming = selectedActionId !== null;

    // Prepare attacks array to match grid size (fill with null for empty slots)
    const displayAttacks = useMemo(() => {
        const arr = [...attacks];
        while (arr.length < totalSlots) {
            arr.push(null as any);
        }
        return arr.slice(0, totalSlots);
    }, [attacks, totalSlots]);

    /**
     * Mana/stamina the given card would spend, or null when it is not on the HUD.
     *
     * A disabled card reports nothing: pulsing the bars for an action the unit cannot pay for
     * would advertise a move that is not on the table.
     */
    const findActionCost = (id: string | number | null): { mana: number; stamina: number } | null => {
        if (id === null) return null;
        const attack = attacks.find((candidate) => candidate?.id === id);
        if (attack) return attack.disabled ? null : { mana: attack.mana_cost, stamina: attack.stamina_cost };
        const movement = extraMovements.find((candidate) => candidate.id === id);
        if (!movement || movement.disabled) return null;
        return { mana: movement.manaCost, stamina: movement.staminaCost };
    };

    /**
     * What the MN/SN bars preview, and for how long.
     *
     * A picked action still waiting for its target is the cost that WILL be
     * paid, so it stays on the bars no matter where the pointer roams — including
     * over the battlefield while the target is being chosen, and across the other
     * (dimmed) cards, whose costs must not flicker over the pending one. With
     * nothing pending, the hovered card shows what a click would spend. The
     * preview lives exactly as long as one of those two conditions does.
     */
    const previewedCost = findActionCost(selectedActionId) ?? findActionCost(hoveredActionId);
    const previewManaDeplete = previewedCost?.mana ?? 0;
    const previewStaminaDeplete = previewedCost?.stamina ?? 0;

    /**
     * Stops previewing the moment the cost is actually paid.
     *
     * An action that needs no target resolves on click, with the pointer still
     * resting on the card: without this the band would keep pulsing over the
     * already-reduced stat until the mouse happened to leave and come back.
     */
    useEffect(() => {
        setHoveredActionId(null);
    }, [mana.current, stamina.current]);

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
                            className="min-w-0"
                            onMouseEnter={() => setHoveredActionId(attack?.id ?? null)}
                            onMouseLeave={() => setHoveredActionId(null)}
                        >
                            {attack ? (
                                <AttackCard
                                    attack={attack}
                                    selected={attack.id === selectedActionId}
                                    dimmed={aiming && attack.id !== selectedActionId}
                                    disabled={attack.disabled}
                                    disabledReason={attack.disabledReason}
                                    onClick={() => onAttackClick(attack)}
                                />
                            ) : (
                                <div className="h-full min-h-20 border-2 border-dashed border-gray-700/20 bg-gray-800/5" />
                            )}
                        </div>
                    ))}
                </div>

                {/* Extra Movements */}
                <div className="flex flex-row flex-wrap gap-2 items-center justify-center">
                    {extraMovements.map((movement) => (
                        <ExtraMovementCard
                            key={movement.id}
                            iconKind={movement.iconKind}
                            title={movement.title}
                            description={movement.description}
                            weapon={movement.weapon}
                            selected={movement.id === selectedActionId}
                            dimmed={aiming && movement.id !== selectedActionId}
                            disabled={movement.disabled}
                            disabledReason={movement.disabledReason}
                            onMouseEnter={() => setHoveredActionId(movement.id)}
                            onMouseLeave={() => setHoveredActionId(null)}
                            onClick={() => onExtraMovementClick(movement)}
                        />
                    ))}
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