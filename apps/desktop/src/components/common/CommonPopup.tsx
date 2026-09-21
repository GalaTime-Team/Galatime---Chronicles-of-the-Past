import React, { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LimitMode, MoveDirection, OutMode, type Container, type ISourceOptions } from '@tsparticles/engine';
import { AnimatePresence, motion } from 'framer-motion';
import CommonButton from './CommonButton';
import { useModalControls } from '../../context/GameContext';
import { createParticleLayer } from '../../utils/particlesEngine';
import { CloseIcon } from '../../assets/GalatimeIcon';

//region — Types
/** Visual theme of the popup (drives accent colors + default confirm button). */
export type PopupVariant = 'normal' | 'danger' | 'warning' | 'success';
/** Width preset of the dialog. */
export type PopupSize = 'sm' | 'md' | 'lg';
/** Available button styles (mirrors CommonButton variants). */
export type PopupActionVariant = 'primary' | 'danger' | 'success' | 'outline' | 'ghost' | 'warning';

/** Describes a single action button inside the popup. */
export interface CommonPopupAction {
    /** Text displayed on the button. */
    label: string;
    /** What happens when the button is pressed. */
    onPress?: () => void;
    /** Button styling. Defaults to the variant's confirm style (or `outline` for secondary actions). */
    variant?: PopupActionVariant;
    /** Close the popup after the action runs. Default: `true`. */
    autoClose?: boolean;
    /** Disables the button. */
    disabled?: boolean;
    /** Optional test id / key when rendering lists. */
    id?: string;
}

export interface CommonPopupProps {
    /** Controls visibility. */
    open: boolean;

    //region — Content
    /** Main heading. */
    title?: string;
    /** Main body text. Supports rich content (JSX). */
    message?: React.ReactNode;
    /** Extra content rendered below the message. */
    children?: React.ReactNode;
    //endregion — Content

    //region — Appearance
    /** Visual theme. Default: `normal`. */
    variant?: PopupVariant;
    /** Width preset. Default: `md`. */
    size?: PopupSize;
    /** Renders action buttons stacked vertically. Default: `false`. */
    verticalActions?: boolean;
    /** Custom class names for fine-grained styling. */
    className?: string;
    overlayClassName?: string;
    titleClassName?: string;
    messageClassName?: string;
    actionsClassName?: string;
    /** Overrides the overlay z-index class. Default: `z-50`. */
    zClassName?: string;
    //endregion — Appearance

    //region — Actions
    /**
     * Shorthand for a confirmation/alert primary button (right side).
     * Use alone for an alert (1 button) or with `cancelAction` for a confirmation (2 buttons).
     */
    confirmAction?: CommonPopupAction;
    /** Shorthand for the secondary/cancel button (left side). */
    cancelAction?: CommonPopupAction;
    /** Full control: explicit list of actions. When provided, overrides `confirmAction`/`cancelAction`. */
    actions?: CommonPopupAction[];
    //endregion — Actions

    //region — Behavior
    /** Called whenever the popup wants to close (backdrop click, Escape, close button, action autoClose). */
    onDismiss?: () => void;
    /** Close when the backdrop is clicked. Default: `true`. */
    closeOnBackdrop?: boolean;
    /** Show the top-right close button. Default: `true`. */
    showCloseButton?: boolean;
    /** Auto-dismiss after N milliseconds. Disabled by default. */
    autoCloseMs?: number;
    /** Lock body scroll while open. Default: `true`. */
    lockScroll?: boolean;
    //endregion — Behavior

    //region — Glow
    /**
     * Ambient particle glow drifting around the card while the popup is open.
     * Default: `true`.
     */
    glow?: boolean;
    /** Overrides the glow tone. Defaults to the primary tone from `PRIMARY_GLOW_COLOR`. */
    glowColor?: string;
    //endregion — Glow
}
//endregion — Types

