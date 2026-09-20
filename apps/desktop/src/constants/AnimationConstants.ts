import type { Transition, Variants } from 'framer-motion';

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

/**
 * Duration (in seconds) of the exclusive SplashScreen -> TitleMenu handoff.
 *
 * The splash fades out over this duration while the title menu performs its one-time "curtain
 * reveal" (see the SPLASH_TITLE_* variants). Slightly longer than the splash fade so the menu is
 * still settling as the splash disappears — this reads as a handoff instead of a hard cut.
 */
export const SPLASH_TO_TITLE_DURATION = 0.8;

/** Signature ease for the handoff: fast start, long silky settle. */
export const SPLASH_TO_TITLE_EASE = [0.16, 1, 0.3, 1] as const;

export const SPLASH_TO_TITLE_TRANSITION: Transition = {
    duration: SPLASH_TO_TITLE_DURATION,
    ease: [...SPLASH_TO_TITLE_EASE],
};

/**
 * Orchestrator for the one-time splash reveal. Staggers children (logo, then each menu button)
 * and starts slightly after mount so the outgoing splash is already visibly fading — the two
 * screens overlap instead of swapping.
 */
export const SPLASH_TITLE_CONTAINER_VARIANTS: Variants = {
    hidden: {},
    visible: {
        transition: {
            delayChildren: 0.1,
            staggerChildren: 0.07,
        },
    },
};

/**
 * Each child of the reveal rises from below with a subtle scale-down and blur, settling into
 * place. The blur sells the "curtain" feel without needing an extra overlay element.
 */
export const SPLASH_TITLE_ITEM_VARIANTS: Variants = {
    hidden: {
        opacity: 0,
        y: 28,
        scale: 0.96,
        filter: 'blur(6px)',
    },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: {
            duration: SPLASH_TO_TITLE_DURATION,
            ease: [...SPLASH_TO_TITLE_EASE],
        },
    },
};