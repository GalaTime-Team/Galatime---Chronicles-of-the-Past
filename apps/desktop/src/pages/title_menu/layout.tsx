import { useEffect, useRef } from 'react';
import type { Container, ISourceOptions } from '@tsparticles/engine';
import { createParticleLayer } from '../../utils/particlesEngine';

interface TitleMenuLayoutProps {
    children: React.ReactNode;
}

/** Falling-dust particle layer rendered behind every title-menu page. */
const PARTICLES_OPTIONS: ISourceOptions = {
    fullScreen: { enable: false },
    detectRetina: true,
    fpsLimit: 60,
    background: { color: 'transparent' },
    particles: {
        number: { value: 45, density: { enable: true } },
        color: { value: ['#C5B4E9', '#8F92D6', '#FFFFFF'] },
        shape: { type: 'circle' },
        opacity: {
            value: { min: 0.08, max: 0.4 },
            animation: { enable: true, speed: 0.4, minimumValue: 0.05, sync: false },
        },
        size: { value: { min: 1, max: 2.6 } },
        move: {
            enable: true,
            direction: 'bottom',
            speed: { min: 0.4, max: 1.4 },
            random: true,
            straight: false,
            outModes: { default: 'out' },
        },
        wobble: { enable: true, distance: 12, speed: 2 },
    },
    interactivity: { events: { onHover: { enable: false }, onClick: { enable: false } } },
};

/**
 * Shared shell for all title-menu pages: the global `galatime-background`
 * plus a live falling-particles layer. Because this component stays mounted
 * while pages inside it fade in and out (AnimatePresence in App), the
 * background and particles never re-animate between transitions — only the
 * page content changes.
 */
export function TitleMenuLayout({ children }: TitleMenuLayoutProps) {
    const particlesRef = useRef<HTMLDivElement>(null);
    // tsParticles container behind every page, kept so it can be torn down on unmount.
    const particlesContainer = useRef<Container | null>(null);
    // Serialises load/destroy so a StrictMode remount cannot race the previous container.
    // Both mounts load into the SAME element, and the engine keys a container by that
    // element, so the second load hands back the first one's container. Unserialised, the
    // first mount's cleanup then destroys the canvas the second mount believes it owns and
    // the shell is left with no background at all.
    const particlesLifecycle = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        let cancelled = false;

        particlesLifecycle.current = particlesLifecycle.current
            .then(async () => {
                const element = particlesRef.current;
                if (cancelled || !element) return;

                const container = await createParticleLayer(element, PARTICLES_OPTIONS);
                if (!container) return;

                // Only ever destroy our own container: on a StrictMode remount this one is
                // the discarded layer's, while the survivor is the successor's.
                if (cancelled) {
                    container.destroy();
                    return;
                }

                particlesContainer.current = container;
            })
            .catch(() => {
                // The layer is decorative: swallow failures instead of breaking the shell.
            });

        return () => {
            cancelled = true;
            particlesLifecycle.current = particlesLifecycle.current
                .then(() => {
                    particlesContainer.current?.destroy();
                    particlesContainer.current = null;
                })
                .catch(() => { });
        };
    }, []);

    return (
        <div className="relative min-h-screen overflow-hidden bg-galatime-background font-custom text-white">
            {/* Particles layer — decorative, always behind page content. */}
            <div ref={particlesRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" />
            <div className="relative z-10">{children}</div>
        </div>
    );
}
