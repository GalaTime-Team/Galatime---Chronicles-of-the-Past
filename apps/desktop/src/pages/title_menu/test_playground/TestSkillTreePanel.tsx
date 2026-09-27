import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { useTranslation } from 'react-i18next';
import { AddIcon, ElementIcon, FitIcon, RemoveIcon } from '../../../assets/GalatimeIcon';
import CommonImage from '../../../components/common/CommonImage';
import { fetchAttacks } from '../../../controllers/attackController';
import { getAllElementsDataService } from '../../../services/elementService';
import type { ElementData } from '../../../types/ElementDataType';
import type { PublicAttack } from '../../../types/AttackDataType';
import {
    FIT_ZOOM_FLOOR,
    FIT_ZOOM_RATIO,
    INANUS_ID,
    MAX_ZOOM,
    MIN_ZOOM,
    SKILL_ICON_SIZE,
    SKILL_NODE_SIZE,
    ZOOM_BUTTON_STEP,
    ZOOM_WHEEL_SENSITIVITY,
    buildSkillTreeLayout,
    getLearnableAttacks,
    type SkillTreeLayout,
} from '../../../utils/skillTreeLayout';
import { SkillNodeTooltip } from '../../../components/game/skills/SkillNodeTooltip';

const SKILL_IMAGE_FALLBACK = '/images/elements/unknown.png';

