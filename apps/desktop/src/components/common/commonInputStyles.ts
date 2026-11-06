export interface InputLineWidthOptions {
    /** Width in pixels of the text the rule should hug. */
    textWidth: number;
    /** Whether the field currently has text. */
    hasText: boolean;
    /** Whether the empty field is focused (the rule shrinks to the caret). */
    isFocused: boolean;
}

/**
 * Resolves the animated underline width in pixels.
 *
 * A field at rest and empty shows the full length it may fill; focusing an
 * empty field shrinks the rule to the caret; once there is text (focused or
 * not) the rule hugs it, leaving room for the caret.
 */
export function resolveInputLineWidth({ textWidth, hasText, isFocused }: InputLineWidthOptions): string {
    if (hasText) {
        return `${Math.max(textWidth, 1) + 1}px`;
    }

    if (isFocused) {
        return '2px';
    }

    return `${Math.max(textWidth, 1)}px`;
}
