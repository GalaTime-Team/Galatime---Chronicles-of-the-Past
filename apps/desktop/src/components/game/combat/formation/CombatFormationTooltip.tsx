import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { ArrowDown, ArrowUp, ElementIcon } from '../../../../assets/GalatimeIcon';
import CommonHoverElement from '../../../common/CommonHoverElement';
import { fetchAttack } from '../../../../controllers/attackController';
import type { CombatStats } from '../../../../types/CombatType';
import type { CombatFormationEntity, CombatStatModifier, CombatWeaponDisplay } from './CombatFormationHUD.types';

interface CombatFormationTooltipProps {
    id: string;
    entity: CombatFormationEntity;
    showDetails: boolean;
    floatingRef: (node: HTMLElement | null) => void;
    style: CSSProperties;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
}

interface FormationSkill {
    id: string;
    name: string;
    elementId: string;
    isKnown: boolean;
}

function displayElementName(id: string) {
    return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** How each stat a modifier can name is written on the board. */
const STAT_LABELS: Record<keyof CombatStats, string> = {
    maxHp: 'HP',
    maxMana: 'Mana',
    maxStamina: 'Stamina',
    physicalAttack: 'Physical Attack',
    magicalAttack: 'Magical Attack',
    physicalDefense: 'Physical Defense',
    magicalDefense: 'Magical Defense',
    speed: 'Speed',
    accuracy: 'Accuracy',
    evasion: 'Evasion',
    critChance: 'Critical',
};

/** `+10`, `-12`, `+2.5` — the sign is the point, so it is always drawn. */
function formatDelta(delta: number): string {
    return `${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10}`;
}

/**
 * `Ammo 3 (arrow)` — the weapon's consumable state, or `''`.
 *
 * Durability is deliberately left out: a hover on the unit is about who it is
 * and what it carries, not the wear counter of the blade in its hands.
 */
function weaponStateLine(weapon: CombatWeaponDisplay): string {
    return weapon.ammo ? `Ammo ${weapon.ammo.remaining} (${weapon.ammo.item})` : '';
}

/**
 * The stats the unit's live effects have raised and lowered.
 *
 * A raise is green with an up arrow and a drop red with a down arrow, so a buffed or crippled
 * unit reads at a glance — before any of the detail further down the tooltip.
 */
function FormationModifiers({ modifiers }: { modifiers: readonly CombatStatModifier[] }) {
    if (modifiers.length === 0) return null;

    return (
        <>
            {modifiers.map((modifier) => {
                const raised = modifier.delta > 0;
                return (
                    <span
                        key={modifier.stat}
                        className={`flex items-center gap-0.5 whitespace-nowrap font-pixel text-[10px] leading-2.5 sm:text-xs ${raised ? 'text-galatime-success' : 'text-galatime-error'}`}
                    >
                        {raised ? <ArrowUp /> : <ArrowDown />}
                        {STAT_LABELS[modifier.stat]}
                        <span className="tabular-nums">{formatDelta(modifier.delta)}</span>
                    </span>
                );
            })}
        </>
    );
}

interface FormationElementsProps {
    /** Every element the character carries; the weaknesses are read from the combination. */
    elementIds: readonly string[];
    /** Whether the fighting-tooltip setting allows the weakness table. */
    showWeaknesses: boolean;
}

/**
 * The character's elements, which hover as one block.
 *
 * The block is the trigger rather than each name, because the answer is about the
 * *combination*: the multipliers are consolidated across it, so a single element
 * on its own would not mean anything. A block is also a stable target - a row of
 * separate triggers opens and closes as the pointer crosses the gaps between them.
 *
 * The popup itself ignores the pointer. One that could take it would pull the
 * pointer off the row, close, and re-open under the cursor, flickering forever.
 */
function FormationElements({ elementIds: combinationIds, showWeaknesses }: FormationElementsProps) {
    const [hovered, setHovered] = useState(false);
    const { refs, floatingStyles } = useFloating({
        open: hovered,
        placement: 'left-start',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift({ padding: 12 })],
    });

    return (
        <>
            <div
                ref={refs.setReference}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className={`mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:mt-2 sm:gap-x-2 sm:gap-y-1 ${showWeaknesses ? 'cursor-help' : ''}`}
            >
                {combinationIds.map((elementId) => (
                    <span
                        key={elementId}
                        className="flex items-center gap-1 whitespace-nowrap font-pixel text-xs leading-2.5 text-white/75 sm:text-sm"
                    >
                        <ElementIcon id={elementId} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        {displayElementName(elementId)}
                    </span>
                ))}
            </div>

            {hovered && showWeaknesses && createPortal(
                <div ref={refs.setFloating} style={floatingStyles} className="pointer-events-none z-200">
                    <CommonHoverElement
                        elementIds={[...combinationIds]}
                        elementName={combinationIds.map(displayElementName).join(' / ')}
                        isVisible
                        isTooltip
                        isAttack={false}
                    />
                </div>,
                document.body,
            )}
        </>
    );
}

