/**
 * How the game scales its sprites — most source art is only 14x14 — to the size they occupy on
 * screen.
 *
 * `pixelated` and `crisp-edges` are both nearest-neighbour scalers, which are only pixel-perfect at
 * INTEGER zoom levels. Because a sprite is rarely shown at exactly 2x or 3x its source size, some
 * of its pixels end up twice as wide as their neighbours ("a few pixels are bigger for no reason").
 * The modes below replace that with algorithms that behave correctly at fractional sizes.
 *
 * - `sharp-bilinear` — enlarges to the next whole multiple, then reduces with a high-quality
 *   filter. Keeps the pixel-art outline crisp and never gives neighbouring pixels different widths.
 * - `smooth`         — plain high-quality resampling; softest, but never uneven.
 * - `lanczos`        — Lanczos-3 resampling; the sharpest of the smooth filters.
 * - `scale2x`        — edge-aware pixel-art magnification (Scale2x/EPX). Rounds off staircase
 *   diagonals while keeping flat colours perfectly flat.
 * - `crt`            — `scale2x` plus faint scanlines, for a retro-monitor look.
 * - `crisp-edges`    — the browser's edge-preserving scaler; sharpest, but can still produce pixels
 *   of uneven width at fractional zoom.
 */
export const IMAGE_RENDERING_MODES = [
    'sharp-bilinear',
    'smooth',
    'lanczos',
    'scale2x',
    'crt',
    'crisp-edges',
] as const;

export type ImageRenderingMode = (typeof IMAGE_RENDERING_MODES)[number];

/** Super-sampling keeps the pixel-art silhouette without the uneven-pixel artefact. */
export const DEFAULT_IMAGE_RENDERING: ImageRenderingMode = 'sharp-bilinear';

/**
 * Value handed to the CSS `image-rendering` property for plain `<img>` elements, i.e. the images
 * that are not drawn through the canvas pipeline. The canvas-only modes fall back to `auto` because
 * nearest-neighbour scaling would undo exactly what they do.
 */
export const CSS_IMAGE_RENDERING: Record<ImageRenderingMode, string> = {
    'sharp-bilinear': 'auto',
    smooth: 'auto',
    lanczos: 'high-quality',
    scale2x: 'auto',
    crt: 'auto',
    'crisp-edges': 'crisp-edges',
};

/** Render scale is a percentage: 100 renders at native resolution, lower values zoom the world in. */
export const DEFAULT_RENDER_SCALE = 100;
export const RENDER_SCALE_MIN = 50;
export const RENDER_SCALE_MAX = 100;
export const RENDER_SCALE_STEP = 5;

export interface ImageRenderingOption {
    id: ImageRenderingMode;
    /** i18n key resolved by CommonSelector. */
    title: string;
    /** i18n key resolved by CommonSelector. */
    description: string;
}

export const IMAGE_RENDERING_OPTIONS: ImageRenderingOption[] = [
    {
        id: 'sharp-bilinear',
        title: 'settings.display.imageRenderingSharp',
        description: 'settings.display.imageRenderingSharpDescription',
    },
    {
        id: 'lanczos',
        title: 'settings.display.imageRenderingLanczos',
        description: 'settings.display.imageRenderingLanczosDescription',
    },
    {
        id: 'scale2x',
        title: 'settings.display.imageRenderingScale2x',
        description: 'settings.display.imageRenderingScale2xDescription',
    },
    {
        id: 'smooth',
        title: 'settings.display.imageRenderingSmooth',
        description: 'settings.display.imageRenderingSmoothDescription',
    },
    {
        id: 'crt',
        title: 'settings.display.imageRenderingCrt',
        description: 'settings.display.imageRenderingCrtDescription',
    },
    {
        id: 'crisp-edges',
        title: 'settings.display.imageRenderingCrisp',
        description: 'settings.display.imageRenderingCrispDescription',
    },
];
