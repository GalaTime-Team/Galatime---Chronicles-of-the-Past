/**
 * Motion of the dialogue layer: characters arriving, leaving and changing
 * expression, the choice list, and the three text styles that move on their own.
 *
 * The dialogue never decides *whether* something moves — that comes from the
 * cast events the backend emitted and from the authored `style` block. This file
 * only turns either into a framer-motion transition.
 *
 * What an author may write, and how much each of those moves, lives in
 * `DialogueVocabulary`.
 */

import type { Transition, Variants } from 'framer-motion';
import type { DialogueMotionFlavour } from './DialogueVocabulary';

/** How long a character takes to arrive on screen. */
export const DIALOGUE_CHARACTER_ENTER_DURATION = 0.45;

/** How long a character takes to leave. Slightly quicker than arriving. */
export const DIALOGUE_CHARACTER_EXIT_DURATION = 0.35;

/** How long a sprite change takes to cross-fade. */
export const DIALOGUE_CHARACTER_EXPRESSION_DURATION = 0.25;

/** How long the whole choice list takes to arrive. */
export const DIALOGUE_CHOICE_ENTER_DURATION = 0.25;

/** Delay between two consecutive choice options. */
export const DIALOGUE_CHOICE_STAGGER = 0.05;

/** How long a highlighted option takes to shift right. */
export const DIALOGUE_CHOICE_FOCUS_DURATION = 0.15;

/** Seconds the shake loop takes for one full left-right cycle. */
export const DIALOGUE_SHAKE_DURATION = 0.32;

/**
 * Travel distance of the strongest shake, as a fraction of the line's own size.
 *
 * An `em` rather than a pixel count because the spoken line scales with the
 * window: a fixed 2px would shrink into invisibility on a wide screen. Roughly
 * 2px at the base line size.
 *
 * Kept small because the shake is a *relative offset* — `left` on a
 * `position: relative` span — and not a transform. Inline text cannot be
 * transformed (a CSS transform is ignored on a non-replaced inline box), and
 * making the segment an `inline-block` to allow one would change where the line
 * breaks, which is what the hidden measuring mirror measures. A relative offset
 * moves the line without touching layout, so the two stay in agreement.
 */
export const DIALOGUE_SHAKE_AMPLITUDE_EM = 0.09;

/**
 * A slow, long settle. Entrances use it so a character arrives rather than
 * snaps into place; exits use a plain ease-in because nobody watches a
 * character leave.
 */
export const DIALOGUE_ENTER_TRANSITION: Transition = {
    duration: DIALOGUE_CHARACTER_ENTER_DURATION,
    ease: [0.16, 1, 0.3, 1],
};

export const DIALOGUE_EXIT_TRANSITION: Transition = {
    duration: DIALOGUE_CHARACTER_EXIT_DURATION,
    ease: 'easeIn',
};

/**
 * Where a character enters from and exits towards, as a stage-width fraction.
 *
 * Read from the slot the stage gave the character rather than from the authored
 * position: the layout decides where everyone stands, so it is also what decides
 * which side they walk in from. A character in the middle has no side to come
 * from, so it rises instead.
 */
export function resolveEntranceOffset(
    slotCentrePercent: number,
    flavour: DialogueMotionFlavour,
): number {
    const direction = slotCentrePercent < 45 ? -1 : slotCentrePercent > 55 ? 1 : 0;

    return direction * 0.12 * flavour.travel;
}

/**
 * CSS transition for a slot sliding to its new place.
 *
 * Used when the cast grows or shrinks and every slot is recalculated. It is a
 * plain CSS transition on `left` on purpose: the element inside is a motion
 * component animating `x`/`y`, and a second transform on the same element would
 * overwrite the first.
 */
export const DIALOGUE_SLOT_MOVE_TRANSITION = `left ${DIALOGUE_CHARACTER_ENTER_DURATION}s cubic-bezier(0.16, 1, 0.3, 1)`;

/**
 * Variants for one character slot.
 *
 * `enter`/`exit` are keyed by `custom` (the entrance offset), so the same
 * variant serves every position instead of one variant set per slot.
 */
