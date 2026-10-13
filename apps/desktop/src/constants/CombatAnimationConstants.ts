/**
 * Tunables of the combat arena choreography.
 *
 * One resolved action is narrated as a short sequence of beats, all measured from the
 * moment the action is submitted:
 *
 *   t = 0            the actor lunges toward the target (and any summon pops in)
 *   t = IMPACT       the blow lands: the target shakes, flashes and shows its number,
 *                    the state is swapped in (health drains, corpses start to sink)
 *   t = TOTAL        the reactions are over and the next turn may begin
 *
 * The beats are driven from `CombatEncounter` (which swaps the state at IMPACT) and read
 * by the presentation layer, so a single set of numbers keeps the visuals and the turn
 * loop in step.
 */

import { MoveDirection, OutMode, type ISourceOptions } from '@tsparticles/engine';

/** How long the actor's lunge lasts, forward and back. */
export const ARENA_LUNGE_MS = 320;

/** When the blow lands, i.e. the delay applied to every impact reaction. */
export const ARENA_IMPACT_MS = 140;

/** How long the reactions play after the impact before the next turn is allowed. */
export const ARENA_SETTLE_MS = 760;

/** Total length of one action's choreography, measured from submit to the next turn. */
export const ARENA_TOTAL_MS = ARENA_IMPACT_MS + ARENA_SETTLE_MS;

/**
 * How long a step with nothing to react to is held.
 *
 * A brace or a reposition has no hit to wait for, so the turn is handed on as soon as the
 * actor's motion is done instead of sitting through the full settle.
 */
export const ARENA_QUIET_TOTAL_MS = ARENA_IMPACT_MS + ARENA_LUNGE_MS;

/** Square particles thrown off by a landed hit. */
export const ARENA_HIT_PARTICLES = 20;

/** Square particles thrown off by a death. */
export const ARENA_DUST_PARTICLES = 30;

/**
 * A single hit this large — as a share of the target's maximum health — shakes the board.
 *
 * A fatal blow always shakes it; this covers the merely enormous.
 */
export const ARENA_SHAKE_RATIO = 0.25;

/**
 * Colour each element's hit flash and spark is tinted with.
 *
 * There is no element palette in the codebase (the element sprites are images), so the
 * tints live here. Anything unknown falls back to white.
 */
export const ELEMENT_TINTS: Record<string, string> = {
    aqua: '#3FB6F0',
    caeli: '#7FE3F0',
    chaos: '#E8556B',
    corporis: '#E0B48A',
    florere: '#5FD08A',
    ignis: '#FF7A2F',
    inanus: '#6A6A80',
    lapis: '#C79A5B',
    lux: '#FFE580',
    spatium: '#6D72CA',
    umbra: '#9B6BE0',
    vetus: '#B0A98F',
    vis: '#D42B42',
};

/** The tint for an element id, or white when it has none. */
export function elementTint(elementId: string | null | undefined): string {
    if (!elementId) return '#FFFFFF';
    return ELEMENT_TINTS[elementId] ?? '#FFFFFF';
}

/**
 * Base options of the hit sparks.
 *
 * Nothing is emitted on its own (`number.value` is 0): a burst is pushed at the point of
 * impact, in the element's tint, so the same container serves every element without being
 * rebuilt. Kept module-level so its identity never changes — a new options object would
 * make the particle layer tear the container down and rebuild it.
 */
export const ARENA_HIT_SPARK_OPTIONS: ISourceOptions = {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
        number: { value: 0 },
        shape: { type: 'square' },
        size: { value: { min: 2, max: 5 } },
        opacity: {
            value: { min: 0, max: 1 },
            animation: { enable: true, startValue: 'max', destroy: 'min', speed: 3, sync: false },
        },
        rotate: { value: 0 },
        life: { count: 1, duration: { value: { min: 0.4, max: 0.7 }, sync: true } },
        move: {
            enable: true,
            speed: { min: 2, max: 7 },
            direction: MoveDirection.none,
            outModes: { default: OutMode.destroy },
        },
    },
    interactivity: {
        events: { onHover: { enable: false }, onClick: { enable: false } },
    },
};

/** Base options of the death dust: slower, bigger, and gone before the corpse has sunk. */
export const ARENA_DEATH_DUST_OPTIONS: ISourceOptions = {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
        number: { value: 0 },
        shape: { type: 'square' },
        paint: { color: { value: '#8A8A96' } },
        size: { value: { min: 2, max: 4 } },
        opacity: {
            value: { min: 0, max: 0.85 },
            animation: { enable: true, startValue: 'max', destroy: 'min', speed: 2, sync: false },
        },
        rotate: { value: 0 },
        life: { count: 1, duration: { value: { min: 0.6, max: 1 }, sync: true } },
        move: {
            enable: true,
            speed: { min: 1, max: 3.5 },
            direction: MoveDirection.none,
            outModes: { default: OutMode.destroy },
        },
    },
    interactivity: {
        events: { onHover: { enable: false }, onClick: { enable: false } },
    },
};
