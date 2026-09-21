import { useEffect, useRef, useState } from 'react';
import {
  drawSprite,
  getImageRenderingMode,
  getInterfaceZoom,
  subscribeImageRendering,
} from '../../services/imageRenderingService';
import type { ImageRenderingMode } from '../../constants/DisplayConstants';

interface CommonImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  /** Loaded when `src` fails to load; if it fails too, the image is hidden. */
  fallbackSrc?: string;
}

const VECTOR_SOURCE = /\.svg(?:[?#]|$)/i;

/** What a sprite needs to be drawn: the filter, the resolution and the box it fills. */
interface RenderState {
  mode: ImageRenderingMode;
  /** Extra device pixels per CSS pixel added by the render scale's CSS `zoom`. */
  interfaceZoom: number;
  width: number;
  height: number;
}

/**
 * Drop-in replacement for `<img>` for the game's sprites.
 *
 * It renders through a canvas so the image rendering mode from Settings can be applied properly —
 * see `imageRenderingService` for why the CSS `image-rendering` property is not enough. The element
 * occupies exactly the box given by `className` (e.g. `w-5 h-5`) and keeps the sprite's aspect ratio
 * inside it, like `object-contain` does.
 *
 * `className` must define that box: the sprite is rasterised to fit whatever size the wrapper ends
 * up with.
 *
 * Vector sources (`.svg`) are rendered as a plain `<img>`: they carry no pixels to scale.
 */
export default function CommonImage({
  src,
  alt = '',
  className = '',
  style,
  title,
  fallbackSrc,
}: CommonImageProps) {
  const [render, setRender] = useState<RenderState>(() => ({
    mode: getImageRenderingMode(),
    interfaceZoom: getInterfaceZoom(),
    width: 0,
    height: 0,
  }));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [activeSrc, setActiveSrc] = useState(src);
  const [failed, setFailed] = useState(false);
  /** Size of the loaded bitmap, used to keep the box's aspect ratio and as a size fallback. */
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // A new `src` restarts the load, including the fallback chain.
  useEffect(() => {
    setActiveSrc(src);
    setFailed(false);
  }, [src]);

  // The sprite is rasterised at the device-pixel size of the box it fills, so that box is measured.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return undefined;
    }

    const measure = () => {
      const rect = wrapper.getBoundingClientRect();
      // A single known axis is enough: the other one comes from the source aspect ratio once the
      // image has loaded, and this effect runs again on the resize that follows.
      if (rect.width === 0 && rect.height === 0) {
        return;
      }

      setRender((previous) => {
        const next: RenderState = {
          mode: getImageRenderingMode(),
          interfaceZoom: getInterfaceZoom(),
          width: rect.width,
          height: rect.height,
        };
        return previous.mode === next.mode
          && previous.interfaceZoom === next.interfaceZoom
          && previous.width === next.width
          && previous.height === next.height
          ? previous
          : next;
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    // Changing the render scale resizes sprites visually but not in layout, so the display
    // settings subscription is what catches that case.
    const unsubscribe = subscribeImageRendering(measure);

    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [activeSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // The image is loaded even when the box has no size yet, so its natural size can be discovered
    // and used to complete the box. `drawSprite` itself does nothing until both axes are known.
    if (!canvas || VECTOR_SOURCE.test(activeSrc)) {
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = 'async';

    image.onload = () => {
      if (cancelled) {
        return;
      }
      setNaturalSize((previous) => (
        previous && previous.width === image.naturalWidth && previous.height === image.naturalHeight
          ? previous
          : { width: image.naturalWidth, height: image.naturalHeight }
      ));
      drawSprite(
        canvas,
        image,
        render.mode,
        render.width,
        render.height,
        (window.devicePixelRatio || 1) * render.interfaceZoom,
        activeSrc,
      );
    };

    image.onerror = () => {
      if (cancelled) {
        return;
      }
      if (fallbackSrc && activeSrc !== fallbackSrc) {
        setActiveSrc(fallbackSrc);
      } else {
        setFailed(true);
      }
    };

    image.src = activeSrc;
    return () => {
      cancelled = true;
    };
  }, [activeSrc, render, fallbackSrc]);

  if (failed) {
    return null;
  }

  if (VECTOR_SOURCE.test(activeSrc)) {
    return (
      <img
        src={activeSrc}
        alt={alt}
        title={title}
        className={className}
        // The canvas already holds its final pixels, so the browser must not resample it again.
        style={{ imageRendering: 'auto', ...style }}
        onError={() => setFailed(true)}
      />
    );
  }

  // A box sized on a single axis (e.g. `h-12 w-auto`) gets its other axis from the source aspect
  // ratio. `className` must still give the box a size: deriving one from the source would fight
  // with the measurement that produced it.
  const wrapperStyle: React.CSSProperties = naturalSize
    ? { position: 'relative', aspectRatio: `${naturalSize.width} / ${naturalSize.height}`, ...style }
    : { position: 'relative', ...style };

  return (
    // The box is measured on this wrapper, never on the canvas: a canvas whose size comes from its
    // own bitmap would grow with every redraw, because setting `width`/`height` also changes the
    // layout box the observer reports. The absolutely positioned canvas cannot contribute to the
    // wrapper's size, so `className` alone decides it.
    <div ref={wrapperRef} className={className} style={wrapperStyle}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt || undefined}
        title={title}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          // The canvas already holds its final pixels: do not let the browser resample them.
          imageRendering: 'auto',
        }}
      />
    </div>
  );
}
