import React, { useState } from 'react';
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { createPortal } from 'react-dom';

import CommonHoverElement from '../common/CommonHoverElement';
import CommonHoverAttackType from '../common/CommonHoverAttackType';

import { useGame } from '../../context/GameContext';

export interface Attack {
    id: string | number;
    title: string;
    elementId: string;
    type: 'magical' | 'physical' | 'buff' | 'debuff';
    power: number;
    accuracy: number;
    mana_cost: number;
    stamina_cost: number;
}

interface AttackCardProps {
    attack: Attack;
    onClick?: (attack: Attack) => void;
    className?: string;
}

const AttackCard: React.FC<AttackCardProps> = ({
    attack,
    onClick,
    className = "",
}) => {
    const { title, elementId, type, power, accuracy, mana_cost, stamina_cost } = attack;
    const [isElementTooltipVisible, setIsElementTooltipVisible] = useState(false);
    const [isAttackTypeTooltipVisible, setIsAttackTypeTooltipVisible] = useState(false);

    const assetPath = "/images/elements";
    const typeIconPath = `${assetPath}/type/${type}.svg`;
    const elementIconPath = `${assetPath}/${elementId}.png`;
    const mainIconPath = `${assetPath}/attacks/${attack.id}.png`;

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
            onClick={() => onClick?.(attack)}
            className={`relative w-72 flex items-center cursor-pointer group transition-transform active:scale-[.98] ${className}`}
        >
            {/* The image on the left - positioned above the box */}
            <div className="absolute left-0 z-10 w-20 h-20 flex items-center justify-center">
                <div className="w-[80px] h-[80px] overflow-hidden flex items-center justify-center">
                    <img
                        src={mainIconPath}
                        alt={title}
                        className="w-full h-full object-contain"
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
            </div>

            {/* The main box - shifted right to accommodate the icon */}
            <div className="ml-8 my-2 mr-2 w-full bg-galatime-dark border-2 border-white flex flex-col text-white overflow-hidden gap-1">

                {/* Top Half */}
                <div className="flex flex-1 gap-20">
                    {/* Top Left: Name of the attack */}
                    <div className="flex-[3] flex items-center pl-11 text-xl font-bold truncate uppercase tracking-wider">
                        {title}
                    </div>

                    {/* Top Right: Element of the attack */}
                    <div
                        ref={elementRefs.setReference}
                        onMouseEnter={() => setIsElementTooltipVisible(true)}
                        onMouseLeave={() => setIsElementTooltipVisible(false)}
                        className="flex-1 flex items-center justify-end pr-1"
                    >
                        <img
                            src={elementIconPath}
                            alt={elementId}
                            className="h-5 w-5 object-contain"
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
                <div className="flex flex-1">
                    {/* Bottom Left: Relevant stats */}
                    <div className="flex-[3] flex items-center pl-11 pb-1 gap-2 text-sm text-white/40 leading-none">
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
                        onMouseEnter={() => setIsAttackTypeTooltipVisible(true)}
                        onMouseLeave={() => setIsAttackTypeTooltipVisible(false)}
                        className="flex-1 flex items-center justify-end pr-1 pb-1"
                    >
                        <img
                            src={typeIconPath}
                            alt={type}
                            className="h-3 w-3 object-contain"
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