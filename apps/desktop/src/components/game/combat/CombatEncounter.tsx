/**
 * A whole fight, playable, in one component.
 *
 * Drop it on any screen with an encounter and it runs the battle end to end: it
 * opens a session through `controllers/combatController`, walks the turn queue,
 * hands the player their own turns, plays everyone else's, and closes the session
 * when the fight is over. The caller supplies the fight, a sprite resolver and an
 * `onFinish` callback — nothing else.
 *
 * Whose turn it is decides what is drawn. A unit the player controls gets the
 * action HUD and picks an action (and, when the action needs one, a target on the
 * board); while anybody else is acting the arena stands alone. `CombatBattle` owns
 * that rule, so any screen composing it inherits the same behaviour.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { createPortal } from 'react-dom';
import {
    endCombatSession,
    fetchCombatActions,
    fetchCombatDecisionContext,
    fetchCombatInventory,
    fetchCombatWeapons,
    startCombatEncounter,
    takeCombatAction,
    takeCombatWeaponSwitch,
    type CombatInventoryEntry,
    type CombatWeaponEntry,
} from '../../../controllers/combatController';
import { previewCombatAttack } from '../../../controllers/damageController';
import { chooseCombatAction } from '../../../services/combat/combatAi';
import { CloseIcon } from '../../../assets/GalatimeIcon';
import CommonImage from '../../common/CommonImage';
import type {
    CombatAction,
    CombatActionImpact,
    CombatActionPreview,
    CombatActionRequest,
    CombatEncounter as CombatEncounterData,
    CombatEvent,
    CombatOutcome,
    CombatState,
    StartCombatOptions,
} from '../../../types/CombatType';
import { useGame } from '../../../context/GameContext';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';
import { BREAK_WARNING_DURABILITY } from './hud/ExtraMovementCard';
import { buildArenaSequence, type ArenaSequence } from './battle/combatArenaSequence';
import { CombatBattle } from './battle/CombatBattle';
import { selectTurnUnit } from './battle/combatBattleView';
import type { CombatSpriteResolver } from './battle/combatBattleView';

/**
 * How long an opponent's move is left on screen before it resolves.
 *
 * Kept short: the arena's own choreography now supplies the pacing after the move, so a
 * long pre-move pause would only make every enemy turn drag.
 */
const DEFAULT_AI_DELAY_MS = 350;

export interface CombatEncounterProps {
    /** Authored fight to run. Use `encounterId` instead to load one from disk. */
    encounter?: CombatEncounterData;
    /** Id of an authored encounter in `data/combat/encounters`. */
    encounterId?: string;
    /** Resolves a unit's sprite; supplied by the app, which owns the sprite index. */
    resolveSpriteUrl?: CombatSpriteResolver;
    /** Called once when the fight ends, with its outcome and final state. */
    onFinish?: (outcome: CombatOutcome, state: CombatState) => void;
    /**
     * Called after every resolved step with only the events that step produced,
     * plus the fight as it stands. Goal: a screen can narrate the maths.
     *
     * Held in a ref internally, so passing an inline closure does not restart the
     * fight.
     */
    onEvents?: (events: readonly CombatEvent[], state: CombatState) => void;
    /** Overrides `gameState.settings.fightingTooltipVisible` for previews. */
    tooltipVisible?: boolean;
    /** Attack grid shape; defaults to the HUD's 2x2. */
    gridConfig?: { columns: number; rows: number };
    /** Pause before an opponent's move, so the player can follow what happened. */
    aiDelayMs?: number;
    /**
     * Opens a picker when the player chooses the `inventory` action, so an item and
     * its target can be chosen. Off by default: only the Test Playground turns it on.
     */
    inventoryPicker?: boolean;
    /**
     * Extra options for the `startCombat` call, read once when the fight opens.
     *
     * Held in a ref like `onEvents`, so an inline object does not restart the
     * fight on every render of the screen that owns it.
     */
    startOptions?: StartCombatOptions;
    className?: string;
}

