/**
 * Class assembly for `CommonTooltip` and `CommonTooltipCard`.
 *
 * Like `commonButtonStyles`, the visual rules live in `styles/globals.css`
 * inside `@layer components` under the `common-tooltip-*` class names. Tailwind
 * emits the components layer before utilities, so a call site can override any
 * default with a plain utility — no `!` important suffix is ever needed.
 *
 * This module is pure so the variant/max-width assembly is testable without a DOM.
 */

export type TooltipVariant = 'text' | 'panel';

interface ResolveTooltipClassesProps {
    /** `text` keeps the compact settings-description bubble; `panel` is the rich, free-form card. */
    variant?: TooltipVariant;
    /** Maximum width utility for the bubble, e.g. `max-w-xs` or `max-w-[min(20rem,calc(100vw-2rem))]`. */
    maxWidthClassName?: string;
    /** Extra classes from the call site; always last so plain utilities win the layered look. */
    className?: string;
}

/**
 * Assemble the tooltip card classes.
 *
 * The card is deliberately just a shell: the shared class supplies the frame,
 * surface, text colour and shadow, while the children own the internal layout.
 * That is what lets a settings description, a skill card and a character hover
 * share the same chrome without forcing a header/body/footer shape on any of
 * them. The `text` variant only adds the compact text layout.
 */
export function resolveTooltipClasses({
    variant = 'panel',
    maxWidthClassName = '',
    className = '',
}: ResolveTooltipClassesProps = {}): string {
    return [
        'common-tooltip-card',
        // The panel shares the card defaults outright; only the compact text
        // bubble adds a layout rule.
        variant === 'text' ? 'common-tooltip-text' : '',
        maxWidthClassName,
        className,
    ].filter(Boolean).join(' ');
}
