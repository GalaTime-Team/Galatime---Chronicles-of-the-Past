/**
 * Pixel-buffer filters used to scale the chronicle's sprites — most of the source art is only
 * 14x14 — up to the size they occupy on screen.
 *
 * Why these exist: `image-rendering: pixelated` and `image-rendering: crisp-edges` are
 * **nearest-neighbour** scalers, which are only pixel-perfect at INTEGER scale factors. At 14 -> 16
 * px (1.14x) or 14 -> 20 px (1.43x) the scaler replicates some source pixels once and their
 * neighbours twice, so a few pixels end up twice as wide as the rest for no visible reason. Every
 * filter below is a way of trading that artefact for a better-looking result:
 *
 * - `nearestResize`    — the old behaviour, kept for comparison.
 * - `scale2x`          — edge-aware pixel-art magnification (Scale2x/EPX): flat areas stay flat and
 *                        diagonal steps become curves, so nothing looks "doubled".
 * - `lanczos3Resize`   — high-quality resampling that keeps detail sharp without blocky steps.
 * - `applyScanlines`   — faint CRT scanlines on top of a scaled sprite.
 *
 * Everything here works on plain RGBA rasters so the filters stay free of the DOM and are cheap to
 * reason about.
 */

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Copies one RGBA pixel from the offset `from` of `source` to the offset `to` of `target`. */
function copyPixel(target: Uint8ClampedArray, to: number, source: Uint8ClampedArray, from: number): void {
  target[to] = source[from];
  target[to + 1] = source[from + 1];
  target[to + 2] = source[from + 2];
  target[to + 3] = source[from + 3];
}

/** `true` when both RGBA pixels hold exactly the same colour and alpha. */
function samePixel(data: Uint8ClampedArray, a: number, b: number): boolean {
  return data[a] === data[b]
    && data[a + 1] === data[b + 1]
    && data[a + 2] === data[b + 2]
    && data[a + 3] === data[b + 3];
}

/**
 * Nearest-neighbour resize, matching what the browser's `image-rendering: pixelated` does. Kept so
 * the "crisp" mode can reproduce the original look exactly.
 */
export function nearestResize(source: Raster, width: number, height: number): Raster {
  const target = createRaster(width, height);

  const columnMap = new Int32Array(width);
  for (let x = 0; x < width; x += 1) {
    columnMap[x] = Math.min(source.width - 1, Math.floor((x * source.width) / width));
  }

  for (let y = 0; y < height; y += 1) {
    const sourceRow = Math.min(source.height - 1, Math.floor((y * source.height) / height)) * source.width;
    const targetRow = y * width;
    for (let x = 0; x < width; x += 1) {
      copyPixel(target.data, (targetRow + x) * 4, source.data, (sourceRow + columnMap[x]) * 4);
    }
  }

  return target;
}

/**
 * Scale2x (a.k.a. EPX), the classic pixel-art magnifier. Each source pixel becomes four, and the
 * copies adopt a neighbouring colour only when that neighbour matches across the corner — which is
 * what turns a staircase of squares into a smooth diagonal without blurring flat regions.
 *
 * Output is always exactly twice the input in each axis.
 */
export function scale2x(source: Raster): Raster {
  const { width, height, data } = source;
  const target = createRaster(width * 2, height * 2);
  const targetData = target.data;
  const targetWidth = target.width;

  /** RGBA offset of a pixel, clamped to the sprite edges so borders behave like a mirror. */
  const offsetAt = (x: number, y: number): number => {
    const clampedX = x < 0 ? 0 : x >= width ? width - 1 : x;
    const clampedY = y < 0 ? 0 : y >= height ? height - 1 : y;
    return (clampedY * width + clampedX) * 4;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = offsetAt(x, y);
      const up = offsetAt(x, y - 1);
      const left = offsetAt(x - 1, y);
      const right = offsetAt(x + 1, y);
      const down = offsetAt(x, y + 1);

      let topLeft = center;
      let topRight = center;
      let bottomLeft = center;
      let bottomRight = center;

      // Only a corner where both axes actually carry an edge gets smoothed.
      if (!samePixel(data, up, down) && !samePixel(data, left, right)) {
        topLeft = samePixel(data, left, up) ? left : center;
        topRight = samePixel(data, up, right) ? right : center;
        bottomLeft = samePixel(data, left, down) ? left : center;
        bottomRight = samePixel(data, down, right) ? right : center;
      }

      const targetX = x * 2;
      const targetY = y * 2;
      copyPixel(targetData, (targetY * targetWidth + targetX) * 4, data, topLeft);
      copyPixel(targetData, (targetY * targetWidth + targetX + 1) * 4, data, topRight);
      copyPixel(targetData, ((targetY + 1) * targetWidth + targetX) * 4, data, bottomLeft);
      copyPixel(targetData, ((targetY + 1) * targetWidth + targetX + 1) * 4, data, bottomRight);
    }
  }

  return target;
}

