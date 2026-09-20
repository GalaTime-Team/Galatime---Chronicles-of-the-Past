import type { Transition } from 'framer-motion';

/**
 * Fade used when navigating between the title-menu pages (TitleMenu, Settings and Credits).
 *
 * The navigation runs with `mode="wait"`, so the leaving page fades out first and only then does
 * the arriving page fade in. Raise this value for a slower, softer change of screen.
 */
export const PAGE_FADE_DURATION = 0.2;

/**
 * Pause (in seconds) between pages: the arriving page waits this long after it mounts — in practice
 * once the leaving page has finished fading out — before it starts fading in. This is what keeps
 * the swap from feeling instantaneous: a navigation takes
 * `PAGE_FADE_DURATION * 2 + PAGE_CHANGE_DELAY` seconds in total.
 */
export const PAGE_CHANGE_DELAY = 0.1;

/** Fade shared by every page, used as-is when a page leaves the screen. */
export const PAGE_FADE_TRANSITION: Transition = { duration: PAGE_FADE_DURATION, ease: 'easeInOut' };

/** Fade of the page that arrives: the same fade, started only after `PAGE_CHANGE_DELAY`. */
export const PAGE_ENTER_TRANSITION: Transition = { ...PAGE_FADE_TRANSITION, delay: PAGE_CHANGE_DELAY };
