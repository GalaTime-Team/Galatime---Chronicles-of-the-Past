import React, { useState } from 'react';
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { createPortal } from 'react-dom';

import CommonHoverElement from '../../../common/CommonHoverElement';
import CommonHoverAttackType from '../../../common/CommonHoverAttackType';
import CommonImage from '../../../common/CommonImage';
import { ElementIcon } from '../../../../assets/GalatimeIcon';

import { useGame } from '../../../../context/GameContext';

export interface Attack {
    id: string | number;
    title: string;
    elementId: string;
    type: 'magical' | 'physical' | 'buff' | 'debuff';
    power: number;
    accuracy: number;
    mana_cost: number;
    stamina_cost: number;
    /** The backend refuses this action right now, so the card is drawn out of reach. */
    disabled?: boolean;
    /** Why it is refused, in the player's words (`Not enough mana.`). */
    disabledReason?: string;
}

interface AttackCardProps {
    attack: Attack;
    onClick?: (attack: Attack) => void;
    /** Drawn as the action being aimed. */
    selected?: boolean;
    /** Another action is being aimed, so this card recedes behind it. */
    dimmed?: boolean;
    /**
     * The backend refuses this action right now (no mana/stamina, a cooldown, a line out of
     * reach…).
     *
     * The card keeps its place in the grid — the player must be able to see what their kit
     * holds — but it is drawn much darker and cannot be picked.
     */
    disabled?: boolean;
    /** Why the action is out of reach; carried as the card's tooltip. */
    disabledReason?: string;
    className?: string;
}

const AttackCard: React.FC<AttackCardProps> = ({
    attack,
    onClick,
    selected = false,
    dimmed = false,
    disabled = false,
    disabledReason,
    className = "",
}) => {
    const { title, elementId, type, power, accuracy, mana_cost, stamina_cost } = attack;
    const [isElementTooltipVisible, setIsElementTooltipVisible] = useState(false);
    const [isAttackTypeTooltipVisible, setIsAttackTypeTooltipVisible] = useState(false);

    const assetPath = "/images/elements";
    const typeIconPath = `${assetPath}/type/${type}.svg`;
    // Skill sprites live under `public/images/skills/<element>/<skill>.png`, the same
    // convention the skill tree uses. A skill without a sprite shows the unknown glyph.
    const mainIconPath = `/images/skills/${elementId}/${attack.id}.png`;

    const { gameState } = useGame();
    const TooltipIsVisible = gameState.settings.fightingTooltipVisible;

    const { refs: elementRefs, floatingStyles: elementFloatingStyles } = useFloating({
        open: isElementTooltipVisible,
        onOpenChange: setIsElementTooltipVisible,
        placement: 'right-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift()],
    });

    const { refs: typeRefs, floatingStyles: typeFloatingStyles } = useFloating({
        open: isAttackTypeTooltipVisible,
        onOpenChange: setIsAttackTypeTooltipVisible,
        placement: 'right-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift()],
    });

    return (
        <div
            onClick={() => {
                if (!disabled) onClick?.(attack);
            }}
            aria-disabled={disabled || undefined}
            title={disabled ? disabledReason : undefined}
            className={`relative w-full min-w-0 flex items-center group transition-[opacity,filter] duration-200 ${disabled ? 'cursor-not-allowed opacity-25 grayscale' : dimmed ? 'cursor-pointer opacity-40 grayscale' : 'cursor-pointer'} ${className}`}
        >
            {/* The image on the left - positioned above the box */}
            <div className="absolute left-0 z-10 w-20 h-20 flex items-center justify-center">
                <div className="w-20 h-20 overflow-hidden flex items-center justify-center">
                    <CommonImage
                        src={mainIconPath}
                        alt={title}
                        fallbackSrc="/images/elements/unknown.png"
                        className="w-full h-full object-contain"
                    />
                </div>
            </div>

            {/* The main box - shifted right to accommodate the icon */}
            <div className={`ml-8 my-2 mr-2 w-full outline-3 flex flex-col text-white overflow-hidden gap-1 transition-colors ${selected ? 'bg-galatime-darkHover outline-white shadow-[0_0_18px_rgba(255,255,255,0.45)]' : disabled ? 'bg-black/70 outline-white/40' : 'bg-galatime-dark hover:bg-galatime-darkHover outline-white'}`}>

                {/* Top Half */}
                <div className="flex flex-1">
                    {/* Top Left: Name of the attack */}
                    <div className="flex-1 flex items-center pl-14 text-xl font-medium truncate uppercase tracking-wide">
                        {title}
                    </div>

                    {/* Top Right: Element of the attack */}
                    <div
                        ref={elementRefs.setReference}
                        onMouseEnter={() => {
                            if (!disabled) setIsElementTooltipVisible(true);
                        }}
                        onMouseLeave={() => setIsElementTooltipVisible(false)}
                        className="flex items-center justify-end p-1"
                    >
                    <ElementIcon id={elementId} className="h-5 w-5 object-contain" />
                    </div>

                    {/* Tooltip */}
                    {isElementTooltipVisible && createPortal(
                        <div
                            ref={elementRefs.setFloating}
                            style={elementFloatingStyles}
                            className="z-50 pointer-events-none"
                        >
                            <CommonHoverElement
                                elementId={elementId}
                                elementName={elementId}
                                isVisible={true}
                                isTooltip={TooltipIsVisible}
                                isAttack={true}
                            />
                        </div>,
                        document.body
                    )}
                </div>

                {/* Bottom Half */}
                <div className="flex flex-1 w-full">
                    {/* Bottom Left: Relevant stats */}
                    <div className="flex-1 flex items-center pl-14 pb-1 gap-2 text-sm text-white/40 leading-2.5">
                        <div className="flex gap-1">
                            <span>PW</span>
                            <span className="text-white">{power}</span>
                        </div>
                        <div className="flex gap-1">
                            <span>ACC</span>
                            <span className="text-white">{accuracy}</span>
                        </div>
                        <div className="flex gap-1">
                            <span>MN</span>
                            <span className="text-white">{mana_cost}</span>
                        </div>
                        <div className="flex gap-1">
                            <span>SN</span>
                            <span className="text-white">{stamina_cost}</span>
                        </div>
                    </div>

                    {/* Bottom Right: Type image */}
                    <div
                        ref={typeRefs.setReference}
                        onMouseEnter={() => {
                            if (!disabled) setIsAttackTypeTooltipVisible(true);
                        }}
                        onMouseLeave={() => setIsAttackTypeTooltipVisible(false)}
                        className="flex items-center justify-end p-1"
                    >
                        <CommonImage
                            src={typeIconPath}
                            alt={type}
                            className="h-3 w-3 object-contain"
                        />
                    </div>

                    {/* Tooltip */}
                    {isAttackTypeTooltipVisible && createPortal(
                        <div
                            ref={typeRefs.setFloating}
                            style={typeFloatingStyles}
                            className="z-50 pointer-events-none"
                        >
                            <CommonHoverAttackType
                                typeName={type}
                                typeIconPath={typeIconPath}
                                isVisible={true}
                            />
                        </div>,
                        document.body
                    )}
                </div>
            </div>
        </div>
    );
};

export default AttackCard;