const LANCZOS_RADIUS = 3;

function sinc(x: number): number {
  if (x === 0) {
    return 1;
  }
  const scaled = Math.PI * x;
  return Math.sin(scaled) / scaled;
}

function lanczosKernel(x: number): number {
  if (Math.abs(x) >= LANCZOS_RADIUS) {
    return 0;
  }
  return sinc(x) * sinc(x / LANCZOS_RADIUS);
}

interface TapTable {
  /** Index of the first source pixel that contributes to this destination pixel. */
  start: number;
  weights: Float64Array;
}

/**
 * Precomputes, for every destination coordinate, which source pixels contribute and how strongly.
 *
 * When shrinking, the kernel is widened so that all source pixels still land in the result —
 * otherwise thin features would simply be dropped.
 */
function buildTapTable(sourceLength: number, targetLength: number): TapTable[] {
  const scale = targetLength / sourceLength;
  const kernelScale = scale < 1 ? 1 / scale : 1;
  const support = LANCZOS_RADIUS * kernelScale;
  const tables: TapTable[] = [];

  for (let i = 0; i < targetLength; i += 1) {
    // Centre of the destination pixel, expressed in source coordinates.
    const center = (i + 0.5) / scale;
    const start = Math.floor(center - support + 0.5);
    const end = Math.ceil(center + support - 0.5);
    const count = Math.max(1, end - start);
    const weights = new Float64Array(count);

    let total = 0;
    for (let k = 0; k < count; k += 1) {
      const weight = lanczosKernel((start + k + 0.5 - center) / kernelScale);
      weights[k] = weight;
      total += weight;
    }

    // Normalising keeps flat colours perfectly flat instead of darkening or brightening them.
    if (total !== 0) {
      for (let k = 0; k < count; k += 1) {
        weights[k] /= total;
      }
    }

    tables.push({ start, weights });
  }

  return tables;
}

/**
 * Separable Lanczos-3 resampling. Produces the sharpest result of the smooth filters: fine detail
 * survives while the uneven pixel widths of nearest-neighbour scaling disappear.
 */
export function lanczos3Resize(source: Raster, width: number, height: number): Raster {
  if (source.width === width && source.height === height) {
    return source;
  }

  const { data } = source;

  // Horizontal pass: source.width x source.height -> width x source.height.
  const horizontal = createRaster(width, source.height);
  const horizontalTaps = buildTapTable(source.width, width);
  for (let y = 0; y < source.height; y += 1) {
    const rowOffset = y * source.width;
    for (let x = 0; x < width; x += 1) {
      const { start, weights } = horizontalTaps[x];
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let k = 0; k < weights.length; k += 1) {
        const sourceX = Math.min(source.width - 1, Math.max(0, start + k));
        const offset = (rowOffset + sourceX) * 4;
        const weight = weights[k];
        red += data[offset] * weight;
        green += data[offset + 1] * weight;
        blue += data[offset + 2] * weight;
        alpha += data[offset + 3] * weight;
      }
      const targetOffset = (y * width + x) * 4;
      horizontal.data[targetOffset] = red;
      horizontal.data[targetOffset + 1] = green;
      horizontal.data[targetOffset + 2] = blue;
      horizontal.data[targetOffset + 3] = alpha;
    }
  }

  // Vertical pass: width x source.height -> width x height.
  const target = createRaster(width, height);
  const verticalTaps = buildTapTable(source.height, height);
  for (let y = 0; y < height; y += 1) {
    const { start, weights } = verticalTaps[y];
    const targetRow = y * width;
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let k = 0; k < weights.length; k += 1) {
        const sourceY = Math.min(source.height - 1, Math.max(0, start + k));
        const offset = (sourceY * width + x) * 4;
        const weight = weights[k];
        red += horizontal.data[offset] * weight;
        green += horizontal.data[offset + 1] * weight;
        blue += horizontal.data[offset + 2] * weight;
        alpha += horizontal.data[offset + 3] * weight;
      }
      const targetOffset = (targetRow + x) * 4;
      target.data[targetOffset] = red;
      target.data[targetOffset + 1] = green;
      target.data[targetOffset + 2] = blue;
      target.data[targetOffset + 3] = alpha;
    }
  }

  return target;
}

/**
 * Darkens every `period`-th row to imitate the scanlines of a CRT. Alpha is left alone so the
 * sprite's silhouette is unchanged.
 */
export function applyScanlines(raster: Raster, strength = 0.32, period = 3): void {
  const { width, height, data } = raster;
  const factor = 1 - strength;

  for (let y = 0; y < height; y += period) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] *= factor;
      data[offset + 1] *= factor;
      data[offset + 2] *= factor;
    }
  }
}
