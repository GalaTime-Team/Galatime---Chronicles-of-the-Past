/**
 * Draws the game's sprites onto a `<canvas>` using the image rendering mode chosen in Settings.
 *
 * The sprites are tiny (14x14), so scaling them correctly is cheap, but it cannot be expressed with
 * the CSS `image-rendering` property alone: that property can only pick a browser scaler, and every
 * one of those either blurs the art or — for the nearest-neighbour ones — widens some pixels but
 * not others whenever the sprite is not shown at an exact multiple of its source size.
 *
 * Drawing into a canvas whose intrinsic size matches its on-screen device-pixel size means the
 * browser performs no scaling at all, and the mode's filter is the only thing that ever resamples
 * the sprite.
 */

import {
  DEFAULT_IMAGE_RENDERING,
  type ImageRenderingMode,
} from '../constants/DisplayConstants';
import {
  applyScanlines,
  lanczos3Resize,
  nearestResize,
  scale2x,
  type Raster,
} from '../utils/imageFilters';

//region — Image rendering mode subscription
let currentMode: ImageRenderingMode = DEFAULT_IMAGE_RENDERING;
let interfaceZoom = 1;
const modeListeners = new Set<() => void>();

/** Current mode, used as the default state by `CommonImage`. */
export function getImageRenderingMode(): ImageRenderingMode {
  return currentMode;
}

/** Extra device pixels per CSS pixel of a sprite, on top of the device pixel ratio. */
export function getInterfaceZoom(): number {
  return interfaceZoom;
}

/**
 * `true` when `getBoundingClientRect` already folds the CSS `zoom` of the interface into its
 * result. Chromium does not; other engines may. Detected once per display-settings change with a
 * 100px probe, because applying the zoom twice would make every sprite twice as large as its box.
 */
function clientRectsIncludeZoom(): boolean {
  if (typeof document === 'undefined' || !document.body) {
    return true;
  }

  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-10000px;left:0;width:100px;height:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const measured = probe.getBoundingClientRect().width;
  const layout = probe.offsetWidth;
  probe.remove();

  if (!layout) {
    return true;
  }

  // A ratio of 1 means the rect is reported in unzoomed layout pixels.
  return Math.abs(measured / layout - 1) > 0.01;
}

/**
 * Called by `displayService` right after the display settings were applied.
 *
 * Subscribers always redraw, even when the mode itself did not change: `renderScale` feeds the CSS
 * `zoom` of the document, which changes the number of device pixels a sprite covers WITHOUT
 * changing the size a `ResizeObserver` or `getBoundingClientRect` reports.
 *
 * @param renderZoom the CSS `zoom` currently applied to the document.
 */
export function notifyDisplaySettingsChanged(mode: ImageRenderingMode, renderZoom = 1): void {
  currentMode = mode;
  interfaceZoom = !Number.isFinite(renderZoom) || renderZoom <= 0 || renderZoom === 1
    ? 1
    : clientRectsIncludeZoom() ? 1 : renderZoom;
  modeListeners.forEach((listener) => listener());
}

export function subscribeImageRendering(listener: () => void): () => void {
  modeListeners.add(listener);
  return () => {
    modeListeners.delete(listener);
  };
}
//endregion — Image rendering mode subscription

//region — Scratch canvases
/**
 * Reused offscreen canvases. Sprites are a few hundred pixels at most, so one canvas per role
 * avoids allocating on every frame while keeping the filters themselves DOM-free.
 */
type ScratchRole = 'source' | 'read' | 'write';

const scratchCanvases = new Map<ScratchRole, HTMLCanvasElement>();

function scratchCanvas(role: ScratchRole, width: number, height: number): HTMLCanvasElement {
  let canvas = scratchCanvases.get(role);
  if (!canvas) {
    canvas = document.createElement('canvas');
    scratchCanvases.set(role, canvas);
  }
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  return canvas;
}

function context2d(canvas: HTMLCanvasElement, willReadFrequently = false): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently });
  if (!context) {
    throw new Error('A 2D canvas context is required to scale sprites.');
  }
  return context;
}
//endregion — Scratch canvases

