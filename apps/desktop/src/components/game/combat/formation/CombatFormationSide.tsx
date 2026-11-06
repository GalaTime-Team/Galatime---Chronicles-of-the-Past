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

/**
 * Breathing room kept between a wall and its column's edges, horizontally on both
 * sides and vertically above its crest.
 */
const WALL_EDGE_PX = 10;

/** Airiest spacing a wall may keep between two of its units, in sprite widths. */
const MAX_STEP_WIDTHS = 0.75;

/**
 * Deepest a crowded wall may nest its units past each other, keeping this share
 * of each sprite visible — or a full line-up turns into one blob.
 */
const MAX_WALL_OVERLAP = 0.7;

/**
 * Climb of the walls: for every pixel a wall advances along the ground, it rises
 * this many. A full 45° wall (`1`) reads the rear line from its height alone, but
 * pushes its deep slots off the top of the board and stretches short line-ups
 * across it; flattening the diagonal (~20°) keeps the line-ups breathing side by
 * side — a whole row stays in one vertical band, nobody reaches the board's top —
 * and the rear one a lift behind the front.
 */
const WALL_CLIMB = 0.35;

/**
 * Diagonal distance between two consecutive units of one wall.
 *
 * A wall divides its column by the units that share it, so the spacing follows the
 * roster instead of being fixed: three units stand far apart, eight stand closer,
 * ten nestle together — the wall filling its slope either way. The result is a
 * magnitude: it sets how far apart the slots spread, never which end is which.
 */
function wallStep(count: number, availableWidth: number, availableHeight: number, entitySize: number): number {
    if (count < 2 || entitySize <= 0) return 0;
    // A wall advancing `step` only climbs `step * WALL_CLIMB`, so the tighter of
    // the two surfaces — the ground it covers, or the height it climbs — decides.
    const groundBudget = availableWidth - entitySize;
    const verticalBudget = Math.max(0, (availableHeight - entitySize) / WALL_CLIMB);
    const budget = Math.min(groundBudget, verticalBudget);
    if (budget >= 0) return Math.min(budget / (count - 1), entitySize * MAX_STEP_WIDTHS);
    return Math.min(-budget / (count - 1), entitySize * MAX_WALL_OVERLAP);
}

