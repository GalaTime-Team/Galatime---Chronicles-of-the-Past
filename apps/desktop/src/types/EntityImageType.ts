/** One sprite of an entity, discovered under `public/images/entities`. */
export interface EntityImage {
    /** File name without the `.png` extension, shown as the caption under the sprite. */
    name: string;
    /** Public URL the sprite is served from. */
    url: string;
}
