import React, { useEffect, useId, useMemo, useRef } from 'react';
import { MoveDirection, OutMode, type Container, type ISourceOptions } from '@tsparticles/engine';
import { createParticleLayer } from '../../utils/particlesEngine';
import { playSfx } from '../../controllers/audioController';
import { PARTICLE_COLORS, resolveButtonClasses, type ButtonIconPosition, type ButtonSize, type ButtonVariant } from './commonButtonStyles';

interface CommonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    onPress?: () => void;
    className?: string;
    /** Optional icon rendered alongside the label. Renders icon-only when there is no label at all. */
    icon?: React.ReactNode;
    /** Icon placement. Default: `left`. */
    iconPosition?: ButtonIconPosition;
    children?: React.ReactNode;
    /** When true, every click bursts square particles in the button's own colour. */
    particles?: boolean;
    /** Overrides the burst colour. Defaults to the per-variant tone from `PARTICLE_COLORS`. */
    particleColor?: string;
}

/** How many square particles each click spawns. */
const PARTICLE_COUNT = 24;

const CommonButton: React.FC<CommonButtonProps> = ({
    variant = 'primary',
    size = 'md',
    type = 'button',
    onPress,
    className = '',
    icon,
    iconPosition = 'left',
    children,
    disabled,
    particles = false,
    particleColor,
    onClick,
    ...props
}) => {
    // tsParticles container created for this button, used to spawn the click burst.
    const burstContainer = useRef<Container | null>(null);
    // DOM node the particle canvas gets mounted into.
    const particleLayer = useRef<HTMLDivElement | null>(null);
    // Serialises load/destroy so a StrictMode remount cannot race the previous container.
    const particleLifecycle = useRef<Promise<void>>(Promise.resolve());

    // useId() may contain ':' which is awkward inside an element id, so it is stripped.
    const particlesId = `galatime-button-particles-${useId().replace(/:/g, '')}`;

    const burstColor = particleColor ?? PARTICLE_COLORS[variant];

    // Kept memoised on purpose: the React wrapper rebuilds the container whenever the
    // options (or the loaded callback) change identity.
    const particlesOptions = useMemo<ISourceOptions>(() => ({
        // Fill only the button box, never the whole viewport.
        fullScreen: { enable: false },
        fpsLimit: 60,
        particles: {
            // Nothing is emitted on its own — squares only appear when clicked.
            number: { value: 0 },
            shape: { type: 'square' },
            paint: { color: { value: burstColor } },
            size: { value: { min: 3, max: 6 } },
            opacity: {
                value: { min: 0, max: 1 },
                animation: {
                    enable: true,
                    startValue: 'max',
                    destroy: 'min',
                    speed: 3,
                    sync: false,
                },
            },
            rotate: {
                // Left un-rotated on purpose: the squares stay axis-aligned.
                value: 0,
            },
            life: {
                count: 1,
                // Safety net, in case a fade never reaches zero.
                duration: { value: { min: 0.8, max: 1.2 }, sync: true },
            },
            move: {
                enable: true,
                speed: { min: 1, max: 4 },
                direction: MoveDirection.none,
                outModes: { default: OutMode.destroy },
            },
        },
        // The overlay must stay invisible to the pointer so the button keeps its own clicks.
        interactivity: {
            events: {
                onHover: { enable: false },
                onClick: { enable: false },
            },
        },
    }), [burstColor]);

    // Mount the particle layer after paint. Deliberately imperative (rather than the
    // <ParticlesProvider> wrapper): the burst is decorative, so nothing here may delay
    // or block the rest of the interface from rendering.
    useEffect(() => {
        if (!particles) return;

        let cancelled = false;

        particleLifecycle.current = particleLifecycle.current
            .then(async () => {
                const layer = particleLayer.current;
                if (cancelled || !layer) return;

                const container = await createParticleLayer(layer, particlesOptions);
                if (!container) return;

                if (cancelled) {
                    container.destroy();
                    return;
                }

                burstContainer.current = container;
            })
            .catch(() => {
                // Particles are decorative: swallow failures instead of breaking the button.
            });

        return () => {
            cancelled = true;
            particleLifecycle.current = particleLifecycle.current
                .then(() => {
                    burstContainer.current?.destroy();
                    burstContainer.current = null;
                })
                .catch(() => { });
        };
    }, [particles, particlesOptions]);

    const spawnBurst = (event: React.MouseEvent<HTMLButtonElement>) => {
        const container = burstContainer.current;
        if (!container) return;

        const canvasSize = container.canvas.size;
        // Keyboard activation reports (0, 0), so it falls back to a centred burst.
        let x = canvasSize.width / 2;
        let y = canvasSize.height / 2;

        const canvas = container.canvas.domElement;
        if (event.detail > 0 && canvas) {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                // Ratios keep the origin correct under zoom / retina scaling.
                const ratioX = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
                const ratioY = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
                x = ratioX * canvasSize.width;
                y = ratioY * canvasSize.height;
            }
        }

        container.particles.push(PARTICLE_COUNT, { x, y });
    };

    const handlePointerDown = () => {
        if (disabled) {
            playSfx('denied');
        } else {
            playSfx('click');
        }
    };

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        if (particles) {
            spawnBurst(event);
        }
        onPress?.();
        onClick?.(event);
    };

    const handleMouseEnter = () => {
        playSfx('hover');
    };

    return (
        <button
            type={type}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onMouseEnter={handleMouseEnter}
            disabled={disabled}
            className={resolveButtonClasses({ variant, size, className, icon, children })}
            {...props}
        >
            {particles && (
                <div
                    ref={particleLayer}
                    id={particlesId}
                    /* Larger than the button so the burst can spread and fade instead of
                       being clipped by the (often very short) button box. */
                    className="common-button-particles pointer-events-none absolute -inset-7 z-20"
                />
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
                {icon && iconPosition === 'left' && (
                    <span className="inline-flex shrink-0 items-center">{icon}</span>
                )}
                {children}
                {icon && iconPosition === 'right' && (
                    <span className="inline-flex shrink-0 items-center">{icon}</span>
                )}
            </span>
        </button>
    );
};

export default CommonButton;
