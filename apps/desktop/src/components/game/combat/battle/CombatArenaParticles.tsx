/**
 * One particle canvas for the whole board.
 *
 * Mounting a layer per unit would mean a canvas per sprite (up to forty on a full board),
 * so instead a single pair of layers sits over the arena and each burst is pushed at the
 * screen position of the unit it belongs to. The positions are read from the DOM
 * (`data-unit-id`) at the moment the beat fires, so a re-spaced lane is still correct.
 */

import { useEffect, type RefObject } from 'react';
import type { Container } from '@tsparticles/engine';
import {
    ARENA_DEATH_DUST_OPTIONS,
    ARENA_DUST_PARTICLES,
    ARENA_HIT_PARTICLES,
    ARENA_HIT_SPARK_OPTIONS,
    ARENA_IMPACT_MS,
    elementTint,
} from '../../../../constants/CombatAnimationConstants';
import { useParticleLayer } from '../../../../hooks/useParticleLayer';
import type { ArenaSequence } from './combatArenaSequence';

interface CombatArenaParticlesProps {
    sequence: ArenaSequence | null;
    /** The board the unit sprites live in; used to find their positions. */
    boardRef: RefObject<HTMLElement | null>;
}

/** A client point as canvas coordinates inside a particle layer. */
function toCanvasPoint(
    container: Container,
    layer: HTMLElement,
    clientX: number,
    clientY: number,
): { x: number; y: number } | null {
    const rect = layer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const size = container.canvas.size;
    return {
        x: ((clientX - rect.left) / rect.width) * size.width,
        y: ((clientY - rect.top) / rect.height) * size.height,
    };
}

export function CombatArenaParticles({ sequence, boardRef }: CombatArenaParticlesProps) {
    // Destructured so the effect below depends on the stable refs, not on the hook's
    // freshly-built return object.
    const { layerRef: sparkLayer, containerRef: sparkContainer } = useParticleLayer(ARENA_HIT_SPARK_OPTIONS);
    const { layerRef: dustLayer, containerRef: dustContainer } = useParticleLayer(ARENA_DEATH_DUST_OPTIONS);

    useEffect(() => {
        if (!sequence) return undefined;

        const timers: number[] = [];

        /** Centre of a unit's sprite button, in client coordinates. */
        const unitCentre = (unitId: string): { x: number; y: number } | null => {
            const board = boardRef.current;
            if (!board) return null;

            const target = board.querySelector<HTMLElement>(`[data-unit-id="${CSS.escape(unitId)}"]`);
            if (!target) return null;

            const rect = target.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };

        const burst = (
            layerRef: RefObject<HTMLDivElement | null>,
            containerRef: RefObject<Container | null>,
            unitId: string,
            count: number,
            tint: string | undefined,
            delay: number,
        ) => {
            timers.push(window.setTimeout(() => {
                const container = containerRef.current;
                const layer = layerRef.current;
                if (!container || !layer) return;

                const centre = unitCentre(unitId);
                if (!centre) return;

                const point = toCanvasPoint(container, layer, centre.x, centre.y);
                if (!point) return;

                // The tint is an override, so one container serves every element without
                // being rebuilt between hits.
                container.particles.push(
                    count,
                    point,
                    tint ? { paint: { color: { value: tint } } } : undefined,
                );
            }, delay));
        };

        for (const hit of sequence.hits) {
            if (hit.kind === 'damage' && hit.isHit) {
                burst(sparkLayer, sparkContainer, hit.targetId, ARENA_HIT_PARTICLES, elementTint(hit.elementId), ARENA_IMPACT_MS);
            }
        }

        for (const unitId of sequence.defeated) {
            burst(dustLayer, dustContainer, unitId, ARENA_DUST_PARTICLES, undefined, ARENA_IMPACT_MS);
        }

        return () => {
            for (const timer of timers) window.clearTimeout(timer);
        };
    }, [sequence, boardRef, sparkLayer, sparkContainer, dustLayer, dustContainer]);

    return (
        <>
            <div ref={sparkLayer} aria-hidden="true" className="pointer-events-none absolute inset-0 z-30" />
            <div ref={dustLayer} aria-hidden="true" className="pointer-events-none absolute inset-0 z-30" />
        </>
    );
}

export default CombatArenaParticles;
