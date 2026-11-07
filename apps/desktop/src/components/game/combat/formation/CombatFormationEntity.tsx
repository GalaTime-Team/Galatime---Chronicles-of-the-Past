import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react';
import CommonImage from '../../../common/CommonImage';
import { SelectorIcon } from '../../../../assets/GalatimeIcon';
import {
    ARENA_ENTER_MS,
    ARENA_ENTER_STAGGER_MS,
    ARENA_IMPACT_MS,
    ARENA_LUNGE_MS,
    ARENA_STEP_MS,
    ARENA_STEP_STAGGER_MS,
    elementTint,
} from '../../../../constants/CombatAnimationConstants';
import { ELEMENT_DAMAGE_MULTIPLIERS } from '../../../../constants/CombatConstants';
import { CombatFormationHealthMeter } from './CombatFormationHealthMeter';
import { hitFor, type ArenaSequence } from '../battle/combatArenaSequence';
import type { CombatFormationEntity as CombatFormationEntityData, CombatFormationLaneId, CombatFormationSideId } from './CombatFormationHUD.types';
import type { CombatActionImpact } from '../../../../types/CombatType';
import { CombatFormationTooltip } from './CombatFormationTooltip';

const UNKNOWN_ENTITY_IMAGE = '/images/ui/misc/unknown.png';

/** Inline style carrying the side's facing and where a wall journey starts, so one keyframe serves both sides. */
type ArenaLayerStyle = CSSProperties & {
    '--arena-dir'?: number;
    '--arena-step-dx'?: string;
    '--arena-step-dy'?: string;
};

/** Status chips drawn on a sprite before the rest are dropped; the tooltip lists them all. */
const MAX_STATUS_BADGES = 4;

/** Chip fill per effect tone, matching the success/error palette. */
const STATUS_TONE_COLORS: Record<'buff' | 'debuff' | 'neutral', string> = {
    buff: '#236050',
    debuff: '#A42132',
    neutral: 'rgba(255,255,255,0.55)',
};


/**
 * How long a corpse stays on the board: the sink's `delay-1000` plus its `duration-700`.
 *
 * Kept as a number rather than read off the element because the animation can be skipped
 * (`prefers-reduced-motion`) and the lane must still learn that the unit is gone.
 */
const DEATH_SINK_MS = 1700;

/**
 * Chip colour for an action's efficacy against a target.
 *
 * Reads the same way the element tooltip does: the palette names describe how the
 * *target* answers the element, so a red chip means the attack lands harder and a
 * green one means the target shrugs it off.
 */
function effectivenessChip(multiplier: number): string {
    const ladder = ELEMENT_DAMAGE_MULTIPLIERS;
    if (multiplier === ladder.immune) return 'bg-galatime-element-immune';
    if (multiplier <= ladder.super_strong) return 'bg-galatime-element-superStrong';
    if (multiplier < ladder.normal) return 'bg-galatime-element-strong';
    if (multiplier === ladder.normal) return 'bg-black/80';
    if (multiplier < ladder.super_weak) return 'bg-galatime-element-weak';
    return 'bg-galatime-element-superWeak';
}

/** `x0.65`, `x1`, `x1.3` … trimmed to at most two decimals. */
function multiplierLabel(multiplier: number): string {
    return `x${Math.round(multiplier * 100) / 100}`;
}

