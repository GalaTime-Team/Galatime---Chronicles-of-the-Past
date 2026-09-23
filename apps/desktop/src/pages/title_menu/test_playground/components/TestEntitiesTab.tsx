import { useState } from 'react';
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { createPortal } from 'react-dom';
import type { AbilityEntry, BaseStats, CharacterData, LootEntry, MobData } from '../../../../types/EntityDataType';
import type { EntityImage } from '../../../../types/EntityImageType';
import { ChevronLeft, ChevronRight, ElementIcon, UnknownIcon } from '../../../../assets/GalatimeIcon';
import CommonHoverElement from '../../../../components/common/CommonHoverElement';
import CommonImage from '../../../../components/common/CommonImage';
import StatBar from '../../../../components/common/StatBar';
import { playSfx } from '../../../../controllers/audioController';
import { BUTTON_SFX_ID } from '../../../../constants/AudioConstants';
import { useGame } from '../../../../context/GameContext';
import { getEntityImages } from '../../../../services/entityImageService';
import type { EntityItem } from '../types';

/**
 * Renders any raw YAML value as text.
 *
 * The entity files are authored by hand, so a field the UI expects to be a string can come
 * back as an object, an array or `null`. Without this guard React throws
 * "Objects are not valid as a React child".
 */
function toText(value: unknown, fallback = '\u2014'): string {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value.trim() === '' ? fallback : value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
}

interface TestEntitiesTabProps {
    item: EntityItem | null;
}

/**
 * Detail column of the Test Entities playground. Owns its own scrollbar so the sidebar
 * and the surrounding panel can scroll independently.
 */
export function TestEntitiesTab({ item }: TestEntitiesTabProps) {
    return (
        <div className="min-w-0 flex-1 overflow-y-auto">
            {item ? (
                // Keyed by entity so the gallery page and the element tooltip reset with it.
                <EntityDetail key={`${item.type}-${item.id}`} item={item} />
            ) : (
                <p className="text-sm text-white/40">Select an entity to view details.</p>
            )}
        </div>
    );
}

