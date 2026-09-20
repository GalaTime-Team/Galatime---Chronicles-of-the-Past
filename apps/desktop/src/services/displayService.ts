import type { GameSettings } from '../context/GameContext';

export type DisplaySettings = GameSettings['display'];

/** CSS custom property consumed by `image-rendering` for images and canvases. */
export const IMAGE_RENDERING_VAR = '--image-rendering';

/**
 * CSS custom property holding the zoom factor of the interface. A value above 1 lays the game out
 * on a smaller surface and then magnifies it, which enlarges the components and renders fewer pixels.
 */
export const RENDER_ZOOM_VAR = '--render-zoom';

/**
 * Applies the display settings to the actual game presentation:
 * - `fullscreen` toggles the native Tauri window fullscreen (browser fallback in Vite mode).
 * - `imageRendering` feeds the `image-rendering` used by images and canvases.
 * - `renderScale` is converted into a zoom factor: at 50% the interface is laid out on half of
 *   the screen and then enlarged, so fewer pixels are rendered and components look bigger.
 */
export async function applyDisplaySettings(display: DisplaySettings): Promise<void> {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const renderScale = display.renderScale > 0 ? display.renderScale : 100;
    root.style.setProperty(IMAGE_RENDERING_VAR, display.imageRendering);
    root.style.setProperty(RENDER_ZOOM_VAR, String(100 / renderScale));
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const isFullscreen = await appWindow.isFullscreen();
    if (isFullscreen !== display.fullscreen) {
      await appWindow.setFullscreen(display.fullscreen);
    }
    return;
  } catch {
    // Vite/browser mode has no Tauri window bridge: fall back to the Web API.
  }

  if (typeof document === 'undefined') {
    return;
  }

  try {
    if (display.fullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else if (!display.fullscreen && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // Browsers only allow fullscreen requests in response to a user gesture.
  }
}
