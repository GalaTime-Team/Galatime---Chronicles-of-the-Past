import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CombatFormationEntity } from './CombatFormationEntity';
import type { ArenaSequence } from '../battle/combatArenaSequence';
import type {
    CombatFormationEntity as CombatFormationEntityData,
    CombatFormationLaneId,
    CombatFormationLanes,
    CombatFormationSideId,
} from './CombatFormationHUD.types';
import type { CombatActionImpact } from '../../../../types/CombatType';

export interface CombatFormationSideProps {
    side: CombatFormationSideId;
    lanes: CombatFormationLanes;
    /** Unit id the board marks as the one acting, if any. */
    activeUnitId?: string;
    focusedKey: string | null;
    pinnedKey: string | null;
    showDetails: boolean;
    /** The choreography of the step being played, if any. */
    sequence?: ArenaSequence | null;
    /** Turns the reactions off entirely; a defeated unit then leaves at once. */
    animationsEnabled?: boolean;
    /** Unit ids the current action can be aimed at, or `null` outside targeting. */
    targetableIds?: ReadonlySet<string> | null;
    /** What the pending action would do to each unit, keyed by unit id. */
    targetPreviews?: ReadonlyMap<string, CombatActionImpact>;
    /** Draws every HP meter, used while a target is being chosen. */
    revealHealth?: boolean;
    onFocus: (value: { key: string; entity: CombatFormationEntityData } | null) => void;
    onTogglePin: (key: string, entity: CombatFormationEntityData) => void;
    onClearHover: (key: string) => void;
}

function entityKey(side: CombatFormationSideId, lane: CombatFormationLaneId, entity: CombatFormationEntityData) {
    return `${side}:${lane}:${entity.id}`;
}

/** Breathing room above and below a line, so a full one never touches the board's edge. */
const LANE_EDGE_PX = 12;

/**
 * Share of its own height a unit keeps when its line is too tall to stand apart.
 *
 * The board has a floor, so a very full line (up to `MAX_UNITS_PER_LINE`) ends
 * up nesting instead of clipping — but never past this, or a short viewport
 * would stack the sprites into one unreadable blob.
 */
const MAX_LANE_OVERLAP = 0.8;

/**
 * Vertical distance between two consecutive units of one line.
 *
 * A line divides the height it has by the units that share it, so the spacing
 * follows the roster instead of being fixed: three units stand far apart, eight
 * stand closer, ten nestle together — the line filling its height either way.
 * Positive values spread the line, negative ones overlap it.
 */
function laneGap(count: number, availableHeight: number, entityHeight: number): number {
    if (count < 2 || entityHeight <= 0) return 0;
    const free = availableHeight - entityHeight * count;
    return Math.max(-entityHeight * MAX_LANE_OVERLAP, free / (count - 1));
}

/** One side of the formation. Front and rear swap order across the central battlefield gap. */
export function CombatFormationSide({
    side,
    lanes,
    activeUnitId,
    focusedKey,
    pinnedKey,
    showDetails,
    sequence,
    animationsEnabled = true,
    targetableIds,
    targetPreviews,
    revealHealth = false,
    onFocus,
    onTogglePin,
    onClearHover,
}: CombatFormationSideProps) {
    const orderedLanes: CombatFormationLaneId[] = side === 'allies' ? ['rear', 'front'] : ['front', 'rear'];

    /**
     * Height of the board and of one sprite, measured so the spacing can adapt.
     *
     * Neither number is in the markup: the board's height comes from the screen
     * around it and the sprite's from the breakpoint, and a line dividing its
     * room by its unit count needs both (`laneGap`).
     */
    const boardRef = useRef<HTMLDivElement | null>(null);
    const [metrics, setMetrics] = useState({ height: 0, entityHeight: 0 });
    const rosterSize = lanes.front.length + lanes.rear.length;

    /**
     * Units whose death animation has finished, i.e. that are no longer on the board.
     *
     * A defeated unit is dropped from its line only once it has sunk out of sight: the movement
     * needs somewhere to start, and re-spacing the survivors under a body that is still falling
     * would look like the line flinched.
     */
    const [buried, setBuried] = useState<ReadonlySet<string>>(() => new Set<string>());

    const bury = (id: string) => {
        setBuried((current) => {
            if (current.has(id)) return current;
            const next = new Set(current);
            next.add(id);
            return next;
        });
    };

    // The mark belongs to one fight: once the unit has left the roster it means nothing, and
    // keeping it would hide a later unit that happened to reuse the id.
    useEffect(() => {
        const present = new Set([...lanes.front, ...lanes.rear].map((entity) => entity.id));
        setBuried((current) => {
            const stale = [...current].some((id) => !present.has(id));
            return stale ? new Set([...current].filter((id) => present.has(id))) : current;
        });
    }, [lanes]);

    useLayoutEffect(() => {
        const board = boardRef.current;
        if (!board) return undefined;

        const measure = () => {
            const height = board.clientHeight;
            // `offsetHeight`, not a rect: an animation running on that button (a lunge, a pop)
            // would otherwise be measured mid-transform and skew every lane's spacing.
            const entityHeight = board.querySelector('button')?.offsetHeight ?? 0;
            setMetrics((current) => (
                current.height === height && current.entityHeight === entityHeight
                    ? current
                    : { height, entityHeight }
            ));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(board);
        // Crossing a breakpoint resizes the sprites without resizing the board.
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [rosterSize]);

    const availableHeight = Math.max(0, metrics.height - LANE_EDGE_PX);

    return (
        <div ref={boardRef} role="group" aria-label={`${side} formation`} className="grid h-full min-w-0 grid-cols-2 items-center">
            {orderedLanes.map((lane) => {
                // A corpse holds its place while it sinks and loses it afterwards, so the
                // survivors take over the space instead of a slot being held by somebody who is
                // no longer there. Only a *defeated* unit can be filtered out: were the mark ever
                // to outlive its fight, the same id coming back alive must still be drawn.
                const roster = (lanes[lane] ?? []).filter(
                    (entity) => !(entity.status === 'defeated' && buried.has(entity.id)),
                );
                const gap = laneGap(roster.length, availableHeight, metrics.entityHeight);

                return (
                    <div key={lane} role="group" aria-label={`${side} ${lane} line`} className="flex h-full min-w-0 flex-col items-center justify-center overflow-visible">
                        <div className="flex flex-col items-center overflow-visible">
                            {roster.map((entity, index) => {
                                const key = entityKey(side, lane, entity);
                                return (
                                    <CombatFormationEntity
                                        key={key}
                                        entity={entity}
                                        side={side}
                                        lane={lane}
                                        stackIndex={index}
                                        gapAbove={index === 0 ? undefined : gap}
                                        // A corpse cannot be inspected: it is on its way off the board.
                                        isFocused={focusedKey === key && entity.status !== 'defeated'}
                                        hasFocus={focusedKey !== null}
                                        isPinned={pinnedKey === key}
                                        isActive={entity.id === activeUnitId}
                                        isTargetable={targetableIds?.has(entity.id) === true}
                                        preview={targetPreviews?.get(entity.id)}
                                        revealHealth={revealHealth}
                                        sequence={sequence}
                                        animationsEnabled={animationsEnabled}
                                        showDetails={showDetails}
                                        onFocus={() => onFocus({ key, entity })}
                                        onClearHover={() => onClearHover(key)}
                                        onClick={() => onTogglePin(key, entity)}
                                        onGone={() => bury(entity.id)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
