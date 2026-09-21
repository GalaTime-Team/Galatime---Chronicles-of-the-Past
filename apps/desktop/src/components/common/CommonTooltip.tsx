import React, { cloneElement, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, flip, offset, shift, useFloating, type Rect } from '@floating-ui/react';

/** Props the anchor element must accept so the tooltip can hook into it. */
type CommonTooltipAnchorProps = React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>;

/**
 * Only vertical sides are allowed. A tooltip placed beside the anchor (left/right) ends up
 * overlapping the element the pointer is hovering, so those placements are not supported.
 */
export type TooltipPlacement =
    | 'top'
    | 'top-start'
    | 'top-end'
    | 'bottom'
    | 'bottom-start'
    | 'bottom-end';

interface CommonTooltipProps {
    /** Text (or node) rendered inside the floating bubble. When empty, the anchor is rendered untouched. */
    content?: React.ReactNode;
    /** Single element the tooltip is anchored to; it reacts to hover and focus. */
    children: React.ReactElement<CommonTooltipAnchorProps>;
    /**
     * Preferred side of the anchor. Defaults to `top`; when there is not enough room above,
     * the bubble flips to `bottom`. Horizontal placements (`left`/`right`) are not supported
     * so the bubble never covers the pointer.
     */
    placement?: TooltipPlacement;
    /** Gap in pixels between the anchor and the bubble. Defaults to `10`. */
    gap?: number;
    /** Extra classes for the bubble (background, border, padding, ...). */
    tooltipClassName?: string;
    /** Extra classes for the text inside the bubble. */
    textClassName?: string;
    /** Maximum width utility class for the bubble. Defaults to `max-w-xs`. */
    maxWidthClassName?: string;
    /** Keep the anchor rendered but never open the tooltip. */
    disabled?: boolean;
}

/** Refs can arrive as callbacks or objects; the anchor must still forward every one of them. */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
    if (!ref) return;
    if (typeof ref === 'function') ref(value);
    else (ref as React.RefObject<T | null>).current = value;
}

/**
 * The render scale magnifies the interface with CSS `zoom` on `<html>` (see `displayService`).
 * Chromium keeps reporting `getBoundingClientRect()` in unzoomed layout pixels, while floating-ui
 * derives its viewport boundary from `html.clientWidth/Height`, which stays in magnified pixels.
 * Comparing both would make `flip`/`shift` believe there is `zoom` times more room than there is,
 * letting the bubble slide off the screen. Measuring the viewport in layout pixels keeps every
 * rect involved in the overflow maths in the same coordinate space.
 */
function getViewportRect(): Rect {
    const { documentElement } = document;
    const zoom = Number.parseFloat(getComputedStyle(documentElement).zoom) || 1;

    return {
        x: 0,
        y: 0,
        width: documentElement.clientWidth / zoom,
        height: documentElement.clientHeight / zoom,
    };
}

/** Distance kept between the bubble and the viewport edges. */
const VIEWPORT_PADDING = 8;

/**
 * Tooltip rendered in a portal on `document.body`.
 *
 * Because the bubble lives outside the component tree, it is never clipped by
 * scroll containers (`overflow-*`) or by narrow parents (e.g. a switch icon),
 * and it always floats above the rest of the interface.
 */
const CommonTooltip: React.FC<CommonTooltipProps> = ({
    content,
    children,
    placement = 'top',
    gap = 10,
    tooltipClassName = '',
    textClassName = '',
    maxWidthClassName = 'max-w-xs',
    disabled = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const tooltipId = useId();

    const hasContent = content !== undefined && content !== null && content !== '';
    const canOpen = hasContent && !disabled;

    /** Boundary kept for the overflow maths, in the same pixels as the element rects. */
    const viewportRect = getViewportRect();

    // The only placement the bubble may flip to is the opposite vertical side, keeping the
    // caller's alignment suffix (e.g. `top-start` flips to `bottom-start`).
    const isOnTop = placement.startsWith('top');
    const fallbackPlacement = `${isOnTop ? 'bottom' : 'top'}${placement.replace(/^(top|bottom)/, '')}` as TooltipPlacement;

    const { refs, floatingStyles } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        placement,
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(gap),
            flip({
                padding: VIEWPORT_PADDING,
                rootBoundary: viewportRect,
                // Overrides the default fallback list, which would also try the left/right sides.
                fallbackPlacements: [fallbackPlacement],
                flipAlignment: false,
            }),
            // `shift` names the axes from the placement side: for `top`/`bottom` its `mainAxis`
            // is the HORIZONTAL one. The defaults (`mainAxis: true`, `crossAxis: false`) are
            // therefore exactly what is needed: slide the bubble left/right back inside the
            // viewport, and never clamp it vertically (pulling it up/down to fit would lay it
            // over the anchor and the pointer).
            shift({ padding: VIEWPORT_PADDING, rootBoundary: viewportRect }),
        ],
    });

    // Without content the anchor is rendered exactly as it was passed in.
    if (!canOpen) return children;

    const anchorProps = children.props;
    const describedBy = [anchorProps['aria-describedby'], isOpen ? tooltipId : undefined]
        .filter(Boolean)
        .join(' ');

    const anchor = cloneElement(children, {
        ref: (node: HTMLElement | null) => {
            assignRef(anchorProps.ref, node);
            refs.setReference(node);
        },
        'aria-describedby': describedBy || undefined,
        onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
            anchorProps.onMouseEnter?.(event);
            setIsOpen(true);
        },
        onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
            anchorProps.onMouseLeave?.(event);
            setIsOpen(false);
        },
        onFocus: (event: React.FocusEvent<HTMLElement>) => {
            anchorProps.onFocus?.(event);
            setIsOpen(true);
        },
        onBlur: (event: React.FocusEvent<HTMLElement>) => {
            anchorProps.onBlur?.(event);
            setIsOpen(false);
        },
    });

    return (
        <>
            {anchor}

            {isOpen &&
                createPortal(
                    <div
                        ref={refs.setFloating}
                        id={tooltipId}
                        role="tooltip"
                        style={floatingStyles}
                        className={`pointer-events-none z-9999 select-none border border-white/20 bg-galatime-dark px-3 py-2 text-center text-xs leading-2.5 text-galatime-accent shadow-lg shadow-black/50 ${maxWidthClassName} ${tooltipClassName}`}
                    >
                        <span className={`block ${textClassName}`}>{content}</span>
                    </div>,
                    document.body
                )}
        </>
    );
};

export default CommonTooltip;