/** Entity identity, with catalogue-resolved skill details when the fighting tooltip setting is on. */
export function CombatFormationTooltip({
    id,
    entity,
    showDetails,
    floatingRef,
    style,
    onPointerEnter,
    onPointerLeave,
}: CombatFormationTooltipProps) {
    const elementIds = useMemo(() => [...new Set(entity.elementIds ?? [])], [entity.elementIds]);
    const skillIds = useMemo(() => [...new Set(entity.skillIds ?? [])], [entity.skillIds]);
    const abilities = entity.abilities ?? [];
    const modifiers = entity.modifiers ?? [];
    const weapon = entity.weapon ?? null;
    const [skills, setSkills] = useState<FormationSkill[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        setSkills(null);

        if (!showDetails || skillIds.length === 0) {
            setSkills([]);
            return () => { cancelled = true; };
        }

        const resolveSkills = async () => {
            const resolved: FormationSkill[] = [];
            for (const skillId of skillIds) {
                if (cancelled) return;
                try {
                    const attack = await fetchAttack(skillId);
                    resolved.push(attack
                        ? { id: skillId, name: attack.name, elementId: attack.element_id, isKnown: true }
                        : { id: skillId, name: displayElementName(skillId), elementId: 'unknown', isKnown: false });
                } catch (error) {
                    console.error(`Failed to resolve formation skill "${skillId}":`, error);
                    resolved.push({ id: skillId, name: displayElementName(skillId), elementId: 'unknown', isKnown: false });
                }
            }
            if (!cancelled) setSkills(resolved);
        };
        void resolveSkills();

        return () => { cancelled = true; };
    }, [skillIds, showDetails]);

    return (
        <div
            id={id}
            ref={floatingRef}
            style={style}
            role="tooltip"
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            className="z-100 w-max max-w-[min(15rem,calc(100vw-3rem))] border-2 border-white bg-galatime-dark px-2 py-1.5 text-white shadow-[0_8px_26px_rgba(0,0,0,0.6)] sm:max-w-[min(21rem,calc(100vw-1.5rem))] sm:px-3 sm:py-2.5"
        >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="font-pixel text-sm uppercase leading-2.5 tracking-[0.08em] sm:text-lg">{entity.name}</p>
                <FormationModifiers modifiers={modifiers} />
            </div>

            {elementIds.length > 0 ? (
                <FormationElements elementIds={elementIds} showWeaknesses={showDetails} />
            ) : (
                <p className="mt-1 font-pixel text-xs leading-2.5 text-white/45">No known elements</p>
            )}

            {/* The equipped weapon: what is in this unit's hands right now, with
                its live ammo when the weapon feeds on any. Only meaningful with
                the detail view on. */}
            {showDetails && weapon && (
                <div className="mt-4 flex flex-col gap-y-0.5 border-t border-white/20 pt-3 sm:mt-5 sm:pt-4">
                    <span className="flex items-baseline gap-1.5 font-pixel text-xs leading-2.5 text-white/90 sm:text-sm">
                        {weapon.name}
                        <span className="text-[10px] uppercase tracking-[0.08em] text-white/40 sm:text-xs">{weapon.type}</span>
                    </span>
                    {weapon.summary && (
                        <span className="font-pixel text-[10px] leading-2.5 text-white/55 sm:text-xs">{weapon.summary}</span>
                    )}
                    {weaponStateLine(weapon) && (
                        <span className="font-pixel text-[10px] leading-2.5 text-white/45 sm:text-xs">{weaponStateLine(weapon)}</span>
                    )}
                </div>
            )}

            {/* Abilities sit right under the identity: what this creature *is*,
                before the list of things it can cast. */}
            {showDetails && abilities.length > 0 && (
                <div className="mt-4 flex flex-col gap-y-1.5 border-t border-white/20 pt-3 sm:mt-5 sm:gap-y-2 sm:pt-4">
                    {abilities.map((ability) => (
                        <div key={ability.id} className="flex flex-col gap-y-0.5">
                            <span className="font-pixel text-xs leading-2.5 text-white/90 sm:text-sm">
                                {ability.name}
                            </span>
                            {ability.description && (
                                <span className="font-pixel text-[10px] leading-2.5 text-white/55 sm:text-xs">
                                    {ability.description}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {showDetails && (skills === null ? (
                <p className="mt-4 font-pixel text-xs leading-2.5 text-white/35 sm:mt-5">Loading skills…</p>
            ) : skills.length > 0 ? (
                <div className="mt-4 flex flex-col gap-y-1 border-t border-white/20 pt-3 sm:mt-5 sm:gap-y-1.5 sm:pt-4">
                    {skills.map((skill) => (
                        <span
                            key={skill.id}
                            title={skill.isKnown ? undefined : `Unknown skill: ${skill.id}`}
                            className="flex items-center gap-1 whitespace-nowrap font-pixel text-xs leading-2.5 text-white/80"
                        >
                            <ElementIcon id={skill.elementId} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            {skill.name}
                        </span>
                    ))}
                </div>
            ) : null)}
        </div>
    );
}