//region — Style maps
const VARIANT_STYLES: Record<PopupVariant, {
    border: string;
    accent: string;
    defaultAction: PopupActionVariant;
    /** Variant tone of the card's halo shadow. */
    tone: string;
    /** Lighter variant tone used by the glow particles, so they read on the dark backdrop. */
    particleTone: string;
}> = {
    normal: { border: 'border-galatime-primary/50', accent: 'text-galatime-accent', defaultAction: 'primary', tone: '#6D72CA', particleTone: '#C3C6F2' },
    danger: { border: 'border-galatime-error/60', accent: 'text-galatime-errorHover', defaultAction: 'danger', tone: '#D42B42', particleTone: '#E8556B' },
    warning: { border: 'border-galatime-warning/60', accent: 'text-galatime-warning', defaultAction: 'primary', tone: '#FFBB00', particleTone: '#FFD869' },
    success: { border: 'border-galatime-success/60', accent: 'text-galatime-successHover', defaultAction: 'success', tone: '#36967C', particleTone: '#4FBF9F' },
};

const SIZE_STYLES: Record<PopupSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
};
//endregion — Style maps

//region — Glow config
/** Particles seeded the first time the card can be measured, so the halo is never bare. */
const GLOW_SEED_COUNT = 8;
/** One more particle every N ms keeps the ring alive without ever looking busy. */
const GLOW_SPAWN_INTERVAL = 240;
/** Hard ceiling on live particles; past it the engine retires the oldest one. */
const GLOW_MAX_PARTICLES = 18;
/**
 * Spawn band around a card edge, in canvas units: a particle may be born slightly
 * *under* the edge (negative offset), where the card hides it until it drifts out.
 */
const GLOW_SPAWN_INSET = 10;
const GLOW_SPAWN_SPREAD = 14;

/**
 * Two-tier halo for the card: a tight rim plus a wide, soft bloom, both in the popup's
 * own tone. Inline (rather than a Tailwind class) because the tone is per-variant.
 *
 * The hex tone is converted to rgba at 30 % alpha so the shadow reads as a soft glow
 * instead of a harsh colour bleed.
 */
const hexToRgba = (hex: string, alpha: number) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};

const glowShadow = (tone: string) =>
    `0 0 45px -6px ${hexToRgba(tone, 0.3)}, 0 0 110px -26px ${hexToRgba(tone, 0.3)}`;
//endregion — Glow config

//region — Glow helpers
/** The card's box, expressed in the particle canvas' own coordinate space. */
interface GlowBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Maps the card's on-screen box into canvas units.
 *
 * Both rects are read in CSS pixels and converted through a ratio, which keeps the
 * particles aligned with the card under the app's render zoom and on retina screens.
 * Returns `undefined` while the layer has not been measured yet (size 0), so callers
 * can simply try again on the next tick instead of seeding at a bogus position.
 */
function measureGlowBox(container: Container, card: HTMLElement | null): GlowBox | undefined {
    const canvasSize = container.canvas.size;
    const canvasRect = container.canvas.domElement?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();

    if (!canvasSize || canvasSize.width <= 0 || canvasSize.height <= 0) return undefined;
    if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) return undefined;
    if (!cardRect) return undefined;

    const scaleX = canvasSize.width / canvasRect.width;
    const scaleY = canvasSize.height / canvasRect.height;

    return {
        left: (cardRect.left - canvasRect.left) * scaleX,
        right: (cardRect.right - canvasRect.left) * scaleX,
        top: (cardRect.top - canvasRect.top) * scaleY,
        bottom: (cardRect.bottom - canvasRect.top) * scaleY,
    };
}

/**
 * Pushes `count` square particles onto the ring just around the card's edges.
 *
 * Each particle is born on one of the four edges — sometimes a little *under* it, so the
 * card hides it at first — and is aimed straight outwards from that edge, which is what
 * makes a handful of squares read as if they were escaping from behind the card. Sides
 * are picked proportionally to their length, so the ring stays even.
 */