/**
 * Copies the fight so React sees a change.
 *
 * The combat service resolves a turn by mutating the state it owns and handing
 * back the same object, so storing it as-is would leave every memo in the HUD
 * pointing at unchanged references. Copying the state and its units gives them
 * something new to re-render from.
 */
function snapshot(state: CombatState): CombatState {
    return { ...state, units: state.units.map((unit) => ({ ...unit })) };
}

/**
 * One row of the combat item picker: sprite, name, count — nothing else.
 *
 * The sprite path is derived from the item id (`/images/items/<id>.png`), never
 * authored; an item without a drawing falls back to the unknown glyph, the same
 * convention the rest of the icons follow. The full description waits for the
 * hover, so the grid stays scannable while the detail stays one glance away.
 */
function InventoryChoiceButton({
    entry,
    tooltips,
    selected,
    dimmed,
    onChoose,
}: {
    entry: CombatInventoryEntry;
    tooltips: boolean;
    /** The item whose target is being picked: drawn with a soft white glow. */
    selected: boolean;
    /** Another item is being aimed, so this one recedes behind it. */
    dimmed: boolean;
    onChoose: (entry: CombatInventoryEntry) => void;
}) {
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);

    const { refs, floatingStyles } = useFloating({
        open: isTooltipVisible,
        onOpenChange: setIsTooltipVisible,
        placement: 'top',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift({ padding: 12 })],
    });

    return (
        <button
            type="button"
            ref={refs.setReference}
            onClick={() => {
                if (entry.usable) onChoose(entry);
            }}
            onMouseEnter={() => setIsTooltipVisible(true)}
            onMouseLeave={() => setIsTooltipVisible(false)}
            aria-disabled={!entry.usable || undefined}
            aria-pressed={selected || undefined}
            className={`flex w-full items-center gap-2 border-2 p-1 text-left transition-[opacity,filter,box-shadow,background-color,border-color] duration-200 ${
                selected
                    ? 'border-white bg-galatime-darkHover text-white shadow-[0_0_14px_rgba(255,255,255,0.45)]'
                    : entry.usable
                        ? 'border-white/70 bg-galatime-dark text-white/70 hover:border-white hover:bg-galatime-darkHover hover:text-white'
                        : 'cursor-not-allowed border-white/70 bg-galatime-dark text-white/70 opacity-30 grayscale'
            } ${dimmed ? 'opacity-40 grayscale' : ''}`}
        >
            <CommonImage
                src={`/images/items/${entry.itemId}.png`}
                alt={entry.name}
                fallbackSrc="/images/elements/unknown.png"
                className="h-10 w-10 shrink-0 object-contain"
            />

            <div className="min-w-0 flex-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-lg uppercase leading-2.5 tracking-wide -translate-y-0.5">
                    {entry.name}
                </span>
                <span className="shrink-0 text-sm leading-2.5 text-white/40">
                    ×<span className="tabular-nums text-white">{entry.quantity}</span>
                </span>
            </div>

            {tooltips && isTooltipVisible && createPortal(
                <div
                    ref={refs.setFloating}
                    style={floatingStyles}
                    className="pointer-events-none z-50"
                >
                    <div className="flex max-w-[min(20rem,calc(100vw-2rem))] items-start gap-3 border-2 border-white bg-galatime-dark px-3 py-2.5 text-white shadow-[0_8px_26px_rgba(0,0,0,0.6)]">
                        <CommonImage
                            src={`/images/items/${entry.itemId}.png`}
                            alt={entry.name}
                            fallbackSrc="/images/elements/unknown.png"
                            className="h-16 w-16 shrink-0 object-contain"
                        />
                        <div className="flex min-w-0 flex-col gap-y-0.5">
                            <span className="font-pixel text-sm uppercase leading-2.5 tracking-[0.08em] sm:text-lg">
                                {entry.name}
                            </span>
                            <span className="font-pixel text-xs leading-2.5 text-white/75 sm:text-sm">
                                ×{entry.quantity}
                            </span>
                            {entry.description && (
                                <span className="font-pixel text-[10px] leading-2.5 text-white/55 sm:text-xs">
                                    {entry.description}
                                </span>
                            )}
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </button>
    );
}

/**
 * One weapon in the inventory's weapon tab.
 *
 * The weapon in hand is drawn all white, with black text. Every other weapon is black
 * with white borders and text. A weapon close to breaking gets the same red pulse the
 * extra movement card uses, so the warning reads the same in both places. A broken
 * weapon is kept on the list but cannot be drawn.
 */
function WeaponChoiceButton({
    entry,
    tooltips,
    onChoose,
}: {
    entry: CombatWeaponEntry;
    tooltips: boolean;
    onChoose: (entry: CombatWeaponEntry) => void;
}) {
    const { t } = useTranslation('combat');
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);
    const { refs, floatingStyles } = useFloating({
        open: isTooltipVisible,
        onOpenChange: setIsTooltipVisible,
        placement: 'top',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift({ padding: 12 })],
    });

    const broken = !entry.usable;
    const aboutToBreak = !entry.indestructible
        && entry.durability !== null
        && entry.durability > 0
        && entry.durability < BREAK_WARNING_DURABILITY;

    return (
        <button
            type="button"
            ref={refs.setReference}
            onClick={() => {
                if (entry.usable && !entry.equipped) onChoose(entry);
            }}
            onMouseEnter={() => setIsTooltipVisible(true)}
            onMouseLeave={() => setIsTooltipVisible(false)}
            aria-disabled={broken || undefined}
            aria-pressed={entry.equipped || undefined}
            className={`flex w-full items-center gap-2 border-2 p-1 text-left transition-[opacity,filter,box-shadow,background-color,border-color] duration-200 ${
                entry.equipped
                    ? 'border-white bg-white text-black'
                    : 'border-white bg-black text-white hover:bg-white/10'
            } ${aboutToBreak ? 'border-galatime-error shadow-[0_0_14px_rgba(255,80,80,0.55)] animate-pulse motion-reduce:animate-none' : ''} ${
                broken ? 'cursor-not-allowed opacity-30 grayscale' : ''
            }`}
        >
            <CommonImage
                src={`/images/weapons/${entry.weaponId}.png`}
                alt={entry.name}
                fallbackSrc="/images/elements/unknown.png"
                className="h-10 w-10 shrink-0 object-contain"
            />

            <div className="min-w-0 flex-1 flex flex-col">
                <span className="truncate text-base uppercase leading-2.5 tracking-wide">
                    {entry.name}
                </span>
                {(broken || aboutToBreak) && (
                    <span className={`font-pixel text-[10px] leading-2.5 ${entry.equipped ? '' : 'text-galatime-error'}`}>
                        {broken ? t('combat.weaponBroken') : t('combat.weaponAboutToBreak')}
                    </span>
                )}
            </div>

            {tooltips && isTooltipVisible && createPortal(
                <div
                    ref={refs.setFloating}
                    style={floatingStyles}
                    className="pointer-events-none z-50"
                >
                    <div className="flex max-w-[min(20rem,calc(100vw-2rem))] flex-col gap-y-1 border-2 border-white bg-galatime-dark px-3 py-2.5 text-white shadow-[0_8px_26px_rgba(0,0,0,0.6)]">
                        <span className="font-pixel text-sm uppercase leading-2.5 tracking-[0.08em] sm:text-lg">
                            {entry.name}
                        </span>
                        <div className="flex gap-3 text-sm leading-2.5 text-white/40">
                            <div className="flex gap-1">
                                <span>PW</span>
                                <span className="text-white">{entry.power}</span>
                            </div>
                            <div className="flex gap-1">
                                <span>ACC</span>
                                <span className="text-white">{entry.accuracy}</span>
                            </div>
                            <div className="flex gap-1">
                                <span>MN</span>
                                <span className="text-white">{entry.manaCost}</span>
                            </div>
                            <div className="flex gap-1">
                                <span>SN</span>
                                <span className="text-white">{entry.staminaCost}</span>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </button>
    );
}

export function CombatEncounter({
    encounter,
    encounterId,
    resolveSpriteUrl,
    onFinish,
    onEvents,
    tooltipVisible,
    gridConfig,
    aiDelayMs = DEFAULT_AI_DELAY_MS,
    inventoryPicker = false,
    startOptions,
    className = '',
}: CombatEncounterProps) {
    const { t } = useTranslation('combat');
    const { gameState } = useGame();
    const reduceMotion = usePrefersReducedMotion();
    const [state, setState] = useState<CombatState | null>(null);
    const [failed, setFailed] = useState(false);
    /** Action the player picked that still needs a target named. */
    const [pending, setPending] = useState<CombatActionPreview | null>(null);
    /** The usable items, while the item picker is open (Test Playground only). */
    const [inventoryChoices, setInventoryChoices] = useState<CombatInventoryEntry[] | null>(null);
    /** The weapons the active unit carries, read when the inventory opens (Test Playground only). */
    const [weaponChoices, setWeaponChoices] = useState<CombatWeaponEntry[]>([]);
    /** Which tab of the inventory is showing. */
    const [inventoryTab, setInventoryTab] = useState<'items' | 'weapons'>('items');
    /** An item chosen from the picker that still needs a target on the board. */
    const [pendingItem, setPendingItem] = useState<{ itemId: string; name: string; targetIds: string[] } | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    /**
     * The step being narrated, or `null` when the board is ready for the next turn.
     *
     * The backend resolves an action in one go, so this is what stops the fight from
     * jumping straight to its result: the new state is only swapped in when the blow lands.
     */
    const [sequence, setSequence] = useState<ArenaSequence | null>(null);

    /** Session already reported through `onFinish`, so it is only reported once. */
    const reported = useRef<string | null>(null);
    /** Kept in a ref so an inline `onEvents` never invalidates the opening effect. */
    const onEventsRef = useRef(onEvents);
    onEventsRef.current = onEvents;
    /** Start options read once at fight open, so an inline object cannot restart it. */
    const startOptionsRef = useRef(startOptions);
    startOptionsRef.current = startOptions;
    /** The resolved step waiting for its impact beat, with the events it produced. */
    const pendingRef = useRef<{ state: CombatState; events: readonly CombatEvent[] } | null>(null);
    /** Source of sequence ids, so a component can tell one step from the next. */
    const sequenceId = useRef(0);

    /** Whether the arena narrates its steps or resolves them instantly. */
    const animate = (gameState.settings.combatAnimations ?? true) && !reduceMotion;

    /** A step is being played: the turn has not really moved on yet. */
    const busy = sequence !== null;
    const turnUnit = state ? selectTurnUnit(state) : null;
    const playerTurn = !busy && turnUnit?.isPlayerControlled === true;

    /** The player's actions, with usability and legal targets, for the HUD. */
    const previews = useMemo(() => {
        if (!state || !playerTurn || !turnUnit) return undefined;

        const result = fetchCombatActions(state.sessionId, turnUnit.id);
        return result.ok ? result.data : undefined;
    }, [state, playerTurn, turnUnit]);

    /**
     * What the pending action would do to each unit it may be aimed at.
     *
     * Worked out for the whole target list rather than on hover, so the board has
     * the numbers the moment the pointer arrives instead of a frame later.
     */
    const targetPreviews = useMemo(() => {
        if (!state || !pending || !turnUnit) return undefined;

        const previewsByUnit = new Map<string, CombatActionImpact>();
        for (const targetId of pending.targetIds) {
            const result = previewCombatAttack(state.sessionId, turnUnit.id, pending.action.id, targetId);
            if (result.ok) previewsByUnit.set(targetId, result.data);
        }

        return previewsByUnit;
    }, [state, pending, turnUnit]);

    /* Opening the fight — once per encounter, abandoned cleanly on unmount. */
    useEffect(() => {
        let cancelled = false;
        let opened: string | null = null;

        reported.current = null;
        setState(null);
        setPending(null);
        setPendingItem(null);
        setInventoryChoices(null);
        setNotice(null);
        setFailed(false);

        void (async () => {
            // The game's difficulty decides how well the opponents play. A caller
            // that injects its own `startOptions.difficulty` still wins.
            const difficulty = gameState.settings.difficulty ?? 'normal';
            const result = encounterId
                ? await startCombatEncounter(encounterId, { difficulty, ...startOptionsRef.current })
                : encounter
                    ? await startCombatEncounter(encounter.id, { encounter, difficulty, ...startOptionsRef.current })
                    : null;

            if (!result) return;

            if (cancelled) {
                // The screen went away while the encounter was loading.
                if (result.ok) endCombatSession(result.data.sessionId);
                return;
            }

            if (!result.ok) {
                setFailed(true);
                return;
            }

            opened = result.data.sessionId;
            const opening = snapshot(result.data);
            setState(opening);
            onEventsRef.current?.(opening.log, opening);
        })();

        return () => {
            cancelled = true;
            if (opened) endCombatSession(opened);
            opened = null;
        };
    }, [encounter, encounterId]);

    /**
     * Sends one action and starts narrating what it did.
     *
     * The backend resolves the whole step at once, so the arena is driven from its events:
     * a choreography is built and played out, and only when it is over does the next turn
     * begin. With animations turned off — or the system asking for less motion — the new
     * state is applied immediately and the fight moves straight on.
     */
    const submit = useCallback((request: CombatActionRequest) => {
        // A step already in flight owns the board until it is done.
        if (!state || sequence) return;

        const result = takeCombatAction(state.sessionId, request);
        if (!result.ok) {
            setNotice(result.error.message);
            return;
        }

        const next = snapshot(result.data.state);
        setNotice(null);
        setPending(null);
        setPendingItem(null);
        setInventoryChoices(null);

        const arena = animate
            ? buildArenaSequence(++sequenceId.current, result.data.events, next)
            : null;

        if (!arena) {
            setState(next);
            onEventsRef.current?.(result.data.events, next);
            return;
        }

        pendingRef.current = { state: next, events: result.data.events };
        setSequence(arena);
    }, [state, sequence, animate]);

    /**
     * Plays the choreography: the blow lands at IMPACT, the turn resumes at TOTAL.
     *
     * Holding the new state back until the impact is what lets the health bars drain *with*
     * the hit instead of the instant the action is submitted.
     */
    useEffect(() => {
        if (!sequence) return undefined;

        const impact = window.setTimeout(() => {
            const pendingStep = pendingRef.current;
            if (!pendingStep) return;

            pendingRef.current = null;
            setState(pendingStep.state);
            onEventsRef.current?.(pendingStep.events, pendingStep.state);
        }, sequence.impactAtMs);

        const settle = window.setTimeout(() => {
            pendingRef.current = null;
            setSequence(null);
        }, sequence.totalMs);

        return () => {
            window.clearTimeout(impact);
            window.clearTimeout(settle);
        };
    }, [sequence]);

    /** Everyone the player does not own takes their turn on a short timer. */
    useEffect(() => {
        if (!state || state.phase !== 'active' || !turnUnit || playerTurn) return undefined;
        // The next turn waits for the current one to finish playing.
        if (sequence) return undefined;

        const timer = window.setTimeout(() => {
            const context = fetchCombatDecisionContext(state.sessionId, turnUnit.id);
            const request = context.ok ? chooseCombatAction(context.data) : null;

            if (request) submit(request);
            else setNotice(t('combat.stalled'));
        }, turnUnit.aiProfile?.pace ?? aiDelayMs);

        return () => window.clearTimeout(timer);
    }, [state, turnUnit, playerTurn, aiDelayMs, submit, t, sequence]);

    /* Reporting the end of the fight, once — after the last blow has been shown. */
    useEffect(() => {
        if (!state || sequence || state.phase !== 'finished' || !state.outcome) return;
        if (reported.current === state.sessionId) return;

        reported.current = state.sessionId;
        onFinish?.(state.outcome, state);
    }, [state, sequence, onFinish]);

    /** Playing a card: resolve it, or start choosing who it lands on. */
    const handleAction = useCallback((action: CombatAction) => {
        // Nothing may be picked while the previous step is still playing.
        if (sequence) return;

        const preview = previews?.find((candidate) => candidate.action.id === action.id);

        // A card the backend already refused is drawn disabled, but a click must never slip
        // through and spend the turn on a rejection.
        if (preview && !preview.usable) return;

        // While an action is waiting for its target, only that action can be clicked again
        // (to cancel it). Every other card is dimmed and must not respond.
        if (pending) {
            if (pending.action.id === action.id) setPending(null);
            return;
        }

        // Same for an item whose target is being picked on the board.
        if (pendingItem) return;

        // The inventory is not an attack: the picker chooses the item, and — for a
        // single-target item — the board then chooses who it lands on.
        if (action.kind === 'inventory') {
            if (!inventoryPicker || !state || !turnUnit) return;

            const result = fetchCombatInventory(state.sessionId, turnUnit.id);
            if (!result.ok) {
                setNotice(result.error.message);
                return;
            }

            const weapons = fetchCombatWeapons(state.sessionId, turnUnit.id);
            if (!weapons.ok) {
                setNotice(weapons.error.message);
                return;
            }

            // An empty bag still opens the picker: the player sees the panel and
            // its empty state rather than a notice that flashes and is gone.
            setPending(null);
            setWeaponChoices(weapons.data);
            setInventoryTab('items');
            setInventoryChoices(result.data);
            return;
        }

        if (action.targeting !== 'enemy_one') {
            submit({ actionId: action.id });
            return;
        }

        setPending(preview ?? null);
    }, [pending, pendingItem, previews, submit, inventoryPicker, state, turnUnit, sequence]);

    /**
     * An item was chosen: submit it, or keep the picker open while the player picks
     * its target on the board. The picker only closes once the item is actually used.
     */
    const handleInventoryChoice = useCallback((entry: CombatInventoryEntry) => {
        if (entry.targetIds.length === 0) {
            setInventoryChoices(null);
            submit({ actionId: 'inventory', itemId: entry.itemId });
            return;
        }

        setPendingItem({ itemId: entry.itemId, name: entry.name, targetIds: entry.targetIds });
    }, [submit]);

    /**
     * A weapon was chosen: it is swapped into hand straight away.
     *
     * Costs no turn, so the fight is not advanced and no opponent moves. The
     * refreshed state is applied immediately, which re-derives the weapon card and
     * the swings the HUD offers.
     */
    const handleWeaponChoice = useCallback((entry: CombatWeaponEntry) => {
        if (!state || sequence || pendingItem || pending) return;
        if (!entry.usable || entry.equipped) return;

        const result = takeCombatWeaponSwitch(state.sessionId, entry.index);
        if (!result.ok) {
            setNotice(result.error.message);
            return;
        }

        const next = snapshot(result.data.state);
        setNotice(null);
        setInventoryChoices(null);
        setState(next);
        onEventsRef.current?.(result.data.events, next);
    }, [state, sequence, pending, pendingItem]);

    /**
     * Backs out of the current choice: a pending target goes first, then the item
     * picker itself. The picker stays open when only an item target was cancelled.
     */
    const cancelSelection = useCallback(() => {
        if (pending || pendingItem) {
            setPending(null);
            setPendingItem(null);
            return;
        }
        setInventoryChoices(null);
    }, [pending, pendingItem]);

    /**
     * Escape cancels the selection in progress, the same as the ESC button.
     *
     * Registered in the capture phase and stops propagation, so while a selection is
     * open the screen's Back control (bound to the same key) does not also fire. Back
     * only gets Escape once nothing here is left to cancel.
     */
    useEffect(() => {
        if (!pending && !pendingItem && !inventoryChoices) return undefined;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            cancelSelection();
        };

        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [pending, pendingItem, inventoryChoices, cancelSelection]);

    /** A sprite was clicked: it is a target only while one is being chosen. */
    const handleEntitySelect = useCallback((unitId: string) => {
        if (sequence) return;

        if (pendingItem) {
            if (pendingItem.targetIds.includes(unitId)) {
                submit({ actionId: 'inventory', itemId: pendingItem.itemId, targetId: unitId });
            }
            return;
        }

        if (!pending || !pending.targetIds.includes(unitId)) return;
        submit({ actionId: pending.action.id, targetId: unitId });
    }, [sequence, pending, pendingItem, submit]);

    if (failed) {
        return <p className={`text-sm text-white/60 ${className}`}>{t('combat.startFailed')}</p>;
    }

    if (!state) {
        return <p className={`text-sm text-white/60 ${className}`}>{t('combat.loading')}</p>;
    }

    // Whose turn it is is no longer announced here: the board marks the acting
    // unit with the selector icon itself. What remains is what the fight waits on.
    const label = notice
        ?? (!busy && state.phase === 'finished' && state.outcome
            ? t(`combat.outcome.${state.outcome}`)
            : busy && sequence?.actionName
                ? (sequence.actorName
                    ? t('combat.acting', { actor: sequence.actorName, action: sequence.actionName })
                    : sequence.actionName)
                : pendingItem
                    ? t('combat.pickTarget', { action: pendingItem.name })
                    : pending
                        ? t('combat.pickTarget', { action: pending.action.name })
                        : '');

    return (
        <section className={`relative flex min-h-0 flex-col ${className}`}>
            {/* The board carries the fight; whose turn it is decides what sits under it */}
            <CombatBattle
                state={state}
                sequence={sequence}
                animationsEnabled={animate}
                previews={previews}
                pendingActionId={pending?.action.id ?? null}
                targetIds={pending?.targetIds ?? pendingItem?.targetIds}
                targetPreviews={targetPreviews}
                resolveSpriteUrl={resolveSpriteUrl}
                onActionSelect={handleAction}
                onExtraMovementSelect={handleAction}
                onEntitySelect={handleEntitySelect}
                tooltipVisible={tooltipVisible}
                gridConfig={gridConfig}
                className="h-full"
            />

            {/* What the fight is waiting on — a target prompt or the outcome */}
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2">
                {label && (
                    <div className="rounded-full bg-black/60 px-3 py-1 backdrop-blur-sm">
                        <p
                            aria-live="polite"
                            className="text-[11px] uppercase tracking-[0.15em] text-white/70"
                        >
                            {label}
                        </p>
                    </div>
                )}
            </div>
            {/* Cancel affordance: shows how to back out of a pending attack or item.
                Clicking it does the same as pressing Escape. */}
            {(pending || pendingItem) && (
                <div className="absolute right-2 top-2 z-40">
                    <button
                        type="button"
                        onClick={cancelSelection}
                        title={t('combat.cancelSelection')}
                        className="flex items-center gap-2 border-2 border-white/70 bg-black/60 px-2 py-1 text-[11px] uppercase tracking-[0.15em] text-white/80 backdrop-blur-sm transition-colors hover:border-white hover:text-white"
                    >
                        <kbd className="border border-white/60 px-1 font-pixel text-[10px] leading-2.5">{t('combat.escKey')}</kbd>
                        {t('combat.cancelSelection')}
                    </button>
                </div>
            )}
            {/* The item picker: only the Test Playground turns it on. A click
                anywhere outside it closes it, so the board stays one click away.
                While an item's target is being chosen the picker stays open and the
                board is left clickable, so the target can be picked on it. */}
            {inventoryChoices && (
                <>
                    {!pendingItem && (
                        <div
                            aria-hidden="true"
                            onClick={() => setInventoryChoices(null)}
                            className="absolute inset-0 z-20"
                        />
                    )}
                    {/* Min height equals max height: the panel keeps its size
                        whether the bag holds one potion or a page of them. */}
                    <div className="absolute inset-x-2 bottom-2 z-30 flex h-[55%] flex-col border-2 border-white/70 bg-galatime-dark p-3 backdrop-blur-sm">
                        <div className="mb-2 flex shrink-0 items-center justify-end gap-2">
                            <button
                                type="button"
                                aria-label={t('combat.inventoryCancel')}
                                onClick={() => setInventoryChoices(null)}
                                className="p-1 text-white/50 transition-colors hover:text-white"
                            >
                                <CloseIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex min-h-0 flex-1 gap-2">
                            {/* Tabs down the left. Locked while an item's target is being picked,
                                so the choice in progress is never lost to a tab switch. */}
                            <div role="tablist" aria-orientation="vertical" className="flex w-24 shrink-0 flex-col gap-1">
                                {(['items', 'weapons'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        role="tab"
                                        aria-selected={inventoryTab === tab}
                                        disabled={pendingItem !== null}
                                        onClick={() => setInventoryTab(tab)}
                                        className={`border-2 px-2 py-1.5 text-left text-xs uppercase tracking-[0.15em] transition-colors disabled:opacity-40 ${
                                            inventoryTab === tab
                                                ? 'border-white bg-white text-galatime-dark'
                                                : 'border-white/40 text-white/60 hover:border-white hover:text-white'
                                        }`}
                                    >
                                        {t(tab === 'items' ? 'combat.inventoryTabItems' : 'combat.inventoryTabWeapons')}
                                    </button>
                                ))}
                            </div>

                            {inventoryTab === 'items' ? (
                                inventoryChoices.length === 0 ? (
                                    <p className="flex flex-1 items-center justify-center text-sm text-white/40">
                                        {t('combat.inventoryEmpty')}
                                    </p>
                                ) : (
                                    <ul className="grid min-w-0 flex-1 content-start gap-2 overflow-y-auto grid-cols-2 sm:grid-cols-3">
                                        {inventoryChoices.map((entry) => (
                                            <li key={entry.itemId}>
                                                <InventoryChoiceButton
                                                    entry={entry}
                                                    tooltips={tooltipVisible ?? gameState.settings.fightingTooltipVisible}
                                                    selected={pendingItem?.itemId === entry.itemId}
                                                    dimmed={pendingItem !== null && pendingItem.itemId !== entry.itemId}
                                                    onChoose={handleInventoryChoice}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                )
                            ) : weaponChoices.length === 0 ? (
                                <p className="flex flex-1 items-center justify-center text-sm text-white/40">
                                    {t('combat.weaponsEmpty')}
                                </p>
                            ) : (
                                <ul className="grid min-w-0 flex-1 content-start gap-2 overflow-y-auto grid-cols-2 sm:grid-cols-3">
                                    {weaponChoices.map((entry) => (
                                        <li key={entry.index}>
                                            <WeaponChoiceButton
                                                entry={entry}
                                                tooltips={tooltipVisible ?? gameState.settings.fightingTooltipVisible}
                                                onChoose={handleWeaponChoice}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}

export default CombatEncounter;
