import type { EntityImage } from '../types/EntityImageType';

/**
 * Chooses which of a character's sprites to draw.
 *
 * The rules live here, apart from the lookup that produces the image list, for
 * two reasons. They are the part with all the judgement in them — the `tsp`
 * folders are hand-authored and follow three different naming conventions — and
 * this module then has no runtime dependency at all, so the rules can be tested
 * without the build-time plugin that scans the sprite folders.
 *
 * `characterPortraitService` is what callers normally use; it resolves the list
 * and hands it to `matchPortraitImage`.
 */

/** A sprite chosen for a character. */
export interface PortraitMatch {
    /** Public URL, ready for `CommonImage`. */
    url: string;
    /** File name without its extension, e.g. `neutral_n`. Useful for captions. */
    imageName: string;
}

/** Base name of the resting sprite; variations add a prefix or a suffix. */
const NEUTRAL_NAME = 'neutral';

/** Casing and separators removed, so `Dante_neutral` and `neutral` compare alike. */
function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Breaks a tie on name length deterministically.
 *
 * The same folder is read on every render, so an unstable choice would make a
 * sprite flicker between two equally good candidates.
 */
function shortestThenAlphabetical(a: EntityImage, b: EntityImage): number {
    return a.name.length - b.name.length || a.name.localeCompare(b.name);
}

/** Images whose name matches `emotion`, best match first. */
function findByEmotion(images: EntityImage[], emotion: string): EntityImage[] {
    const wanted = normalize(emotion);

    if (!wanted) {
        return [];
    }

    const exact = images.filter((image) => normalize(image.name) === wanted);
    if (exact.length > 0) {
        return [...exact].sort(shortestThenAlphabetical);
    }

    // `neutral_n` starts with `neutral` (neven), `dante_neutral` ends with it.
    // Both directions are tried so neither authoring style needs a special case.
    const prefixed = images.filter((image) => normalize(image.name).startsWith(wanted));
    if (prefixed.length > 0) {
        return [...prefixed].sort(shortestThenAlphabetical);
    }

    const suffixed = images.filter((image) => normalize(image.name).endsWith(wanted));
    if (suffixed.length > 0) {
        return [...suffixed].sort(shortestThenAlphabetical);
    }

    return [];
}

/**
 * The best sprite for an emotion, or `null` when the character has none.
 *
 * Falls back to the resting sprite when the requested emotion was never drawn —
 * the norm rather than the exception, since dialogue files use a wider
 * vocabulary (`worried`, `uneasy`, `stern`) than the artwork does.
 */
export function matchPortraitImage(
    images: EntityImage[],
    emotion?: string | null,
): PortraitMatch | null {
    if (images.length === 0) {
        return null;
    }

    if (emotion) {
        const [match] = findByEmotion(images, emotion);
        if (match) {
            return { url: match.url, imageName: match.name };
        }
    }

    // The resting sprite is preferred, but the fallback is resolved explicitly so
    // this stays correct on a list that happens not to be ordered.
    const [neutral] = findByEmotion(images, NEUTRAL_NAME);
    const fallback = neutral ?? images[0];

    return { url: fallback.url, imageName: fallback.name };
}