function spawnGlowParticles(container: Container, box: GlowBox, count: number) {
    const spanX = Math.max(box.right - box.left, 0);
    const spanY = Math.max(box.bottom - box.top, 0);
    const horizontalPerimeter = spanX * 2;
    const verticalPerimeter = spanY * 2;

    for (let i = 0; i < count; i++) {
        const offset = randomBetween(-GLOW_SPAWN_INSET, GLOW_SPAWN_SPREAD);
        let x: number;
        let y: number;
        let direction: MoveDirection;

        if (Math.random() * (horizontalPerimeter + verticalPerimeter) < horizontalPerimeter) {
            x = randomBetween(box.left, box.right);
            const upward = Math.random() < 0.5;
            y = upward ? box.top + offset : box.bottom - offset;
            direction = upward ? MoveDirection.top : MoveDirection.bottom;
        } else {
            y = randomBetween(box.top, box.bottom);
            const leftward = Math.random() < 0.5;
            x = leftward ? box.left + offset : box.right - offset;
            direction = leftward ? MoveDirection.left : MoveDirection.right;
        }

        container.particles.push(1, { x, y }, { move: { direction } });
    }
}
//endregion — Glow helpers

export function CommonPopup({
    open,
    title,
    message,
    children,
    variant = 'normal',
    size = 'md',
    verticalActions = false,
    className = '',
    overlayClassName = '',
    titleClassName = '',
    messageClassName = '',
    actionsClassName = '',
    zClassName = 'z-50',
    confirmAction,
    cancelAction,
    actions,
    onDismiss,
    closeOnBackdrop = true,
    showCloseButton = true,
    autoCloseMs,
    lockScroll = true,
    glow = true,
    glowColor,
}: CommonPopupProps) {
    const { t } = useTranslation();
    const titleId = useId();
    const messageId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);

    // tsParticles container behind the card, plus the node its canvas mounts into.
    const glowContainer = useRef<Container | null>(null);
    const glowLayer = useRef<HTMLDivElement | null>(null);
    // Serialises load/destroy so a StrictMode remount cannot race the previous container.
    const glowLifecycle = useRef<Promise<void>>(Promise.resolve());

    // useId() may contain ':' which is awkward inside an element id, so it is stripped.
    const glowLayerId = `galatime-popup-glow-${useId().replace(/:/g, '')}`;

    const styles = VARIANT_STYLES[variant];

    // Both the halo and the particles follow the popup's own variant colour, so a danger
    // popup (e.g. "exit?") glows red, and `glowColor` overrides the two at once.
    const haloTone = glowColor ?? styles.tone;
    const particleTone = glowColor ?? styles.particleTone;

    //region — Resolved actions
    const resolvedActions = useMemo<CommonPopupAction[]>(() => {
        if (actions) return actions;
        const list: CommonPopupAction[] = [];
        if (cancelAction) list.push(cancelAction);
        if (confirmAction) list.push(confirmAction);
        return list;
    }, [actions, cancelAction, confirmAction]);

    const handleAction = useCallback((action: CommonPopupAction) => {
        action.onPress?.();
        if (action.autoClose !== false) onDismiss?.();
    }, [onDismiss]);
    //endregion — Resolved actions

    //region — Controls
    // The controls the popup answers to while it is open: `confirm` presses the primary
    // action and `deny` the secondary one — the same two the Settings screen binds to
    // Enter and Escape — so a dialog can be answered without a pointer. Claiming a modal
    // layer is what keeps the press from reaching the screen behind it, so one `deny`
    // cancels this dialog instead of also, say, leaving the screen that opened it.
    const confirmTarget = confirmAction ?? resolvedActions[resolvedActions.length - 1];
    // A single-action alert has nothing to cancel, so `deny` simply closes it.
    const cancelTarget = cancelAction ?? (resolvedActions.length > 1 ? resolvedActions[0] : undefined);

    useModalControls(
        {
            confirm: () => { if (confirmTarget) handleAction(confirmTarget); },
            deny: () => { if (cancelTarget) handleAction(cancelTarget); else onDismiss?.(); },
        },
        open,
    );
    //endregion — Controls

    //region — Glow options
    // Kept memoised on purpose: the engine rebuilds the container whenever the options
    // (or the loaded callback) change identity.
    const glowOptions = useMemo<ISourceOptions>(() => ({
        // Fill only the layer behind the card, never the whole viewport.
        fullScreen: { enable: false },
        fpsLimit: 60,
        particles: {
            // The engine spawns nothing on its own — particles are pushed in around the
            // card's border — so this stays at zero and only the limit does any work.
            number: { value: 0, limit: { value: GLOW_MAX_PARTICLES, mode: LimitMode.delete } },
            // The same square mote as the button click burst, so the popup reads as part of
            // the same UI language.
            shape: { type: 'square' },
            paint: { color: { value: particleTone } },
            size: { value: { min: 2.5, max: 6 } },
            opacity: {
                value: { min: 0.5, max: 1 },
                animation: {
                    enable: true,
                    startValue: 'max',
                    destroy: 'min',
                    // Slow fade: a mote has to stay on screen long enough to be seen drifting out.
                    speed: 0.5,
                    sync: false,
                },
            },
            // Additive blending is what turns a handful of squares into a glow: where they
            // overlap the halo brightens instead of flattening out.
            blend: { enable: true, mode: 'lighter' },
            rotate: {
                // Left un-rotated on purpose: the squares stay axis-aligned.
                value: 0,
            },
            move: {
                enable: true,
                // Just enough speed to leave the card's edge, never enough to fly away.
                speed: { min: 0.25, max: 0.8 },
                direction: MoveDirection.none,
                outModes: { default: OutMode.destroy },
            },
            life: {
                count: 1,
                // The fade above normally ends a particle first; this is the safety net.
                duration: { value: { min: 2, max: 3.5 }, sync: false },
            },
        },
        // The overlay must stay invisible to the pointer so the card keeps its own clicks.
        interactivity: {
            events: {
                onHover: { enable: false },
                onClick: { enable: false },
            },
        },
    }), [particleTone]);
    //endregion — Glow options

    //region — Effects
    // Move focus into the dialog when it opens.
    useEffect(() => {
        if (open) dialogRef.current?.focus();
    }, [open]);

    // Optional auto-dismiss timer.
    useEffect(() => {
        if (!open || !autoCloseMs || autoCloseMs <= 0) return;
        const timer = setTimeout(() => onDismiss?.(), autoCloseMs);
        return () => clearTimeout(timer);
    }, [open, autoCloseMs, onDismiss]);

    // Lock background scroll while open.
    useEffect(() => {
        if (!open || !lockScroll) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [open, lockScroll]);

    // Mount the glow layer and keep a slow trickle of particles going around the card.
    // Deliberately imperative (rather than the <ParticlesProvider> wrapper): the glow is
    // decorative, so nothing here may delay or block the popup from rendering.
    useEffect(() => {
        if (!open || !glow) return;

        let cancelled = false;
        let spawnTimer: number | undefined;

        glowLifecycle.current = glowLifecycle.current
            .then(async () => {
                const layer = glowLayer.current;
                if (cancelled || !layer) return;

                const container = await createParticleLayer(layer, glowOptions);
                if (!container || cancelled) {
                    container?.destroy();
                    return;
                }

                glowContainer.current = container;

                // The first tick that can measure the card seeds the whole ring, so the popup
                // never opens bare; every later tick only tops it up.
                let seeded = false;
                const tick = () => {
                    // Decorative: a bad frame must never take the interval — or the popup — down.
                    try {
                        if (container.destroyed) return;
                        const box = measureGlowBox(container, dialogRef.current);
                        if (!box) return;
                        spawnGlowParticles(container, box, seeded ? 1 : GLOW_SEED_COUNT);
                        seeded = true;
                    } catch {
                        // Ignore: worst case the glow stays empty.
                    }
                };

                // Armed before the first tick, so nothing the seeding does can stop the glow
                // from filling in on a later tick.
                spawnTimer = window.setInterval(tick, GLOW_SPAWN_INTERVAL);
                tick();
            })
            .catch(() => {
                // The glow is decorative: swallow failures instead of breaking the popup.
            });

        return () => {
            cancelled = true;
            if (spawnTimer !== undefined) window.clearInterval(spawnTimer);
            glowLifecycle.current = glowLifecycle.current
                .then(() => {
                    glowContainer.current?.destroy();
                    glowContainer.current = null;
                })
                .catch(() => { });
        };
    }, [open, glow, glowOptions]);
    //endregion — Effects

    const handleBackdropClick = () => {
        if (closeOnBackdrop) onDismiss?.();
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-black/70 p-5 ${overlayClassName}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleBackdropClick}
                >
                    {/* Wrapper kept separate from the card so the glow canvas can sit BEHIND it;
              a child of the card would always paint on top of the card's own background. */}
                    <motion.div
                        className={`relative w-full ${SIZE_STYLES[size]}`}
                        initial={{ y: 12, scale: 0.97 }}
                        animate={{ y: 0, scale: 1 }}
                        exit={{ y: 12, scale: 0.97 }}
                    >
                        {glow && (
                            <div
                                ref={glowLayer}
                                id={glowLayerId}
                                aria-hidden="true"
                                /* Larger than the card so the halo can spread and fade instead of being
                                   clipped at the card's own edges. */
                                className="common-popup-glow pointer-events-none absolute -inset-16 z-0"
                            />
                        )}

                        <div
                            ref={dialogRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={title ? titleId : undefined}
                            aria-describedby={message ? messageId : undefined}
                            tabIndex={-1}
                            onClick={(event) => event.stopPropagation()}
                            /* The halo is the card's shadow, tinted with the popup's own variant tone. */
                            style={glow ? { boxShadow: glowShadow(haloTone) } : undefined}
                            className={`relative z-10 w-full border-3 bg-galatime-dark p-4 outline-none ${glow ? '' : 'shadow-2xl'} ${styles.border} ${className}`}
                        >
                            {/* Header row: the title keeps the top-left corner, the close control the
                                top-right one. `ml-auto` is what pins the button to that corner even when
                                there is no title beside it, and `flex-1` lets a long title wrap instead of
                                pushing the button out of place. */}
                            {(title || showCloseButton) && (
                                <div className="flex items-start gap-4">
                                    {title && (
                                        <h2
                                            id={titleId}
                                            className={`min-w-0 flex-1 text-left text-2xl uppercase tracking-[0.12em] text-white ${titleClassName}`}
                                        >
                                            {title}
                                        </h2>
                                    )}
                                    {showCloseButton && (
                                        <button
                                            type="button"
                                            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center text-white/55 transition-colors duration-200 hover:text-white"
                                            aria-label={t('common.close')}
                                            onClick={() => onDismiss?.()}
                                        >
                                            <CloseIcon className="h-3! w-3!" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {message && (
                                <div id={messageId} className={`mt-4 text-base leading-2.5 text-white/65 ${messageClassName}`}>{message}</div>
                            )}

                            {children && <div className="mt-4">{children}</div>}

                            {resolvedActions.length > 0 && (
                                <div className={`mt-6 flex justify-end gap-3 ${verticalActions ? 'flex-col-reverse' : 'flex-row'} ${actionsClassName}`}>
                                    {resolvedActions.map((action, index) => {
                                        const isLast = index === resolvedActions.length - 1;
                                        const actionVariant = action.variant ?? (isLast ? styles.defaultAction : 'ghost');
                                        return (
                                            <CommonButton
                                                key={action.id ?? `${action.label}-${index}`}
                                                variant={actionVariant}
                                                size="md"
                                                disabled={action.disabled}
                                                className={verticalActions ? 'w-full' : ''}
                                                onPress={() => handleAction(action)}
                                            >
                                                {action.label}
                                            </CommonButton>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default CommonPopup;