interface CombatFormationEntityProps {
    entity: CombatFormationEntityData;
    side: CombatFormationSideId;
    lane: CombatFormationLaneId;
    stackIndex: number;
    /**
     * Where the unit stands on its wall, in px.
     *
     * `CombatFormationSide` places each unit along its 45° diagonal: `wallUp` is
     * the height above the wall's ground line, `wallOut` the matching distance from
     * the outboard edge — at 45°, both climb together.
     */
    wallOut: number;
    wallUp: number;
    /**
     * Where the rear twin of this wall's slots stands, if this wall has one.
     *
     * A unit promoted from the rear wall remounts on the front wall when the state
     * swaps, and the entrance animation starts from these offsets, so the journey
     * appears to continue. The rear row itself animates back with its own (smaller)
     * re-place, which needs no numbers.
     */
    stepFrom?: { dx: number; dy: number };
    /** The resolved sprite faces away from this unit's side; draw it flipped. */
    spriteMirrored?: boolean;
    isFocused: boolean;
    hasFocus: boolean;
    isPinned: boolean;
    /**
     * The turn queue put this unit next.
     *
     * The board marks it with the selector icon over the sprite, which is how
     * whose turn it is is read now that the caption is gone.
     */
    isActive?: boolean;
    /** The current action can be aimed at this unit. */
    isTargetable?: boolean;
    /** What the pending action would do to this unit; absent outside targeting. */
    preview?: CombatActionImpact;
    /**
     * Draws the HP meter even while this unit is not the focused one.
     *
     * Set while the player is picking a target, so every candidate's health is
     * readable at the moment the choice is made.
     */
    revealHealth?: boolean;
    /**
     * The choreography of the step being played, if any.
     *
     * The unit picks its own part out of it: whether it is the one lunging, whether it is
     * being struck and for how much, whether a status just landed, and so on.
     */
    sequence?: ArenaSequence | null;
    /**
     * Whether the arena plays its reactions at all.
     *
     * Turned off, a defeated unit is dropped at once instead of sinking out of sight: the
     * sink is a reaction like any other.
     */
    animationsEnabled?: boolean;
    showDetails: boolean;
    onFocus: () => void;
    onClearHover: () => void;
    onClick: () => void;
    /**
     * The death animation has finished, so the lane can stop drawing and counting this unit.
     *
     * A defeated unit keeps its place on the board while it sinks — the movement has to start
     * somewhere — and is taken off its line once it is gone.
     */
    onGone?: () => void;
}

