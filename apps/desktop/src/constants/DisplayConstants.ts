/**
 * How the browser scales <img> and <canvas> content:
 * - `pixelated`: nearest-neighbour scaling (crisp, blocky pixels).
 * - `smooth`: blends neighbouring pixels (softens pixel art).
 * - `crisp-edges`: edge-preserving scaling, keeps lines sharp without blurring colours.
 */
export const IMAGE_RENDERING_MODES = ['pixelated', 'smooth', 'crisp-edges'] as const;

export type ImageRenderingMode = (typeof IMAGE_RENDERING_MODES)[number];

/** Default mode keeps the crisp pixel-art look of the chronicle. */
export const DEFAULT_IMAGE_RENDERING: ImageRenderingMode = 'pixelated';

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
        id: 'pixelated',
        title: 'settings.display.imageRenderingPixelated',
        description: 'settings.display.imageRenderingPixelatedDescription',
    },
    {
        id: 'smooth',
        title: 'settings.display.imageRenderingSmooth',
        description: 'settings.display.imageRenderingSmoothDescription',
    },
    {
        id: 'crisp-edges',
        title: 'settings.display.imageRenderingCrisp',
        description: 'settings.display.imageRenderingCrispDescription',
    },
];
