/**
 * Class assembly for `CommonButton`.
 *
 * The visual rules no longer live here as utility strings: they live in
 * `styles/globals.css` inside `@layer components` under the `common-button*`
 * class names. Because Tailwind emits the components layer BEFORE the utilities
 * layer, any utility the call site passes in `className` wins deterministically —
 * no `!` (important suffix) needed anywhere. This module stays a pure function so
 * the content-type logic (text | icon+text | icon-only) is testable without a DOM.
 */

export type ButtonVariant = 'primary' | 'danger' | 'success' | 'outline' | 'ghost' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Where the icon is rendered relative to the label. */
export type ButtonIconPosition = 'left' | 'right';

interface ResolveButtonClassesProps {
    variant: ButtonVariant;
    size: ButtonSize;
    /** Extra classes from the call site; always last. They are plain utilities, so they override the layered look. */
    className?: string;
    icon?: unknown;
    children?: unknown;
}

/**
 * Burst colour per variant: the lighter tone of the button's own fill, so the squares
 * stay readable on top of it. `outline`/`ghost` have no fill and turn white on hover,
 * so they use the primary tone — the only choice that reads on both the dark page and
 * the white hover background.
 */
export const PARTICLE_COLORS: Record<ButtonVariant, string> = {
    primary: '#C3C6F2',
    danger: '#E8556B',
    success: '#4FBF9F',
    warning: '#FFE580',
    outline: '#6D72CA',
    ghost: '#6D72CA',
};

/**
 * Assemble the full class list for one button.
 *
 * Content type is inferred from the props: an `icon` without `children` renders an
 * icon-only button — the CSS `common-button-label` and `common-button-*` size classes
 * are then omitted, so it stays a bare centred square sized by its own icon and the
 * call site's classes. Variant colours and every state class still apply.
 */
export function resolveButtonClasses({ variant, size, className = '', icon, children }: ResolveButtonClassesProps): string {
    // An icon with no label is a different control shape: a bare centred square whose
    // size comes from the icon itself plus whatever the call site supplies.
    const isIconOnly = Boolean(icon) && !children;

    const parts = [
        'common-button',
        // Label styling (uppercase, tracking, gap, border) and size padding only make
        // sense around a label.
        isIconOnly ? '' : 'common-button-label',
        `common-button-${variant}`,
        isIconOnly ? '' : `common-button-${size}`,
        className,
    ];

    return parts.filter(Boolean).join(' ');
}