/** Camera of the map: a scale plus the translation applied to the laid-out world. */
interface SkillTreeView {
    zoom: number;
    x: number;
    y: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Rescales the map around a point, so whatever sits under that point stays put. */
function zoomAbout(view: SkillTreeView, zoom: number, pointX: number, pointY: number): SkillTreeView {
    if (zoom === view.zoom) return view;
    const ratio = zoom / view.zoom;
    return {
        zoom,
        x: pointX - (pointX - view.x) * ratio,
        y: pointY - (pointY - view.y) * ratio,
    };
}

export function TestSkillTreePanel() {
    const { t } = useTranslation('playground');
    const [attacks, setAttacks] = useState<PublicAttack[]>([]);
    const [elements, setElements] = useState<ElementData[]>([]);
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([INANUS_ID]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        Promise.all([fetchAttacks(), getAllElementsDataService()])
            .then(([attackList, elementList]) => {
                if (cancelled) return;
                setAttacks(attackList);
                setElements(elementList.filter((element) => element.type === 'common'));
                setLoading(false);
            })
            .catch((error: unknown) => {
                console.error('Failed to load the skill tree playground:', error);
                if (cancelled) return;
                setLoadFailed(true);
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const selectableElements = useMemo(
        () => elements
            .sort((left, right) => {
                if (left.id === INANUS_ID) return 1;
                if (right.id === INANUS_ID) return -1;
                return left.name.localeCompare(right.name);
            }),
        [elements],
    );
    const selectedKey = selectedElementIds.join('|');
    const visibleAttacks = useMemo(
        () => getLearnableAttacks(attacks, selectedElementIds.length > 0 ? selectedElementIds : [INANUS_ID]),
        [attacks, selectedKey],
    );
    const layout = useMemo(() => buildSkillTreeLayout(visibleAttacks), [visibleAttacks]);

    function toggleElement(elementId: string) {
        setSelectedElementIds((current) => {
            const currentSelection = current.length > 0 ? current : [INANUS_ID];
            if (elementId === INANUS_ID) {
                return currentSelection.length === 1 && currentSelection[0] === INANUS_ID
                    ? currentSelection
                    : [INANUS_ID];
            }

            if (currentSelection.includes(elementId)) {
                const next = currentSelection.filter((id) => id !== elementId);
                return next.length > 0 ? next : [INANUS_ID];
            }

            if (currentSelection.includes(INANUS_ID)) return [elementId];
            if (currentSelection.length >= 2) return currentSelection;
            return [...currentSelection, elementId];
        });
    }

    if (loading) {
        return <div className="flex h-full items-center justify-center text-sm text-white/50">{t('playground.skillTree.loading')}</div>;
    }

    if (loadFailed) {
        return <div role="alert" className="flex h-full items-center justify-center text-sm text-red-200/80">{t('playground.skillTree.loadError')}</div>;
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex max-h-24 shrink-0 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {selectableElements.map((element) => {
                    const isSelected = selectedElementIds.includes(element.id);
                    const isDisabled = !isSelected && selectedElementIds.length >= 2;
                    return (
                        <button
                            key={element.id}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={isDisabled}
                            onClick={() => toggleElement(element.id)}
                            className={`inline-flex items-center gap-1.5 border px-2 py-1 text-xs transition-colors ${isSelected
                                ? 'border-white/70 bg-white text-galatime-dark'
                                : isDisabled
                                    ? 'cursor-not-allowed border-white/5 bg-white/2 text-white/25'
                                    : 'border-white/10 bg-white/3 text-white/60 hover:border-white/30 hover:text-white'
                                }`}
                        >
                            <ElementIcon id={element.id} className="h-5 w-5" />
                            <span>{element.name}</span>
                        </button>
                    );
                })}
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden border border-white/10 bg-galatime-background">
                <div className="pointer-events-none absolute inset-0 opacity-30 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-size-[32px_32px]" />
                {visibleAttacks.length === 0 ? (
                    <div className="relative flex h-full items-center justify-center px-4 text-center text-sm text-white/45">
                        {t('playground.skillTree.empty')}
                    </div>
                ) : (
                    <SkillTreeMap layout={layout} />
                )}
            </div>
        </div>
    );
}

function SkillTreeMap({ layout }: { layout: SkillTreeLayout }) {
    const { t } = useTranslation('playground');
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const activeDrag = useRef<{ pointerId: number; startX: number; startY: number; viewX: number; viewY: number } | null>(null);
    const [view, setView] = useState<SkillTreeView>({ zoom: 1, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    /** Frames the whole map; runs on every new layout and from the "fit" button. */
    const fitToView = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport || layout.width <= 0 || layout.height <= 0) return;

        const zoom = clamp(
            Math.min(viewport.clientWidth / layout.width, viewport.clientHeight / layout.height) * FIT_ZOOM_RATIO,
            FIT_ZOOM_FLOOR,
            MAX_ZOOM,
        );
        setView({
            zoom,
            x: (viewport.clientWidth - layout.width * zoom) / 2,
            y: (viewport.clientHeight - layout.height * zoom) / 2,
        });
    }, [layout.width, layout.height]);

    useEffect(() => {
        fitToView();
    }, [fitToView]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return undefined;

        // A resize keeps the zoom the user picked and only re-centres the map.
        const observer = new ResizeObserver(() => {
            setView((current) => ({
                ...current,
                x: (viewport.clientWidth - layout.width * current.zoom) / 2,
                y: (viewport.clientHeight - layout.height * current.zoom) / 2,
            }));
        });
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [layout.width, layout.height]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return undefined;

        // Registered natively: React's wheel handler cannot reliably preventDefault, and the page
        // must not scroll while the map is being zoomed.
        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = viewport.getBoundingClientRect();
            const cursorX = event.clientX - rect.left;
            const cursorY = event.clientY - rect.top;
            setView((current) => zoomAbout(
                current,
                clamp(current.zoom * Math.exp(-event.deltaY * ZOOM_WHEEL_SENSITIVITY), MIN_ZOOM, MAX_ZOOM),
                cursorX,
                cursorY,
            ));
        };

        viewport.addEventListener('wheel', handleWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', handleWheel);
    }, []);

    /** One zoom step around the middle of the viewport, for the `+` / `-` buttons. */
    function zoomByStep(factor: number) {
        const viewport = viewportRef.current;
        if (!viewport) return;
        setView((current) => zoomAbout(
            current,
            clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM),
            viewport.clientWidth / 2,
            viewport.clientHeight / 2,
        ));
    }

    function startDragging(event: ReactPointerEvent<HTMLDivElement>) {
        if (event.button !== 0) return;
        activeDrag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            viewX: view.x,
            viewY: view.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
    }

    function moveMap(event: ReactPointerEvent<HTMLDivElement>) {
        const drag = activeDrag.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setView((current) => ({
            ...current,
            x: drag.viewX + event.clientX - drag.startX,
            y: drag.viewY + event.clientY - drag.startY,
        }));
    }

    function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
        if (activeDrag.current?.pointerId !== event.pointerId) return;
        activeDrag.current = null;
        setIsDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    const nodeById = new Map(layout.nodes.map((node) => [node.skill.id, node]));
    const nodeSize = SKILL_NODE_SIZE * view.zoom;
    const iconSize = SKILL_ICON_SIZE * view.zoom;

    return (
        <div
            ref={viewportRef}
            className={`relative h-full w-full overflow-hidden touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={startDragging}
            onPointerMove={moveMap}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
        >
            {/* The world div is sized in screen pixels, so the zoom is plain arithmetic on the
                node boxes and positions. A CSS transform would instead scale the sprite canvases
                without making CommonImage re-measure, and they would come out blurry. */}
            <div
                className="absolute left-0 top-0"
                style={{
                    width: layout.width * view.zoom,
                    height: layout.height * view.zoom,
                    transform: `translate(${view.x}px, ${view.y}px)`,
                }}
            >
                <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    preserveAspectRatio="none"
                >
                    {layout.edges.map(({ parentId, childId }) => {
                        const parent = nodeById.get(parentId);
                        const child = nodeById.get(childId);
                        if (!parent || !child) return null;
                        // A straight line between the two sprite centres. The nodes are painted above
                        // the SVG, so it reads as leaving the middle of each image.
                        return (
                            <line
                                key={`${parentId}:${childId}`}
                                x1={parent.x}
                                y1={parent.y}
                                x2={child.x}
                                y2={child.y}
                                stroke="rgba(160, 160, 160, 0.85)"
                                strokeWidth={2}
                                vectorEffect="non-scaling-stroke"
                            />
                        );
                    })}
                </svg>

                {layout.nodes.map((node) => (
                    <SkillTreeNode
                        key={node.skill.id}
                        skill={node.skill}
                        x={node.x * view.zoom}
                        y={node.y * view.zoom}
                        size={nodeSize}
                        iconSize={iconSize}
                    />
                ))}
            </div>

            <div
                className="absolute bottom-3 right-3 z-10 flex items-center gap-1 border border-white/10 bg-black/50 p-1"
                onPointerDown={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label={t('playground.skillTree.zoomOut')}
                    title={t('playground.skillTree.zoomOut')}
                    onClick={() => zoomByStep(1 / ZOOM_BUTTON_STEP)}
                    className="flex h-6 w-6 items-center justify-center text-white/70 transition-colors hover:text-white"
                >
                    <RemoveIcon className="h-4! w-4!" />
                </button>
                <button
                    type="button"
                    aria-label={t('playground.skillTree.fitView')}
                    title={t('playground.skillTree.fitView')}
                    onClick={fitToView}
                    className="flex h-6 w-6 items-center justify-center text-white/70 transition-colors hover:text-white"
                >
                    <FitIcon className="h-4! w-4!" />
                </button>
                <button
                    type="button"
                    aria-label={t('playground.skillTree.zoomIn')}
                    title={t('playground.skillTree.zoomIn')}
                    onClick={() => zoomByStep(ZOOM_BUTTON_STEP)}
                    className="flex h-6 w-6 items-center justify-center text-white/70 transition-colors hover:text-white"
                >
                    <AddIcon className="h-4! w-4!" />
                </button>
            </div>
        </div>
    );
}

function SkillTreeNode({
    skill,
    x,
    y,
    size,
    iconSize,
}: {
    skill: PublicAttack;
    /** Centre of the node, already scaled by the map zoom. */
    x: number;
    y: number;
    size: number;
    iconSize: number;
}) {
    const [isTooltipOpen, setIsTooltipOpen] = useState(false);
    const { refs, floatingStyles } = useFloating({
        open: isTooltipOpen,
        onOpenChange: setIsTooltipOpen,
        placement: 'top',
        whileElementsMounted: autoUpdate,
        middleware: [offset(10), flip(), shift({ padding: 12 })],
    });

    return (
        <>
            <button
                ref={refs.setReference}
                type="button"
                data-skill-node="true"
                aria-label={`${skill.name} (${skill.element_id})`}
                onMouseEnter={() => setIsTooltipOpen(true)}
                onMouseLeave={() => setIsTooltipOpen(false)}
                onFocus={() => setIsTooltipOpen(true)}
                onBlur={() => setIsTooltipOpen(false)}
                className="absolute z-1 flex items-center justify-center border-0 bg-transparent p-0 transition-transform duration-150 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none"
                style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}
            >
                <CommonImage
                    src={`/images/skills/${skill.element_id}/${skill.id}.png`}
                    alt={skill.name}
                    className="shrink-0 drop-shadow-[0_0_7px_rgba(255,255,255,0.18)]"
                    style={{ width: iconSize, height: iconSize }}
                    fallbackSrc={SKILL_IMAGE_FALLBACK}
                />
            </button>

            <SkillNodeTooltip
                skill={skill}
                open={isTooltipOpen}
                floatingRef={refs.setFloating}
                floatingStyles={floatingStyles}
            />
        </>
    );
}
