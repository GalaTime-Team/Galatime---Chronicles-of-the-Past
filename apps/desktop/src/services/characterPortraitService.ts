import { getEntityImages } from './entityImageService';
import { matchPortraitImage, type PortraitMatch } from './portraitMatcher';
import type { EntityImage } from '../types/EntityImageType';

/**
 * Resolves the sprite a character should be drawn with.
 *
 * The dialogue only ever stores a `character_id` and, on a line, an `emotion`.
 * Turning those two into a file is the whole job of this service.
 *
 * It deliberately resolves through `entityImageService` rather than building a
 * path, because the `tsp` folders are hand-authored and do not follow one
 * convention: `pacci/neutral.png` is the simple case, `dante/` prefixes every
 * file (`Dante_neutral.png`) and `neven/` suffixes them (`neutral_n.png`).
 * Matching against the real file list handles all three without a per-character
 * special case, and automatically reports `null` for the characters that have no
 * sprites at all.
 *
 * The matching rules themselves live in `portraitMatcher`, which is pure and
 * therefore has no dependency on the build-time sprite scanner.
 */

/**
 * Sprite lists per character, keyed by the id and name used to find them.
 *
 * `getEntityImages` walks the whole manifest on every call, and a conversation
 * asks for a sprite once per rendered frame's worth of state changes.
 */
const imageCache = new Map<string, EntityImage[]>();

function getImagesFor(characterId: string, displayName?: string | null): EntityImage[] {
    const key = `${characterId}|${displayName ?? ''}`;
    const cached = imageCache.get(key);

    if (cached) {
        return cached;
    }

    const images = getEntityImages({
        type: 'character',
        id: characterId,
        name: displayName ?? undefined,
    });

    imageCache.set(key, images);
    return images;
}

/**
 * The sprite for a character in a given emotion, or `null` when the character
 * has no artwork. `displayName` is only needed when the sprite folder does not
 * match the id (`id: player` with sprites in `arthur/`).
 */
export function resolveCharacterPortrait(
    characterId: string,
    emotion?: string | null,
    displayName?: string | null,
): PortraitMatch | null {
    return matchPortraitImage(getImagesFor(characterId, displayName), emotion);
}

/** Drops the resolved sprite lists. Intended for tests and tooling. */
export function clearCharacterPortraitCache(): void {
    imageCache.clear();
}