//region — Filters that need the browser's resampler
/** High-quality resampling performed by the browser (bicubic-ish), used as a building block. */
function smoothResize(source: Raster, width: number, height: number): Raster {
  const from = scratchCanvas('read', source.width, source.height);
  const fromContext = context2d(from);
  fromContext.clearRect(0, 0, source.width, source.height);
  fromContext.putImageData(new ImageData(source.data, source.width, source.height), 0, 0);

  const to = scratchCanvas('write', width, height);
  const toContext = context2d(to, true);
  toContext.clearRect(0, 0, width, height);
  toContext.imageSmoothingEnabled = true;
  toContext.imageSmoothingQuality = 'high';
  toContext.drawImage(from, 0, 0, source.width, source.height, 0, 0, width, height);

  return { width, height, data: toContext.getImageData(0, 0, width, height).data };
}

/** Enlarges with `scale2x` until the sprite is at least as large as `minWidth`. */
function scale2xUpTo(source: Raster, minWidth: number, minHeight: number): Raster {
  let scaled = source;
  // scale2x doubles the size, so eight passes already cover a 256x magnification.
  for (let pass = 0; pass < 8; pass += 1) {
    if (scaled.width >= minWidth && scaled.height >= minHeight) {
      break;
    }
    if (scaled.width * 2 * (scaled.height * 2) > DETAILED_FILTER_PIXEL_BUDGET) {
      break;
    }
    scaled = scale2x(scaled);
  }
  return scaled;
}
//endregion — Filters that need the browser's resampler

//region — Mode pipeline
/**
 * Sprites are tiny, but the same filters are also asked to render large artwork. Above this many
 * pixels the per-pixel algorithms are skipped in favour of the browser's resampler: on a big image
 * they are either pointless (Scale2x magnifies pixel art) or far too slow (Lanczos-3 over millions
 * of pixels), and at that size the difference is invisible anyway.
 */
const DETAILED_FILTER_PIXEL_BUDGET = 1_500_000;

function processRaster(
  source: Raster,
  mode: ImageRenderingMode,
  targetWidth: number,
  targetHeight: number,
): Raster {
  // `crisp-edges` (nearest) and `smooth` are cheap at any size, so they always run.
  if (mode === 'crisp-edges') {
    return nearestResize(source, targetWidth, targetHeight);
  }
  if (mode === 'smooth') {
    return smoothResize(source, targetWidth, targetHeight);
  }

  const withinBudget = source.width * source.height <= DETAILED_FILTER_PIXEL_BUDGET
    && targetWidth * targetHeight <= DETAILED_FILTER_PIXEL_BUDGET;
  if (!withinBudget) {
    return smoothResize(source, targetWidth, targetHeight);
  }

  switch (mode) {
    case 'lanczos':
      return lanczos3Resize(source, targetWidth, targetHeight);

    case 'sharp-bilinear': {
      // Nearest-neighbour to the next WHOLE multiple keeps every pixel square, and the high-quality
      // reduction that follows blends the extra rows and columns away instead of dropping them.
      const factor = Math.max(
        1,
        Math.ceil(Math.max(targetWidth / source.width, targetHeight / source.height)),
      );
      const enlargedWidth = source.width * factor;
      const enlargedHeight = source.height * factor;
      if (enlargedWidth * enlargedHeight > DETAILED_FILTER_PIXEL_BUDGET) {
        return smoothResize(source, targetWidth, targetHeight);
      }
      const enlarged = factor > 1
        ? nearestResize(source, enlargedWidth, enlargedHeight)
        : source;
      return smoothResize(enlarged, targetWidth, targetHeight);
    }

    case 'scale2x': {
      const scaled = scale2xUpTo(source, targetWidth, targetHeight);
      return smoothResize(scaled, targetWidth, targetHeight);
    }

    case 'crt': {
      const scaled = scale2xUpTo(source, targetWidth, targetHeight);
      const result = smoothResize(scaled, targetWidth, targetHeight);
      applyScanlines(result);
      return result;
    }

    default:
      return smoothResize(source, targetWidth, targetHeight);
  }
}
//endregion — Mode pipeline

