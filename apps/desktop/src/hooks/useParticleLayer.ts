import { useEffect, useRef } from 'react';
import type { Container, ISourceOptions } from '@tsparticles/engine';
import { createParticleLayer } from '../utils/particlesEngine';

/**
 * Mounts one decorative tsParticles layer and hands back its container.
 *
 * The lifecycle is serialised through a promise chain: the app runs under
 * `React.StrictMode`, so two mounts load into the same element and the engine hands the
 * second one the first one's container — a `cancelled` flag alone would let the first
 * mount's cleanup destroy the canvas the second mount believes it owns. Chaining the
 * destroy after the load forces create → destroy → create, so the survivor is the
 * successor's.
 *
 * `options` must keep a stable identity (a module-level constant), or the container is
 * rebuilt on every render.
 */
export function useParticleLayer(options: ISourceOptions) {
    const layerRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<Container | null>(null);
    const lifecycle = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        let cancelled = false;

        lifecycle.current = lifecycle.current
            .then(async () => {
                const layer = layerRef.current;
                if (cancelled || !layer) return;

                const container = await createParticleLayer(layer, options);
                if (!container) return;

                if (cancelled) {
                    container.destroy();
                    return;
                }

                containerRef.current = container;
            })
            .catch(() => {
                // Particles are decorative: a failure must never break the fight.
            });

        return () => {
            cancelled = true;
            lifecycle.current = lifecycle.current
                .then(() => {
                    containerRef.current?.destroy();
                    containerRef.current = null;
                })
                .catch(() => { });
        };
    }, [options]);

    return { layerRef, containerRef };
}
