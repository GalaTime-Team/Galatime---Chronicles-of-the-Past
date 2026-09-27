import type { CSSProperties, Ref } from 'react';
import { createPortal } from 'react-dom';
import { ElementIcon } from '../../../assets/GalatimeIcon';
import type { PublicAttack } from '../../../types/AttackDataType';

interface SkillNodeTooltipProps {
    skill: PublicAttack;
    open: boolean;
    floatingRef: Ref<HTMLDivElement>;
    floatingStyles: CSSProperties;
}

/**
 * Hover card of a skill node.
 *
 * The skill name is the heading and the element is only a badge next to it, so nothing is repeated.
 * The stat row reuses the in-game attack card's notation (`PW` / `MN` / `SN`) and adds the XP the
 * skill costs to learn. It is portalled because the map clips its own overflow.
 */
export function SkillNodeTooltip({ skill, open, floatingRef, floatingStyles }: SkillNodeTooltipProps) {
    if (!open) return null;

    return createPortal(
        <div
            ref={floatingRef}
            style={floatingStyles}
            role="tooltip"
            className="pointer-events-none z-100 flex w-72 select-none flex-col border-2 border-white bg-black text-white shadow-xl"
        >
            <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
                <ElementIcon id={skill.element_id} className="h-6 w-6 shrink-0" />
                <h2 className="text-lg font-bold uppercase leading-tight tracking-wide">{skill.name}</h2>
            </div>

            {skill.description?.trim() ? (
                <p className="px-3 pb-2 text-sm leading-relaxed text-white/70">{skill.description.trim()}</p>
            ) : null}

            <dl className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pb-2.5 text-base">
                <SkillStat label="PW" value={readPower(skill)} />
                <SkillStat label="MN" value={readNumber(skill.costs?.mana)} />
                <SkillStat label="SN" value={readNumber(skill.costs?.stamina)} />
                <SkillStat label="XP" value={readNumber(skill.learning_cost?.experience_points)} />
            </dl>
        </div>,
        document.body,
    );
}

/** One stat of the card, laid out as `PW: 55`. */
function SkillStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-baseline gap-1">
            <dt className="text-white/50">{label}:</dt>
            <dd className="font-bold text-white">{value}</dd>
        </div>
    );
}

function readNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Power lives under `damage` as `{ kind: 'fixed', value }`; a ranged power (`{ min, max }`) is
 * summarised by its upper bound. Attacks without damage (wards, heals) report 0.
 */
function readPower(skill: PublicAttack): number {
    const power = skill.damage?.power ?? skill.power;
    if (typeof power === 'number') return power;
    if (!power || typeof power !== 'object') return 0;

    const { value, max } = power as { value?: unknown; max?: unknown };
    if (typeof value === 'number') return value;
    return typeof max === 'number' ? max : 0;
}