export const DIALOGUE_CHARACTER_VARIANTS: Variants = {
    hidden: (offset: number) => ({
        opacity: 0,
        x: `${offset * 100}%`,
        y: offset === 0 ? '6%' : 0,
    }),
    visible: {
        opacity: 1,
        x: '0%',
        y: '0%',
        transition: DIALOGUE_ENTER_TRANSITION,
    },
    exit: (offset: number) => ({
        opacity: 0,
        x: `${offset * 100}%`,
        y: offset === 0 ? '6%' : 0,
        transition: DIALOGUE_EXIT_TRANSITION,
    }),
};

/** Container that staggers the choice list in from the right. */
export const DIALOGUE_CHOICE_CONTAINER_VARIANTS: Variants = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: DIALOGUE_CHOICE_STAGGER,
        },
    },
};

export const DIALOGUE_CHOICE_ITEM_VARIANTS: Variants = {
    hidden: { opacity: 0, x: 24 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: DIALOGUE_CHOICE_ENTER_DURATION, ease: 'easeOut' },
    },
};

/** Shake loop applied to a styled segment asking for one. */
export const DIALOGUE_SHAKE_TRANSITION: Transition = {
    duration: DIALOGUE_SHAKE_DURATION,
    repeat: Infinity,
    ease: 'easeInOut',
};

/**
 * Keyframes of the shake loop, scaled by the requested intensity.
 *
 * `em` strings rather than bare numbers: the values are offsets for `left`, and
 * an unqualified number would be written as a unitless `left`, which is only valid
 * for `0`. `em` also makes the travel follow the line's own size, which changes
 * with the window.
 */
export function buildShakeKeyframes(intensity: number): string[] {
    const amplitude = DIALOGUE_SHAKE_AMPLITUDE_EM * intensity;

    return [0, -amplitude, amplitude, -amplitude, amplitude, 0]
        .map((offset) => `${offset}em`);
}

/**
 * Shake intensity per authored level.
 *
 * `off` is absent on purpose: the presentation layer decides what "off" means
 * (the accessibility setting wins), so a segment asking for `off` simply gets
 * no entry here and is treated as still.
 */
export const DIALOGUE_SHAKE_INTENSITY: Record<string, number> = {
    light: 0.5,
    normal: 1,
    strong: 1.8,
};

/**
 * Seconds one up-and-down bob takes.
 *
 * Slower than the shake on purpose: a wave is a swell the line rides, not a
 * rattle, and a fast vertical loop reads as a glitch rather than as unease.
 */
export const DIALOGUE_WAVE_DURATION = 0.9;

/** Travel distance, in pixels, of the strongest wave. */
export const DIALOGUE_WAVE_AMPLITUDE_PX = 3;

/**
 * Delay between two neighbouring characters, in seconds.
 *
 * This is what makes the wave read as a wave instead of as the whole word
 * jumping at once: every character runs the same loop, offset by its own place
 * in the line. Deliberately shorter than `DIALOGUE_WAVE_DURATION`, so a line is
 * always part-way through several phases at any moment.
 */
export const DIALOGUE_WAVE_PHASE_STEP = 0.09;

/**
 * How many distinct phases the wave uses before it repeats.
 *
 * The offset is taken modulo this, so a long line never drifts into a delay so
 * large that the last characters look frozen. Six is enough for the eye to read
 * a travelling ripple and few enough that the repeat is not visible.
 */
export const DIALOGUE_WAVE_PHASE_STEPS = 6;

/** Wave loop applied to each character of a segment asking for one. */
export const DIALOGUE_WAVE_TRANSITION: Transition = {
    duration: DIALOGUE_WAVE_DURATION,
    repeat: Infinity,
    ease: 'easeInOut',
};

/** Keyframes of the wave loop, scaled by the requested intensity. */
export function buildWaveKeyframes(intensity: number): number[] {
    const amplitude = DIALOGUE_WAVE_AMPLITUDE_PX * intensity;

    return [0, -amplitude, 0, amplitude, 0];
}