/** Accessible, compact sprite button with a viewport-aware tooltip. */
export function CombatFormationEntity({
    entity,
    side,
    lane,
    stackIndex,
    wallOut,
    wallUp,
    stepFrom,
    spriteMirrored = false,
    isFocused,
    hasFocus,
    isPinned,
    isActive = false,
    isTargetable = false,
    preview,
    revealHealth = false,
    sequence,
    animationsEnabled = true,
    showDetails,
    onFocus,
    onClearHover,
    onClick,
    onGone,
}: CombatFormationEntityProps) {
    const { t } = useTranslation('combat');
    const tooltipId = useId();
    const [keyboardFocused, setKeyboardFocused] = useState(false);
    const [compactTooltip, setCompactTooltip] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
    const [isDying, setIsDying] = useState(false);
    const pointerOnEntity = useRef(false);
    const pointerOnTooltip = useRef(false);
    const clearHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pinnedRef = useRef(isPinned);
    pinnedRef.current = isPinned;
    const goneReported = useRef(false);
    /** Kept in a ref so an inline `onGone` cannot restart the death effect. */
    const onGoneRef = useRef(onGone);
    onGoneRef.current = onGone;

    // `status` is authoritative; the HP check only covers a unit handed over without one.
    const isDefeated = entity.status === 'defeated' || (entity.currentHp !== undefined && entity.currentHp <= 0);

    /* This unit's part in the step being narrated. */
    // The party stands on the left and faces right into the fight, the enemies on the
    // right face left: one var drives every sideways reaction, from lunges to knocks.
    const arenaDir = side === 'allies' ? 1 : -1;
    const hit = hitFor(sequence, entity.id);
    const isActor = sequence?.actorId === entity.id;
    const reflected = sequence?.reflected.find((beat) => beat.unitId === entity.id);
    // A newly drawn unit enters: it mounts when the state swaps and plays its arrival
    // on the layer that also carries the lunge. Index inside its own burst staggers
    // simultaneous entrants so they land one after another, not on top of each other.
    const enterIndex = sequence
        ? Math.max(sequence.summoned.indexOf(entity.id), sequence.transformed.indexOf(entity.id))
        : -1;
    const entering = enterIndex >= 0;
    // A line change re-places the unit: its node remounts into the new row when the
    // state swaps, and the row's keyframe carries it from the old spot to the new one.
    const steppedIndex = sequence?.stepped.indexOf(entity.id) ?? -1;
    const stepped = steppedIndex >= 0;
    // A unit taking part in the choreography shows its health, so the bar is there to drain
    // (or fill) when the blow lands instead of only under the pointer.
    const arenaReveal = isActor || hit !== undefined || reflected !== undefined;

    const enterDelay = entering ? enterIndex * ARENA_ENTER_STAGGER_MS : 0;
    const stepDelay = stepped ? steppedIndex * ARENA_STEP_STAGGER_MS : 0;

    /** Inline vars carrying where this unit's wall journey starts, if it just climbed rows. */
    const journey: ArenaLayerStyle = stepFrom
        ? {
            '--arena-step-dx': `${Math.round(stepFrom.dx)}px`,
            '--arena-step-dy': `${Math.round(stepFrom.dy)}px`,
        }
        : {};

    const lungeStyle: ArenaLayerStyle = {
        ...journey,
        '--arena-dir': arenaDir,
        animation: [
            isActor ? `combat-lunge ${ARENA_LUNGE_MS}ms ease-in-out both` : null,
            entering ? `combat-enter ${ARENA_ENTER_MS}ms ease-out both ${enterDelay}ms` : null,
            stepped
                ? `combat-step-${lane === 'front' ? 'forward' : 'back'} ${ARENA_STEP_MS}ms ease-out both ${stepDelay}ms`
                : null,
        ].filter(Boolean).join(', ') || undefined,
    };
    const hitStyle: ArenaLayerStyle = {
        '--arena-dir': arenaDir,
        animation: hit ? `combat-hit 420ms ease-out ${ARENA_IMPACT_MS}ms both` : undefined,
    };

    const flashTint = hit && hit.kind === 'damage' && hit.isHit ? elementTint(hit.elementId) : null;
    const hitText = hit
        ? (!hit.isHit
            ? t('combat.miss')
            : `${hit.kind === 'heal' ? '+' : '-'}${Math.round(hit.amount)}`)
        : null;
    const hitTextClass = !hit
        ? ''
        : !hit.isHit
            ? 'text-white/85'
            : hit.kind === 'heal'
                ? 'text-galatime-stats-gain-health'
                : 'text-galatime-stats-damage';
    const statusLabel = entity.statusBadges.length > 0
        ? `, ${entity.statusBadges.map((badge) => badge.label).join(', ')}`
        : '';
    // The front row stands nearer the viewer, so its units paint over the rear
    // ones wherever the ground plane draws the rows close together.
    const depthBase = lane === 'front' ? 60 : 0;
    const isRearLine = lane === 'rear';

    useEffect(() => {
        if (isDefeated && !isDying) {
            setIsDying(true);
        }
    }, [isDefeated, isDying]);

    /** Reports the unit gone, once, so its line stops reserving space for it. */
    const reportGone = useCallback(() => {
        if (goneReported.current) return;
        goneReported.current = true;
        onGoneRef.current?.();
    }, []);

    useEffect(() => {
        if (!isDying) return undefined;

        // With the choreography turned off the corpse is simply not there any more.
        if (!animationsEnabled) {
            reportGone();
            return undefined;
        }

        // The transition end is the honest signal, but `prefers-reduced-motion` never fires one
        // and neither does a browser that skips the transition, so a timer backs it up.
        const timer = setTimeout(reportGone, DEATH_SINK_MS);
        return () => clearTimeout(timer);
    }, [isDying, animationsEnabled, reportGone]);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 639px)');
        const update = () => setCompactTooltip(media.matches);
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);

    const { refs, floatingStyles } = useFloating({
        open: isFocused,
        // Details sit outside each force on wider screens, leaving the opposing stacks open.
        // On touch widths, use the compact top alignment, then flip/shift at viewport edges.
        placement: compactTooltip
            ? (side === 'allies' ? 'top-end' : 'top-start')
            : (side === 'allies' ? 'left-start' : 'right-start'),
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(8),
            flip(),
            shift({ padding: 12 }),
            size({
                padding: 12,
                apply({ availableWidth, elements }) {
                    const cap = compactTooltip ? 300 : 280;
                    elements.floating.style.maxWidth = `${Math.max(0, Math.min(availableWidth, cap))}px`;
                },
            }),
        ],
    });

    const cancelPendingClear = () => {
        if (clearHoverTimer.current !== null) {
            clearTimeout(clearHoverTimer.current);
            clearHoverTimer.current = null;
        }
    };

    const scheduleHoverClear = () => {
        cancelPendingClear();
        clearHoverTimer.current = setTimeout(() => {
            clearHoverTimer.current = null;
            if (!pointerOnEntity.current && !pointerOnTooltip.current && !pinnedRef.current) {
                onClearHover();
            }
        }, 100);
    };

    useEffect(() => () => cancelPendingClear(), []);

    const handlePointerEnter = () => {
        if (isDefeated) return;
        pointerOnEntity.current = true;
        cancelPendingClear();
        onFocus();
    };

    const handlePointerLeave = () => {
        if (isDefeated) return;
        pointerOnEntity.current = false;
        scheduleHoverClear();
    };

    const handleTooltipPointerEnter = () => {
        pointerOnTooltip.current = true;
        cancelPendingClear();
    };

    const handleTooltipPointerLeave = () => {
        pointerOnTooltip.current = false;
        scheduleHoverClear();
    };

    const handleBlur = () => {
        setKeyboardFocused(false);
        scheduleHoverClear();
    };

    return (
        <>
            <button
                ref={refs.setReference}
                type="button"
                data-unit-id={entity.id}
                disabled={isDefeated || undefined}
                aria-label={`${entity.name}, ${side === 'allies' ? 'left' : 'right'} ${lane} line${isPinned ? ', pinned' : ''}${isTargetable ? ', target' : ''}${statusLabel}`}
                aria-pressed={isPinned}
                aria-describedby={isFocused ? tooltipId : undefined}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                onFocus={(event) => {
                    if (isDefeated) return;
                    cancelPendingClear();
                    setKeyboardFocused(event.currentTarget.matches(':focus-visible'));
                    onFocus();
                }}
                onBlur={handleBlur}
                onPointerDown={() => setKeyboardFocused(false)}
                onClick={(event) => {
                    event.stopPropagation();
                    // A corpse answers to nothing: it is on its way out of the arena.
                    if (isDefeated) return;
                    onClick();
                }}
                style={{
                    // The unit's spot on its 45° wall. For the allies the wall climbs from
                    // the side's left (outboard) edge; the enemies' wall is its mirror. The
                    // bottom anchors the feet, which the rear wall's scale keeps on the ground.
                    ...(side === 'allies' ? { left: wallOut } : { right: wallOut }),
                    bottom: wallUp,
                    // The rear line stands deeper in the field: drawn smaller from its
                    // feet up, so it reads further away wherever the walls visually
                    // meet. The origin keeps the feet on the wall's ground line, which
                    // the HP meter hangs from.
                    transformOrigin: '50% 100%',
                    transform: isRearLine ? 'scale(var(--arena-row-scale, 0.9))' : undefined,
                    // A unit carrying an effectiveness chip is lifted above its
                    // neighbours, which otherwise overlap it from the wall's negative
                    // spacing. The front wall owns a higher base than the rear one, so
                    // where the walls touch, the nearer unit is drawn on top.
                    zIndex: isFocused
                        ? 2147483647
                        : preview?.kind === 'damage' && isTargetable
                            ? depthBase + 100 + stackIndex
                            : depthBase + stackIndex + 1,
                    outline: keyboardFocused ? 'var(--game-border-width, 2px) solid #fff' : 'none',
                    outlineOffset: keyboardFocused ? '2px' : '0',
                }}
                className="group absolute flex h-14 w-14 items-end justify-center outline-none sm:h-20 sm:w-20"
            >
                {/* Two inert transform layers, one per reaction, so the lunge and the hit
                    shake never fight over the same property - and neither collides with
                    the focus zoom or the death sink, which sit further in. */}
                <div style={lungeStyle} className="relative">
                    <div style={hitStyle} className="relative">
                        <div
                            className={`pointer-events-none relative flex flex-col items-center transition-[transform,opacity,filter] duration-200 motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:scale-100 ${isDefeated ? 'motion-reduce:translate-y-0' : isFocused ? `-translate-y-1 scale-110 ${isPinned ? 'drop-shadow-[0_6px_14px_rgba(255,255,255,0.75)]' : 'drop-shadow-[0_5px_9px_rgba(255,255,255,0.2)]'}` : hasFocus ? 'opacity-40 grayscale' : 'group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0'} ${isRearLine && !isFocused ? 'brightness-70 saturate-75' : ''}`}
                        >
                            {/* The patch of ground the unit stands on. It rides the same
                                layer that scales and dims the sprite, so a deeper line
                                draws smaller shadows at the same time. Held outside the
                                sink's clipping box, so a dying unit fades its shadow
                                instead of dragging it underground with the corpse. */}
                            <span
                                aria-hidden="true"
                                className={`pointer-events-none absolute bottom-0 inset-x-0 mx-auto h-1.5 w-4/5 rounded-full bg-black/55 blur-[2px] transition-opacity duration-700 motion-reduce:transition-none ${isDying ? 'delay-1000 opacity-0' : ''}`}
                                style={entering ? { animation: `combat-enter-shadow ${ARENA_ENTER_MS}ms ease-out backwards ${enterDelay}ms` } : undefined}
                            />
                            {/* Whose turn it is, pinned over the acting unit's head. The
                                icon is sized by font-size: `MiscIcon` draws at `1em`. */}
                            {isActive && (
                                <SelectorIcon className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 text-[14px] text-white/80 sm:text-[16px]" />
                            )}
                            {/*
                             * The ground line: the sprite is clipped at its own base - the
                             * very line the health meter hangs from - so a defeated unit
                             * sinks out of sight instead of sliding across the board.
                             *
                             * `transition-transform` is required, not cosmetic. Tailwind v4
                             * compiles `translate-y-*` to the `translate` property, so a
                             * `transform`-only transition list leaves the sink un-animated
                             * - it snapped down and only the fade played. `translate-y-full`
                             * is exactly one sprite height, i.e. a small move that ends fully
                             * underground, and the delay holds the corpse upright for a
                             * second before it goes.
                             */}
                            <div className="relative overflow-hidden">
                                <div
                                    onTransitionEnd={isDying ? reportGone : undefined}
                                    className={`${animationsEnabled ? 'transition-transform duration-700 ease-in motion-reduce:transition-none motion-reduce:translate-y-0' : ''} ${isDying ? (animationsEnabled ? 'translate-y-full delay-1000' : 'translate-y-full') : ''}`}
                                >
                                    {/* A sprite resolved from the opposite facing is drawn
                                        flipped, so a character never walks backwards. The
                                        mirror sits on its own span, leaving the sink's
                                        translate and the row's scale untouched. */}
                                    <span
                                        className="block"
                                        style={{ transform: spriteMirrored ? 'scaleX(-1)' : undefined }}
                                    >
                                        <CommonImage
                                            src={entity.spriteUrl || UNKNOWN_ENTITY_IMAGE}
                                            alt={entity.name}
                                            fallbackSrc={UNKNOWN_ENTITY_IMAGE}
                                            className="h-8 w-8 sm:h-16 sm:w-16"
                                        />
                                    </span>
                                </div>
                                {/* The element-tinted flash of the blow, clipped to the sprite. */}
                                {flashTint && (
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-0"
                                        style={{
                                            backgroundColor: flashTint,
                                            mixBlendMode: 'screen',
                                            animation: `combat-flash 340ms ease-out ${ARENA_IMPACT_MS}ms both`,
                                        }}
                                    />
                                )}
                            </div>
                            {/* A shield ring on a unit that threw damage back. */}
                            {reflected && (
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-1/2 top-0 z-40 h-8 w-8 -translate-x-1/2 border-game border-galatime-stats-manaTo sm:h-16 sm:w-16"
                                    style={{ animation: `combat-shield 460ms ease-out ${ARENA_IMPACT_MS}ms both` }}
                                />
                            )}
                            {/* Live status effects, at the sprite's top-left corner: the
                                effectiveness chip owns the top-right one. The chip is
                                colour-only - the tooltip spells each effect out - and its
                                outline carries the element the effect came from. */}
                            {entity.statusBadges.length > 0 && (
                                <span className="pointer-events-none absolute -left-1.5 top-0 z-40 flex flex-col gap-0.5">
                                    {entity.statusBadges.slice(0, MAX_STATUS_BADGES).map((badge) => (
                                        <span
                                            key={badge.id}
                                            className="h-1.5 w-1.5 rounded-[1px] border-game border-black/50 sm:h-2 sm:w-2"
                                            style={{
                                                backgroundColor: STATUS_TONE_COLORS[badge.tone],
                                                borderColor: badge.elementId ? elementTint(badge.elementId) : undefined,
                                            }}
                                        />
                                    ))}
                                </span>
                            )}
                            {/* Out of the flow so revealing or hiding it never nudges the
                                sprite: the ground line must not move when the pointer does. A
                                defeated unit is not drawn at all: its health no longer decides
                                anything, and an empty bar over an empty slot is just noise. */}
                            {showDetails && !isDefeated && (isFocused || revealHealth || arenaReveal) && Number.isFinite(entity.currentHp) && entity.currentHp! >= 0 && Number.isFinite(entity.maxHp) && entity.maxHp! > 0 && (
                                <div className="absolute left-1/2 top-full -translate-x-1/2">
                                    <CombatFormationHealthMeter
                                        entityName={entity.name}
                                        current={entity.currentHp!}
                                        max={entity.maxHp!}
                                        previewDamage={isFocused && preview?.kind === 'damage' ? preview.hpDelta : 0}
                                        previewHeal={isFocused && preview?.kind === 'heal' ? -preview.hpDelta : 0}
                                    />
                                </div>
                            )}
                            {/* What the blow cost, or gave back, rising off the sprite. */}
                            {hit && (
                                <span className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2">
                                    <span
                                        className={`block font-pixel text-xs font-bold tabular-nums sm:text-sm ${hitTextClass}`}
                                        style={{
                                            animation: `combat-rise 760ms ease-out ${ARENA_IMPACT_MS}ms both`,
                                            textShadow: '0 2px 4px rgba(0,0,0,0.85)',
                                        }}
                                    >
                                        {hitText}
                                    </span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* While an action has been picked, the unit carries how well its element
                    lands. How much health that costs plays out on the bar below. */}
                {isTargetable && preview?.kind === 'damage' && (
                    <span
                        className={`pointer-events-none absolute -right-1 -top-1 z-40 rounded-sm px-1.5 font-pixel text-xs font-bold sm:text-sm ${effectivenessChip(preview.elementMultiplier)}`}
                        style={{
                            // The chip colour alone is not enough with ranged multipliers
                            // (a `x1` owns near-black, a `x0.65` near-white), so the number
                            // itself carries a dark outline: the stroke paints beneath the
                            // fill, keeping the digits crisp on every rung of the ladder.
                            color: '#fff',
                            WebkitTextStroke: '3px rgba(0,0,0,0.9)',
                            paintOrder: 'stroke fill',
                            textShadow: '0 2px 4px rgba(0,0,0,0.7)',
                        }}
                    >
                        {multiplierLabel(preview.elementMultiplier)}
                    </span>
                )}
            </button>

            {isFocused && typeof document !== 'undefined' && createPortal(
                <CombatFormationTooltip
                    id={tooltipId}
                    entity={entity}
                    showDetails={showDetails}
                    floatingRef={refs.setFloating}
                    style={floatingStyles}
                    onPointerEnter={handleTooltipPointerEnter}
                    onPointerLeave={handleTooltipPointerLeave}
                />,
                document.body,
            )}
        </>
    );
}