/** One side of the formation. Two diagonal walls of units climbing into the field. */
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
    // Both walls draw their back line first: the walls are absolutely placed on the
    // ground plane (front low, rear lifted and behind), so this order is only for a
    // stable layout and ref wiring, not a facing.
    const rows: CombatFormationLaneId[] = ['rear', 'front'];

    const boardRef = useRef<HTMLDivElement | null>(null);
    const frontLaneRef = useRef<HTMLDivElement | null>(null);
    const rearLaneRef = useRef<HTMLDivElement | null>(null);
    const laneRefs: Record<CombatFormationLaneId, typeof frontLaneRef> = {
        front: frontLaneRef,
        rear: rearLaneRef,
    };

    /**
     * Measured ground of the side.
     *
     * None of these numbers is in the markup: the side's box comes from the screen
     * around it, the sprite's size from the breakpoint, and the rows' ground line
     * and the lift between them live in the arena classes — so they are *read* off
     * the rendered boxes (`laneBottom`/`lift`) rather than duplicated here. A wall
     * dividing its slope by its unit count needs all of them (`wallStep`).
     */
    const [metrics, setMetrics] = useState({
        height: 0,
        laneWidth: 0,
        entitySize: 0,
        spriteSize: 0,
        lift: 0,
        frontBottom: 0,
    });
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
            const boardRect = board.getBoundingClientRect();
            const frontLane = frontLaneRef.current?.getBoundingClientRect();
            const rearLane = rearLaneRef.current?.getBoundingClientRect();
            // Rect bottoms, not boxes: the rows are bottom-anchored absolute boxes of zero
            // height, so their *ground line* is the bottom edge, and the distance between
            // the two ground lines is the lift the rear wall stands on.
            const frontBottom = frontLane ? Math.round(boardRect.bottom - frontLane.bottom) : 0;
            const rearBottom = rearLane ? Math.round(boardRect.bottom - rearLane.bottom) : 0;
            // `offsetWidth`, not a rect: an animation running on that button (a lunge, an
            // entrance, the rear wall's scale) would otherwise be measured mid-transform.
            const entitySize = board.querySelector('button')?.offsetWidth ?? 0;
            // The *drawn* sprite rides the button's bottom, so the wall's build-up and
            // centring are measured on the sprite itself, not the button box.
            const spriteSize = (board.querySelector('button img') as HTMLElement | null)?.offsetHeight ?? 0;
            const laneWidth = frontLaneRef.current?.clientWidth ?? board.clientWidth;

            setMetrics((current) => (
                current.height === boardRect.height
                && current.laneWidth === laneWidth
                && current.entitySize === entitySize
                && current.spriteSize === spriteSize
                && current.lift === rearBottom - frontBottom
                && current.frontBottom === frontBottom
                    ? current
                    : {
                        height: boardRect.height,
                        laneWidth,
                        entitySize,
                        spriteSize,
                        lift: Math.max(0, rearBottom - frontBottom),
                        frontBottom,
                    }
            ));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(board);
        // Crossing a breakpoint resizes the sprites without resizing the side.
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [rosterSize]);

    /** Screen-reader label of the side: the field names sides by position, `left`/`right`. */
    const sideLabel = side === 'allies' ? 'left' : 'right';

    return (
        <div ref={boardRef} role="group" aria-label={`${sideLabel} formation`} className="relative h-full min-w-0">
            {rows.map((lane) => {
                // A corpse holds its place while it sinks and loses it afterwards, so the
                // survivors take over the slope instead of a slot being held by somebody
                // who is no longer there. Only a *defeated* unit can be filtered out: were
                // the mark ever to outlive its fight, the same id coming back alive must
                // still be drawn.
                const roster = (lanes[lane] ?? []).filter(
                    (entity) => !(entity.status === 'defeated' && buried.has(entity.id)),
                );
                const isRearWall = lane === 'rear';
                const laneBottom = isRearWall
                    ? metrics.frontBottom + metrics.lift
                    : metrics.frontBottom;
                const step = wallStep(
                    roster.length,
                    metrics.laneWidth - WALL_EDGE_PX * 2,
                    metrics.height - laneBottom - WALL_EDGE_PX,
                    metrics.entitySize,
                );
                const groundSpan = (roster.length - 1) * step;
                // The rear line takes half the climb: behind reads through the lift and
                // the horizontal step — a full diagonal inside the back line too would
                // stretch its first member to the board's top and its last onto the
                // front line's spots, which hid which line anybody belonged to.
                const climb = isRearWall ? WALL_CLIMB * 0.5 : WALL_CLIMB;
                // The *drawn* wall — sprite bottom to sprite crest — is what the player
                // reads, so it is that surface, not the button boxes, that gets centred:
                // the front wall's band floats at the board's centre (the fight happens
                // in the middle, not hugging the bottom), and the rear wall's band
                // stands exactly one lift above it.
                const graphicSize = metrics.spriteSize > 0 ? metrics.spriteSize : Math.round(metrics.entitySize * 0.6);
                const visibleSpan = groundSpan * climb + graphicSize;
                const feetBase = Math.max(0, (metrics.height - visibleSpan) / 2)
                    + (isRearWall ? metrics.lift : 0);
                const usableWidth = metrics.laneWidth - WALL_EDGE_PX * 2;
                const lowOut = Math.max(0, (usableWidth - groundSpan - graphicSize) / 2);
                /** Where a rear twin of this wall's slots stands: one lift deeper into the field. */
                const stepFrom = lane === 'front' && metrics.lift > 0
                    ? (side === 'allies'
                        ? { dx: -metrics.lift, dy: -metrics.lift }
                        : { dx: metrics.lift, dy: -metrics.lift })
                    : undefined;

                return (
                    <div
                        key={lane}
                        ref={laneRefs[lane]}
                        role="group"
                        aria-label={`${sideLabel} ${lane} line`}
                        className={`combat-arena-row ${lane === 'front' ? 'combat-arena-row--front' : 'combat-arena-row--rear'}`}
                    >
                        {roster.map((entity, index) => {
                            const key = entityKey(side, lane, entity);
                            // The wall runs out from its low end: the last slot stands on
                            // the wall's own ground, every earlier slot a step higher
                            // and — along the flattened diagonal — the same distance
                            // further inboard. Slot 0 rides the crest, the one nearest
                            // the central gap's top.
                            const up = Math.max(0, feetBase - laneBottom)
                                + (roster.length - 1 - index) * step * climb;
                            const outBase = Math.max(
                                WALL_EDGE_PX,
                                WALL_EDGE_PX + lowOut - (isRearWall ? metrics.lift : 0),
                            );
                            const out = outBase + (roster.length - 1 - index) * step;
                            return (
                                <CombatFormationEntity
                                    key={key}
                                    entity={entity}
                                    side={side}
                                    lane={lane}
                                    stackIndex={index}
                                    wallOut={out}
                                    wallUp={up}
                                    stepFrom={stepFrom}
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
                );
            })}
        </div>
    );
}
