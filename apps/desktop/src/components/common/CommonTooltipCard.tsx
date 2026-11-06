import React, { forwardRef } from 'react';
import { resolveTooltipClasses, type TooltipVariant } from './commonTooltipStyles';

export interface CommonTooltipCardProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * Visual density. `text` keeps the compact settings-description look;
     * `panel` is the rich card used by skill, item, weapon and character hovers.
     */
    variant?: TooltipVariant;
    /** Maximum width utility for the card. */
    maxWidthClassName?: string;
}

/**
 * The shared shell of every tooltip.
 *
 * Only the frame, surface, text colour, shadow and default non-interactive
 * behaviour live here. The children are rendered untouched, so a tooltip can
 * arrange a title, image, stat grid, weakness table or any future content
 * freely. Every tooltip therefore shares the same palette; call sites only
 * supply layout (width, padding, z-index, pointer-events).
 *
 * `CommonTooltip` uses this internally for anchor-driven hover/focus bubbles.
 * Tooltips that need their own `useFloating` setup (interactive pinning, side
 * placement, dynamic width) use the card directly and keep their behaviour.
 */
const CommonTooltipCard = forwardRef<HTMLDivElement, CommonTooltipCardProps>(function CommonTooltipCard(
    { variant = 'panel', maxWidthClassName = '', className = '', children, ...props },
    ref,
) {
    return (
        <div
            ref={ref}
            className={resolveTooltipClasses({ variant, maxWidthClassName, className })}
            {...props}
        >
            {children}
        </div>
    );
});

export default CommonTooltipCard;
