import React, { useState } from 'react';
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { createPortal } from 'react-dom';
import { ChangeIcon, DefendIcon, InventoryIcon, RestIcon, WeaponIcon, ElementIcon } from '../../../../assets/GalatimeIcon';
import CommonImage from '../../../common/CommonImage';
import { useGame } from '../../../../context/GameContext';
import type { CombatMovementWeapon } from './CombatHUD';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
    defend: DefendIcon,
    rest: RestIcon,
    weapon: WeaponIcon,
    inventory: InventoryIcon,
    switch_line: ChangeIcon,
};

/** At or below this durability the weapon is about to break, and the card says so. */
export const BREAK_WARNING_DURABILITY = 15;

/** `umbra` → `Umbra`, matching how elements are spelled elsewhere on the board. */
function displayElementName(id: string) {
    return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface ExtraMovementCardProps {
    iconKind: string;
    title: string;
    /** What the movement does, shown on hover. */
    description?: string;
    /** The equipped weapon, when the movement is the weapon strike. */
    weapon?: CombatMovementWeapon | null;
    onClick?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    /** Drawn as the action being aimed. */
    selected?: boolean;
    /** Another action is being aimed, so this card recedes behind it. */
    dimmed?: boolean;
    /**
     * The backend refuses this movement right now (a cost the pools cannot pay, a cooldown…).
     *
     * The card stays on the HUD, drawn much darker, and cannot be picked.
     */
    disabled?: boolean;
    /** Why the movement is out of reach; carried as the card's tooltip. */
    disabledReason?: string;
    className?: string;
}

const ExtraMovementCard: React.FC<ExtraMovementCardProps> = ({
    iconKind,
    title,
    description,
    weapon,
    onClick,
    onMouseEnter,
    onMouseLeave,
    selected = false,
    dimmed = false,
    disabled = false,
    disabledReason,
    className = "",
}) => {
    const IconComponent = ICON_MAP[iconKind] ?? DefendIcon;
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);
    const { gameState } = useGame();
    const tooltipAllowed = gameState.settings.fightingTooltipVisible;
    const aboutToBreak = weapon != null
        && !weapon.indestructible
        && weapon.durability != null
        && weapon.durability < BREAK_WARNING_DURABILITY;

    const { refs, floatingStyles } = useFloating({
        open: isTooltipVisible,
        onOpenChange: setIsTooltipVisible,
        placement: 'top',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift({ padding: 12 })],
    });

    return (
        <div
            ref={refs.setReference}
            onClick={() => {
                if (!disabled) onClick?.();
            }}
            onMouseEnter={() => {
                onMouseEnter?.();
                setIsTooltipVisible(true);
            }}
            onMouseLeave={() => {
                onMouseLeave?.();
                setIsTooltipVisible(false);
            }}
            aria-disabled={disabled || undefined}
            title={disabled ? disabledReason : undefined}
            className={`relative w-auto flex items-center group transition-[opacity,filter] duration-200 ${disabled ? 'cursor-not-allowed opacity-25 grayscale' : dimmed ? 'cursor-pointer opacity-40 grayscale' : 'cursor-pointer'} ${className}`}
        >
            <div className={`flex flex-row w-full border-2 overflow-hidden items-center p-1 transition-colors ${aboutToBreak && !disabled ? 'border-galatime-error bg-galatime-dark text-galatime-error shadow-[0_0_14px_rgba(255,80,80,0.55)] animate-pulse motion-reduce:animate-none' : selected ? 'border-white bg-galatime-darkHover text-white shadow-[0_0_14px_rgba(255,255,255,0.45)]' : disabled ? 'border-white/30 bg-black/70 text-white/60' : 'border-white/70 bg-galatime-dark text-white/70 group-hover:text-white hover:bg-galatime-darkHover group-hover:border-white'}`}>

                <div className="shrink-0 flex items-center justify-center mr-1">
                    <IconComponent className="w-3 h-3" />
                </div>

                <div className="flex-1 flex items-center text-lg leading-2.5 text-left -translate-y-0.5">
                    {title}
                </div>

                {aboutToBreak && !disabled && (
                    <span className="shrink-0 font-pixel text-xs leading-2.5 tabular-nums text-galatime-error -translate-y-0.5">
                        {weapon?.durability}
                    </span>
                )}
            </div>

            {/* Hover tooltip: what the movement does. A weapon movement draws the
                weapon's sprite on the left (the path is derived from the id, never
                authored) with name, element and description to its right; the
                universal movements spell out what picking them does. */}
            {tooltipAllowed && isTooltipVisible && (description || weapon) && createPortal(
                <div
                    ref={refs.setFloating}
                    style={floatingStyles}
                    className="pointer-events-none z-50"
                >
                    <div className="flex max-w-[min(20rem,calc(100vw-2rem))] items-start gap-3 border-2 border-white bg-galatime-dark px-3 py-2.5 text-white shadow-[0_8px_26px_rgba(0,0,0,0.6)]">
                        {weapon && (
                            <CommonImage
                                src={`/images/weapons/${weapon.id}.png`}
                                fallbackSrc="/images/elements/unknown.png"
                                alt={weapon.name}
                                className="h-16 w-16 shrink-0 object-contain"
                            />
                        )}
                        <div className="flex min-w-0 flex-col gap-y-0.5">
                            <span className="font-pixel text-sm uppercase leading-2.5 tracking-[0.08em] sm:text-lg">
                                {weapon?.name ?? title}
                            </span>
                            {aboutToBreak && (
                                <span className="font-pixel text-[10px] uppercase leading-2.5 tracking-[0.08em] text-galatime-error sm:text-xs">
                                    About to break · Durability {weapon?.durability}
                                </span>
                            )}
                            {weapon && (
                                <span className="flex items-center gap-1 font-pixel text-xs leading-2.5 text-white/75 sm:text-sm">
                                    <ElementIcon id={weapon.elementId} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    {displayElementName(weapon.elementId)}
                                </span>
                            )}
                            {description && (
                                <span className="font-pixel text-[10px] leading-2.5 text-white/55 sm:text-xs">
                                    {description}
                                </span>
                            )}
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

export default ExtraMovementCard;