/**
 * Wave intensity per authored level.
 *
 * `off` is absent for the same reason as in `DIALOGUE_SHAKE_INTENSITY`: the
 * presentation layer decides what "off" means, so a segment asking for it gets
 * no entry and is treated as still.
 */
export const DIALOGUE_WAVE_INTENSITY: Record<string, number> = {
    light: 0.5,
    normal: 1,
    strong: 1.8,
};

/** Seconds one jitter cycle takes. */
export const DIALOGUE_JITTER_DURATION = 0.16;

/**
 * Travel distance of the strongest jitter, as a fraction of the line's own size.
 *
 * An `em` rather than a pixel count, for the same reason as the shake: the spoken
 * line scales with the window. Deliberately **smaller** than the shake's — a
 * jitter is a tremble, and anything wider stops reading as "barely holding it
 * together" and starts reading as being shoved.
 */
export const DIALOGUE_JITTER_AMPLITUDE_EM = 0.045;

/**
 * The jitter's path, as multiples of its amplitude.
 *
 * A fixed, deliberately uneven sequence rather than a sine wave: a smooth
 * oscillation reads as a wave, and the whole point of a jitter is that no two
 * beats are the same size. The two axes use **different** sequences on purpose —
 * if they matched, the segment would slide along a straight diagonal instead of
 * trembling.
 */
const JITTER_HORIZONTAL_STEPS = [0, -0.85, 0.35, -0.5, 0.7, -0.3, 0.55, -0.6, 0.15, -0.2, 0];
const JITTER_VERTICAL_STEPS = [0, 0.4, -0.9, 0.25, -0.45, 0.65, -0.2, 0.5, -0.55, 0.2, 0];

/**
 * Where in the cycle each step is drawn, as a fraction of the duration.
 *
 * Uneven on purpose, and paired with a linear ease, so the segment stalls for a
 * beat and then snaps — the hiccup of a sob rather than a metronome.
 */
const JITTER_TIMES = [0, 0.06, 0.13, 0.22, 0.31, 0.4, 0.5, 0.62, 0.71, 0.85, 1];

/** Jitter loop applied to a styled segment asking for one. */
export const DIALOGUE_JITTER_TRANSITION: Transition = {
    duration: DIALOGUE_JITTER_DURATION,
    repeat: Infinity,
    ease: 'linear',
    times: JITTER_TIMES,
};

/**
 * Keyframes of the jitter loop, scaled by the requested intensity.
 *
 * `em` strings rather than bare numbers: the values are offsets for `left` and
 * `top`, and an unqualified number would be written as a unitless offset, which
 * is only valid for `0`.
 */
export function buildJitterKeyframes(intensity: number): { left: string[]; top: string[] } {
    const amplitude = DIALOGUE_JITTER_AMPLITUDE_EM * intensity;

    return {
        left: JITTER_HORIZONTAL_STEPS.map((step) => `${step * amplitude}em`),
        top: JITTER_VERTICAL_STEPS.map((step) => `${step * amplitude}em`),
    };
}

/**
 * Jitter intensity per authored level.
 *
 * `off` is absent for the same reason as in `DIALOGUE_SHAKE_INTENSITY`: the
 * presentation layer decides what `off` means, so a segment asking for it gets
 * no entry and is treated as still.
 */
export const DIALOGUE_JITTER_INTENSITY: Record<string, number> = {
    light: 0.5,
    normal: 1,
    strong: 1.8,
};

/**
 * Scales a movement loop's duration by an authored `*_speed` multiplier.
 *
 * The multiplier follows the same convention as the text `speed`: above 1 is
 * faster. A duration is the inverse of a speed, so the multiplier **divides**
 * here rather than multiplies — exactly what `buildTextSchedule` does with
 * `speed_multiplier`. One conversion, in one place, so the three movements can
 * never disagree about which way round it goes.
 *
 * A value that cannot describe a moving loop — `0`, a negative, `NaN` — keeps the
 * default tempo instead of dividing into an infinite duration. The Forger refuses
 * to write one, but a hand-written file must not be able to freeze the text.
 */
export function scaleMotionDuration(duration: number, speed: number | undefined): number {
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) {
        return duration;
    }

    return duration / speed;
}