function EntityDetail({ item }: { item: EntityItem }) {
    const data = item.data;
    const isCharacter = item.type === 'character';
    const charData = isCharacter ? (data as CharacterData) : null;
    const mobData = !isCharacter ? (data as MobData) : null;

    // Normalize every collection once: hand-written YAML may omit them entirely.
    const elements = (Array.isArray(data.elements) ? data.elements : []).filter(
        (el): el is string => typeof el === 'string'
    );
    const baseStats = (data.base_stats ?? {}) as BaseStats;
    const skills = Array.isArray(data.skills) ? data.skills : [];
    const abilities: AbilityEntry[] = Array.isArray(data.abilities) ? data.abilities : [];
    const loot: LootEntry[] = Array.isArray(data.loot) ? data.loot : [];

    const weapon = data.weapon ?? null;
    const weaponLabel = toText(weapon?.name ?? weapon?.id, 'None');

    // Sprites are discovered from the files on disk, not declared in the YAML.
    const images = getEntityImages(item);

    // Whether the multipliers table should be shown on hover is decided in Settings.
    const { gameState } = useGame();
    const fightingTooltipVisible = gameState.settings.fightingTooltipVisible;

    const [isElementTooltipVisible, setIsElementTooltipVisible] = useState(false);
    const { refs: elementRefs, floatingStyles: elementFloatingStyles } = useFloating({
        open: isElementTooltipVisible,
        onOpenChange: setIsElementTooltipVisible,
        placement: 'right-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift()],
    });

    return (
        <div className="space-y-6 p-2">
            {/* Name, description and elements on the left; the entity's sprites sit to their right.
                The row wraps so a narrow window drops the gallery below instead of squeezing the
                text into a column one word wide. */}
            <div className="flex flex-wrap items-start gap-6">
                <div className="min-w-48 flex-1 space-y-6">
                    {/* Header */}
                    <div>
                        <h2 className="text-2xl font-bold text-white">{item.name}</h2>
                        <p className="text-sm text-white/50">{toText(data.description, '')}</p>
                    </div>

                    {/* Elements.
                        `w-fit` matters: the anchor for the tooltip must hug the heading and the
                        icons. While this box still stretched across the full column, `right-end`
                        anchored the tooltip to that full-width edge and it opened far to the right,
                        detached from the icons. */}
                    <div
                        ref={elementRefs.setReference}
                        onMouseEnter={() => setIsElementTooltipVisible(true)}
                        onMouseLeave={() => setIsElementTooltipVisible(false)}
                        className="w-fit"
                    >
                        <h3 className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Elements</h3>
                        <div className="flex gap-2">
                            {elements.length > 0 ? (
                                elements.map((el) => <ElementIcon key={el} id={el} className="h-8 w-8" />)
                            ) : (
                                <span className="text-sm text-white/40">None</span>
                            )}
                        </div>

                        {/* Tooltip. Portalled to `<body>`, so it escapes the panel's `overflow-y-auto`
                            and may spill past the tab, over the sidebar — `flip()`/`shift()` only
                            measure against the viewport, not against the tab. */}
                        {isElementTooltipVisible && elements.length > 0 && createPortal(
                            <div
                                ref={elementRefs.setFloating}
                                style={elementFloatingStyles}
                                className="z-50 pointer-events-none"
                            >
                                <CommonHoverElement
                                    elementIds={elements}
                                    elementName={elements}
                                    isVisible={true}
                                    isTooltip={fightingTooltipVisible}
                                    isAttack={false}
                                />
                            </div>,
                            document.body
                        )}
                    </div>
                </div>

                <EntityImageGallery images={images} />
            </div>

            {/* Character-specific */}
            {charData && (
                <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-[0.15em] text-white/40">Character Info</h3>
                    <InfoRow label="Gender" value={toText(charData.gender)} />
                    <InfoRow label="Age" value={toText(charData.age)} />
                    <InfoRow label="Birthday" value={toText(charData.birthday, 'Unknown')} />
                    <InfoRow label="Origin" value={toText(charData.origin)} />
                    <InfoRow
                        label="Friendship"
                        value={toText(charData.starting_relationships?.liking ?? charData.friendship, '0')}
                    />
                    <InfoRow
                        label="Trust"
                        value={toText(charData.starting_relationships?.trust ?? charData.trust, '0')}
                    />
                    <InfoRow label="Weapon" value={weaponLabel} />
                </div>
            )}

            {/* Mob-specific */}
            {mobData && (
                <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-[0.15em] text-white/40">Mob Info</h3>
                    <InfoRow label="Rarity" value={toText(mobData.rarity)} />
                    <InfoRow label="Basic Attack" value={weaponLabel} />
                </div>
            )}

            {/* Abilities (mobs): each entry is an object, not a string. */}
            {abilities.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-[0.15em] text-white/40">Abilities</h3>
                    <div className="flex flex-col gap-1">
                        {abilities.map((ability, i) => (
                            <div key={i} className="flex justify-between text-sm">
                                <span className="text-white">{toText(ability?.ability_name, 'Unnamed')}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Skills */}
            {skills.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-[0.15em] text-white/40">Skills</h3>
                    <div className="flex flex-col gap-1">
                        {skills.map((skill, i) => (
                            <div key={toText(skill?.id, `skill-${i}`)} className="flex justify-between text-sm">
                                <span className="text-white">{toText(skill?.id, 'Unnamed')}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Base Stats */}
            <div>
                <h3 className="mb-3 text-xs uppercase tracking-[0.15em] text-white/40">Base Stats</h3>
                <div className="space-y-3">
                    {Object.entries(baseStats).map(([key, value]) => {
                        const isHp = key.toLowerCase() === 'hp';
                        const max = isHp ? 1200 : 150;
                        return (
                            <StatBar
                                key={key}
                                label={key}
                                value={value}
                                max={max}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Loot */}
            <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Loot</h3>
                {loot.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {loot.map((l, i) => (
                            <span key={i} className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">
                                {toText(l.item ?? l.item_id, 'Unknown')} (
                                {(Math.max(0, Math.min(1, Number(l.chance) || 0)) * 100).toFixed(0)}%)
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-white/40">No loot defined.</p>
                )}
            </div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-white/50">{label}</span>
            <span className="text-white">{value}</span>
        </div>
    );
}

/** Height of the sprite box: the sprites are 250x300, so this shows them near native size. */
const GALLERY_HEIGHT = 'h-72';

/**
 * Sprites of one entity, one at a time, with the file name underneath.
 *
 * Entities whose folder holds more than one sprite get chevrons to page through them; those
 * without any fall back to the "unknown" glyph, since a missing sprite is worth showing.
 */
function EntityImageGallery({ images }: { images: EntityImage[] }) {
    // The list already starts on the resting sprite, so paging opens on it and steps from there.
    const [index, setIndex] = useState(0);

    const current = images[index] ?? null;
    const hasMultiple = images.length > 1;

    const step = (delta: number) => {
        const next = index + delta;
        if (next < 0 || next >= images.length) {
            return;
        }
        setIndex(next);
        playSfx('click');
    };

    return (
        <div className="flex w-72 max-w-full shrink-0 flex-col items-center gap-2">
            <div className="flex w-full items-center gap-1">
                {hasMultiple && (
                    <GalleryChevron direction="left" disabled={index === 0} onClick={() => step(-1)} />
                )}

                <div className={`flex ${GALLERY_HEIGHT} min-w-0 flex-1 items-center justify-center`}>
                    {current ? (
                        <CommonImage
                            src={current.url}
                            alt={current.name}
                            title={current.name}
                            className="h-full w-full"
                        />
                    ) : (
                        <UnknownIcon className="h-24 w-24 text-white/25" />
                    )}
                </div>

                {hasMultiple && (
                    <GalleryChevron
                        direction="right"
                        disabled={index === images.length - 1}
                        onClick={() => step(1)}
                    />
                )}
            </div>

            {current && (
                <span className="w-full truncate text-center text-sm text-white/60" title={current.name}>
                    {current.name}
                </span>
            )}
        </div>
    );
}

/**
 * Chevron that pages the gallery, sized and coloured like the ones in `CommonSelector` so both
 * read as the same control.
 */
function GalleryChevron({ direction, disabled, onClick }: {
    direction: 'left' | 'right';
    disabled: boolean;
    onClick: () => void;
}) {
    const Chevron = direction === 'left' ? ChevronLeft : ChevronRight;

    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => playSfx(BUTTON_SFX_ID)}
            disabled={disabled}
            aria-label={direction === 'left' ? 'Previous image' : 'Next image'}
            className={`shrink-0 transition-colors duration-200 ${disabled
                ? 'cursor-not-allowed text-white/15'
                : 'cursor-pointer text-white/70 hover:text-white'
                }`}
        >
            <Chevron className="h-[0.80em] w-auto block" />
        </button>
    );
}
