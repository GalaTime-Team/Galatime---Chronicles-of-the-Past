import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * The width an element was actually laid out at, in layout pixels.
 *
 * The number is read from `getBoundingClientRect()`, which reports the element in
 * the same coordinate space its own CSS resolves against — the space a `%` width
 * is a percentage *of*. That matters here because the interface is magnified with
 * a CSS `zoom` on `<html>`: `window.innerWidth` and `documentElement.clientWidth`
 * keep reporting the magnified viewport, so anything derived from them describes a
 * surface twice as wide as the one the components are actually drawn on. The rect
 * is already divided by that zoom, so nothing below has to know about it.
 *
 * It exists because a layout that must not overflow cannot be built from media
 * queries: `matchMedia` is evaluated against the magnified viewport too, so
 * `md:` still matches at 1051px while the layout surface is 525px. Measuring the
 * element is the only answer that stays true at every render scale.
 *
 * `null` until the first measurement, which happens before the browser paints, so
 * a caller that falls back to a sensible default for `null` never shows it.
 */
export function useElementWidth<T extends HTMLElement>(
    ref: RefObject<T | null>,
): number | null {
    const [width, setWidth] = useState<number | null>(null);

    useLayoutEffect(() => {
        const element = ref.current;

        if (!element) {
            return undefined;
        }

        const measure = () => {
            const next = element.getBoundingClientRect().width;

            // Sub-pixel noise is dropped: a resize observer fires for fractional
            // changes that cannot alter a layout decision, and re-rendering for them
            // would be pure churn.
            setWidth((previous) => (
                previous !== null && Math.abs(previous - next) < 0.5 ? previous : next
            ));
        };

        measure();

        const resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(element);

        // A change of render scale resizes the element, and the observer does report
        // it — but only once the document is producing frames, which a backgrounded
        // window is not. Watching the variable itself keeps the measurement correct
        // the moment the new zoom is in the DOM, whatever the window is doing. The
        // attribute is written by `displayService.applyDisplaySettings` and by
        // nothing else, so this is not a general-purpose mutation watch.
        const zoomObserver = new MutationObserver(measure);
        zoomObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style'],
        });

        return () => {
            resizeObserver.disconnect();
            zoomObserver.disconnect();
        };
    }, [ref]);

    return width;
}

export default useElementWidth;