//region — Caches
/**
 * Keyed by the requested URL, the mode and the exact device-pixel size. Sprites are drawn many
 * times per screen (and again on every hover), so caching keeps a mode change or a window resize
 * from re-running the filters for the same result.
 */
const outputCache = new Map<string, Raster>();
const MAX_CACHE_ENTRIES = 512;

function cacheOutput(key: string, value: Raster): Raster {
  if (outputCache.size >= MAX_CACHE_ENTRIES) {
    outputCache.clear();
  }
  outputCache.set(key, value);
  return value;
}

/**
 * Reads the source pixels into a raster no larger than the filters need.
 *
 * A source that is far bigger than the box it fills is reduced here first. Materialising a
 * multi-megabyte pixel buffer for what is only a downscale would cost memory and time without
 * changing the result, and the browser's own resampler already does that reduction well. Keeping
 * twice the target size leaves every filter's kernel fed.
 */
function readSourceRaster(
  image: HTMLImageElement,
  cacheKey: string,
  targetWidth: number,
  targetHeight: number,
): Raster {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  const naturalLongestSide = Math.max(naturalWidth, naturalHeight);
  const wantedLongestSide = 2 * Math.max(targetWidth, targetHeight);
  const scale = Math.min(1, wantedLongestSide / naturalLongestSide);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const key = `src:${cacheKey}@${width}x${height}`;
  const cached = outputCache.get(key);
  if (cached) {
    return cached;
  }

  const canvas = scratchCanvas('source', width, height);
  const context = context2d(canvas, true);
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, naturalWidth, naturalHeight, 0, 0, width, height);

  const raster: Raster = {
    width,
    height,
    data: context.getImageData(0, 0, width, height).data,
  };
  outputCache.set(key, raster);
  return raster;
}
//endregion — Caches

/**
 * Renders `image` into `canvas` so that it fills `boxWidth` x `boxHeight` CSS pixels while keeping
 * its aspect ratio, using the given image rendering mode.
 *
 * `canvas` ends up with an intrinsic size equal to the box multiplied by `dpr` and by the interface
 * zoom, so the browser draws it one device pixel per canvas pixel and never rescales the filtered
 * result.
 */
export function drawSprite(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  mode: ImageRenderingMode,
  boxWidth: number,
  boxHeight: number,
  dpr: number,
  cacheKey: string,
): void {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight || boxWidth <= 0 || boxHeight <= 0) {
    return;
  }

  const deviceWidth = Math.max(1, Math.round(boxWidth * dpr * interfaceZoom));
  const deviceHeight = Math.max(1, Math.round(boxHeight * dpr * interfaceZoom));

  // Replicates `object-fit: contain`: the sprite is centred inside its box and never stretched.
  const fit = Math.min(deviceWidth / naturalWidth, deviceHeight / naturalHeight);
  const targetWidth = Math.max(1, Math.round(naturalWidth * fit));
  const targetHeight = Math.max(1, Math.round(naturalHeight * fit));

  const rasterKey = `${cacheKey}|${mode}|${targetWidth}x${targetHeight}`;
  const processed = outputCache.get(rasterKey) ?? cacheOutput(
    rasterKey,
    processRaster(
      readSourceRaster(image, cacheKey, targetWidth, targetHeight),
      mode,
      targetWidth,
      targetHeight,
    ),
  );

  if (canvas.width !== deviceWidth) {
    canvas.width = deviceWidth;
  }
  if (canvas.height !== deviceHeight) {
    canvas.height = deviceHeight;
  }

  const context = context2d(canvas);
  context.clearRect(0, 0, deviceWidth, deviceHeight);
  context.putImageData(
    new ImageData(processed.data, processed.width, processed.height),
    Math.round((deviceWidth - targetWidth) / 2),
    Math.round((deviceHeight - targetHeight) / 2),
  );
}
