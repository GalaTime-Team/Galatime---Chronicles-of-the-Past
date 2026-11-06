import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../../../context/GameContext';
import { ARENA_IMPACT_MS } from '../../../../constants/CombatAnimationConstants';
import { CombatArenaParticles } from '../battle/CombatArenaParticles';
import { CombatFormationSide } from './CombatFormationSide';
import dayPhaseIcon from '../../../../assets/images/combat/time/day.svg';
import daytimeNoSunIcon from '../../../../assets/images/combat/time/day_no_solar.svg';
import nightPhaseIcon from '../../../../assets/images/combat/time/night.svg';
import nightNoMoonIcon from '../../../../assets/images/combat/time/night_no_lunar.svg';
import type { CombatFormationEntity, CombatFormationHUDProps } from './CombatFormationHUD.types';

export type {
    CombatFormationEntity,
    CombatFormationHUDProps,
    CombatFormationLanes,
} from './CombatFormationHUD.types';

type FocusedEntity = { key: string; entity: CombatFormationEntity } | null;

/** Mirrored, visual-only formation board to compose above the combat action HUD. */
export function CombatFormationHUD({
    allies,
    adversaries,
    activeUnitId,
    targetableIds,
    targetPreviews,
    sequence,
    animationsEnabled = true,
    onEntitySelect,
    className = '',
    tooltipVisible,
    hour,
    timePhase,
    phaseOverridden,
}: CombatFormationHUDProps) {
    const { gameState } = useGame();
    const [hoveredEntity, setHoveredEntity] = useState<FocusedEntity>(null);
    /** The board the particle layer measures its bursts against. */
    const boardRef = useRef<HTMLElement | null>(null);
    /**
     * The pinned unit, kept as key + id.
     *
     * The key is how the board addresses it, the id is how its death is noticed — a key alone
     * would have to be parsed back apart to answer "is this unit still alive?".
     */
    const [pinnedEntity, setPinnedEntity] = useState<{ key: string; id: string } | null>(null);
    const showDetails = tooltipVisible ?? gameState.settings.fightingTooltipVisible;
    const pinnedKey = pinnedEntity?.key ?? null;
    const focusedKey = pinnedKey ?? hoveredEntity?.key ?? null;
    const targetable = useMemo(
        () => (targetableIds ? new Set(targetableIds) : null),
        [targetableIds],
    );
    // Choosing a target compares units, so their health is drawn for the whole
    // board instead of only under the pointer.
    const revealHealth = targetable !== null && showDetails;

    /** Whether each unit is still fighting, by id. */
    const aliveById = useMemo(() => {
        const alive = new Map<string, boolean>();
        for (const entity of [...allies.front, ...allies.rear, ...adversaries.front, ...adversaries.rear]) {
            alive.set(entity.id, entity.status !== 'defeated');
        }
        return alive;
    }, [allies, adversaries]);

    /**
     * Drops the open tooltip and the pin of a unit that has just died.
     *
     * Neither could be closed the usual way: a corpse no longer answers the pointer, so the hover
     * would never clear, and a pin left behind would keep the whole board dimmed for a unit that
     * is not there any more.
     */
    useEffect(() => {
        if (hoveredEntity && aliveById.get(hoveredEntity.entity.id) === false) {
            setHoveredEntity(null);
        }
        if (pinnedEntity && aliveById.get(pinnedEntity.id) === false) {
            setPinnedEntity(null);
            onEntitySelect?.(null);
        }
    }, [hoveredEntity, pinnedEntity, aliveById, onEntitySelect]);

    const clearPin = () => {
        setPinnedEntity(null);
        onEntitySelect?.(null);
    };

    useEffect(() => {
        if (!pinnedKey) return undefined;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                setPinnedEntity(null);
                onEntitySelect?.(null);
            }
        };

        // A pinned entity owns Escape so the app's screen-level Back control does not also fire.
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [pinnedKey, onEntitySelect]);

    const togglePin = (key: string, entity: CombatFormationEntity) => {
        // While a target is being chosen, a click on a legal target *is* that choice:
        // it must not be swallowed as a pin toggle, or the first click on an already
        // pinned unit would do nothing but close its tooltip.
        if (targetable?.has(entity.id)) {
            onEntitySelect?.(entity);
            return;
        }

        if (pinnedKey === key) {
            clearPin();
            return;
        }
        setPinnedEntity({ key, id: entity.id });
        onEntitySelect?.(entity);
    };

    return (
        <section
            ref={boardRef}
            aria-label="Combat formation"
            style={sequence?.shake ? { animation: `combat-board-shake 320ms ease-out ${ARENA_IMPACT_MS}ms both` } : undefined}
            className={`combat-arena-board relative isolate flex h-full min-h-56 w-full items-center justify-center bg-galatime-background text-white ${className}`}
            onClick={clearPin}
        >
            {/* Sparks and dust for the whole board, in one pair of canvases. */}
            <CombatArenaParticles sequence={sequence ?? null} boardRef={boardRef} />

            {/* Depth vignette: the arena darkens toward its edges, so the two rows read
                as standing on a lit ground instead of floating on flat colour. z-0 puts
                it under every sprite (they all carry a z-index of their own) and under
                the hour chip, but above the board's background colour. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0"
                style={{ background: 'radial-gradient(115% 90% at 50% 32%, transparent 55%, rgba(0,0,0,0.5) 100%)' }}
            />

            {/* The hour of the day: a solar skill bites harder by day and a
                lunar one at night, so the player can see which side of the
                fight they are on. A phase override (a skill forcing the other
                phase) hides that phase's own celestial body — a compelled
                phase comes without its sun or moon, so the icons say which
                side of the sky the fight is really happening under. */}
            {timePhase && (
                <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2 border-game border-white/70 bg-black/60 px-2 py-1 backdrop-blur-sm">
                    <img
                        aria-hidden="true"
                        src={phaseOverridden
                            ? (timePhase === 'day' ? daytimeNoSunIcon : nightNoMoonIcon)
                            : (timePhase === 'day' ? dayPhaseIcon : nightPhaseIcon)}
                        alt=""
                        className="h-4 w-4"
                    />
                    <span className="text-[11px] uppercase tracking-[0.15em] text-white/80">
                        {timePhase === 'day' ? 'Day' : 'Night'}
                    </span>
                    {hour !== undefined && (
                        <span className="text-[11px] tabular-nums tracking-[0.15em] text-white/60">
                            {String(hour).padStart(2, '0')}:00
                        </span>
                    )}
                </div>
            )}

            <div className="mx-auto grid h-full min-h-56 w-full max-w-5xl grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)]">
                {/* The battle is drawn side-view: the player's party stands on the left of
                    the field, the enemies on the right, both leaning into the central gap
                    with their walls climbing at 45° into their own side. */}
                <CombatFormationSide
                    side="allies"
                    lanes={allies}
                    activeUnitId={activeUnitId}
                    focusedKey={focusedKey}
                    pinnedKey={pinnedKey}
                    showDetails={showDetails}
                    sequence={sequence}
                    animationsEnabled={animationsEnabled}
                    targetableIds={targetable}
                    targetPreviews={targetPreviews}
                    revealHealth={revealHealth}
                    onFocus={setHoveredEntity}
                    onTogglePin={togglePin}
                    onClearHover={(key) => setHoveredEntity((current) => current?.key === key ? null : current)}
                />
                <div aria-hidden="true" />
                <CombatFormationSide
                    side="adversaries"
                    lanes={adversaries}
                    activeUnitId={activeUnitId}
                    focusedKey={focusedKey}
                    pinnedKey={pinnedKey}
                    showDetails={showDetails}
                    sequence={sequence}
                    animationsEnabled={animationsEnabled}
                    targetableIds={targetable}
                    targetPreviews={targetPreviews}
                    revealHealth={revealHealth}
                    onFocus={setHoveredEntity}
                    onTogglePin={togglePin}
                    onClearHover={(key) => setHoveredEntity((current) => current?.key === key ? null : current)}
                />
            </div>
        </section>
    );
}

export default CombatFormationHUD;
