import { entityImages } from 'virtual:entity-images';
import type { EntityImage } from '../types/EntityImageType';

export type { EntityImage };

/** Folder under `public/images/entities` that holds each entity kind's sprites. */
const CATEGORY_FOLDERS = {
    character: 'characters',
    mob: 'mobs',
} as const;

/** Entity to look sprites up for: the id from the YAML, plus the name the UI shows for it. */
export interface EntityImageLookup {
    type: keyof typeof CATEGORY_FOLDERS;
    id: string;
    name?: string;
}

/** Folder and id with casing and separators removed, so `bern` and `Bernard` compare alike. */
function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Base name of the resting sprite; variations add a suffix, e.g. `neutral_a` or `neutral_n`. */
const NEUTRAL_NAME = 'neutral';

/**
 * Moves the resting sprite to the front, so the list — and therefore the first page of the
 * gallery — opens where a character sheet is read from. The other sprites keep their file order.
 */
function withNeutralFirst(images: EntityImage[]): EntityImage[] {
    const candidates = images
        .map((image, index) => ({ index, name: normalize(image.name) }))
        .filter(({ name }) => name.startsWith(NEUTRAL_NAME));

    if (candidates.length === 0) {
        return images;
    }

    // Plain `neutral` wins; among variations the shortest name is used (`neutral_a` rather than
    // `neutral_angry`), and the alphabetical order keeps that choice stable.
    const [first] = candidates.sort(
        (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name)
    );

    return first.index === 0
        ? images
        : [images[first.index], ...images.filter((_, index) => index !== first.index)];
}

/**
 * Sprites of a single entity, ordered with the neutral sprite first and the rest by folder then
 * file name.
 *
 * The sprite folders are hand-authored, so their names only loosely follow the YAML: Arthur is
 * `id: player` with his sprites in `arthur/`, and Bern is `id: bern` with his in `bernard/`.
 * The id is therefore tried first and the display name second, each time as an exact folder
 * match before falling back to the folders that merely start with it (closest name first, so
 * the same folder is picked every time). An entity with no sprites resolves to an empty list.
 */
export function getEntityImages({ type, id, name }: EntityImageLookup): EntityImage[] {
    const category = CATEGORY_FOLDERS[type];
    const wanted = [id, name ?? ''].map(normalize).filter((key) => key !== '');

    const folders = Object.keys(entityImages)
        .filter((key) => key.startsWith(`${category}/`))
        .map((key) => ({ key, folder: normalize(key.slice(category.length + 1)) }));

    for (const key of wanted) {
        const exact = folders.find((entry) => entry.folder === key);
        if (exact) {
            return withNeutralFirst(entityImages[exact.key]);
        }
    }

    for (const key of wanted) {
        const prefixed = folders
            .filter((entry) => entry.folder.startsWith(key))
            // Shortest name first, then alphabetically: `bern` -> `bernard`, never `bernadette`.
            .sort((a, b) => a.folder.length - b.folder.length || a.folder.localeCompare(b.folder));

        if (prefixed.length > 0) {
            return withNeutralFirst(entityImages[prefixed[0].key]);
        }
    }

    return [];
}
