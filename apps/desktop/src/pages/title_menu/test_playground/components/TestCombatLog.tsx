import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CombatEvent, CombatUnit } from '../../../../types/CombatType';

interface TestCombatLogProps {
    /** Every event the fight has produced so far, oldest first. */
    events: readonly CombatEvent[];
    /** The roster as it stands, used to turn unit ids back into names. */
    units: readonly CombatUnit[];
    onClear?: () => void;
    className?: string;
}

type LogTone =
    | 'start'
    | 'turn'
    | 'action'
    | 'damage'
    | 'miss'
    | 'heal'
    | 'effect'
    | 'death'
    | 'resource'
    | 'end';

interface LogLine {
    key: number;
    tone: LogTone;
    text: string;
    detail?: string;
}

const TONE_CLASSES: Record<LogTone, string> = {
    start: 'text-white',
    turn: 'text-galatime-primary',
    action: 'text-white/85',
    damage: 'text-galatime-stats-damage',
    miss: 'text-white/40',
    heal: 'text-galatime-stats-health',
    effect: 'text-galatime-accent',
    death: 'text-galatime-error',
    resource: 'text-galatime-stats-stamina',
    end: 'text-white font-bold',
};

/**
 * Trims a computed number to at most two decimals.
 *
 * The damage pipeline multiplies floats, so a raw `baseDamage` reads as
 * `2.4390243902439024` — precise, and useless on a log line.
 */
function short(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Turns the fight's events into readable lines.
 *
 * `attack_resolved` is the one worth reading closely: it carries the whole
 * calculation — the attack and defence stats, the power, the element and lane
 * multipliers, the variance roll and the HP the target was left on.
 */
function formatEvents(
    events: readonly CombatEvent[],
    nameOf: (unitId: string) => string,
): LogLine[] {
    const lines: LogLine[] = [];

    for (const [key, event] of events.entries()) {
        switch (event.type) {
            case 'combat_started':
                lines.push({
                    key,
                    tone: 'start',
                    text: 'Combat started',
                    detail: `order: ${event.order.map(nameOf).join(' → ')}`,
                });
                break;

            case 'turn_started':
                lines.push({ key, tone: 'turn', text: `${nameOf(event.unitId)} acts` });
                break;

            case 'action_used':
                lines.push({
                    key,
                    tone: 'action',
                    text: `${nameOf(event.actorId)} uses ${event.actionName}`,
                    detail: event.targetIds.length > 0
                        ? `→ ${event.targetIds.map(nameOf).join(', ')}`
                        : undefined,
                });
                break;

            case 'attack_resolved': {
                const hit = event.resolution;
                const attacker = nameOf(hit.attackerId);
                const target = nameOf(hit.targetId);

                const stats = [
                    `ATK ${short(hit.attackValue)} (${hit.damageType})`,
                    `DEF ${short(hit.defenseValue)}`,
                    `PW ${hit.power}`,
                ];

                if (!hit.isHit) {
                    lines.push({
                        key,
                        tone: 'miss',
                        text: `${attacker} misses ${target}`,
                        detail: `${stats.join(' · ')} · elem ×${hit.elementMultiplier}`,
                    });
                    break;
                }

                // The chain in the order it is evaluated:
                // (ATK / DEF) x EFFECT x PWR -> lane -> bracing -> variance.
                const chain = [
                    `${stats.join(' · ')}`,
                    `ATK÷DEF ${short(hit.attackValue / Math.max(1, hit.defenseValue))}`,
                    `elem ×${hit.elementMultiplier}`,
                    `→ base ${short(hit.baseDamage)}`,
                    `pos ×${hit.positionModifier}`,
                    ...(hit.defenseReduction > 0 ? [`brace ×${short(1 - hit.defenseReduction)}`] : []),
                    `var ×${short(hit.variance)}`,
                    `= ${short(hit.finalDamage)}`,
                    ...(hit.hits > 1 ? [`(${hit.hits} hits)`] : []),
                ];

                lines.push({
                    key,
                    tone: 'damage',
                    text: `${attacker} → ${target}: −${short(hit.finalDamage)} HP`,
                    detail: `${chain.join(' · ')} · HP ${short(hit.targetHpBefore)} → ${short(hit.targetHpAfter)}`,
                });
                break;
            }

            case 'healed':
                lines.push({
                    key,
                    tone: 'heal',
                    text: `${nameOf(event.resolution.sourceId)} → ${nameOf(event.resolution.targetId)}: +${event.resolution.amount} HP`,
                    detail: `HP ${event.resolution.targetHpAfter}`,
                });
                break;

            case 'effect_applied':
                lines.push({
                    key,
                    tone: 'effect',
                    text: `${nameOf(event.unitId)} gains ${event.statusEffect ?? event.effectId}`,
                    detail: event.turns === null ? 'until combat ends' : `${event.turns} turn(s)`,
                });
                break;

            case 'effect_expired':
                lines.push({
                    key,
                    tone: 'effect',
                    text: `${nameOf(event.unitId)} loses ${event.effectId}`,
                });
                break;

            case 'resource_changed':
                lines.push({
                    key,
                    tone: 'resource',
                    text: `${nameOf(event.unitId)}: ${event.resource.toUpperCase()} ${event.previous} → ${event.next}`,
                });
                break;

            case 'unit_defeated':
                lines.push({ key, tone: 'death', text: `${nameOf(event.unitId)} is defeated` });
                break;

            case 'unit_line_changed':
                lines.push({
                    key,
                    tone: 'action',
                    text: `${nameOf(event.unitId)} moves to the ${event.line} line`,
                });
                break;

            case 'flee_attempted':
                lines.push({
                    key,
                    tone: 'end',
                    text: `${nameOf(event.unitId)} ${event.escaped ? 'escaped' : 'failed to escape'}`,
                });
                break;

            case 'combat_ended':
                lines.push({
                    key,
                    tone: 'end',
                    text: `Combat over: ${event.outcome}`,
                    detail: event.reason,
                });
                break;

            case 'turn_ended':
                // The next `turn_started` already delimits a turn; logging both doubles the noise.
                break;

            case 'weapon_durability_changed':
                lines.push({
                    key,
                    tone: 'resource',
                    text: `${nameOf(event.unitId)}: ${event.weaponId} durability ${event.previous} → ${event.next}`,
                });
                break;

            case 'weapon_broken':
                lines.push({
                    key,
                    tone: 'death',
                    text: `${nameOf(event.unitId)}'s ${event.weaponName} breaks!`,
                });
                break;

            case 'weapon_equipped':
                lines.push({
                    key,
                    tone: 'resource',
                    text: `${nameOf(event.unitId)} takes ${event.weaponName} in hand (no turn spent)`,
                });
                break;

            case 'weapon_ammo_changed':
                lines.push({
                    key,
                    tone: 'resource',
                    text: `${nameOf(event.unitId)}: ${event.itemId} ${event.consumed ? 'spent' : 'kept'} (${event.remaining} left)`,
                });
                break;

            case 'loot_gained':
                lines.push({
                    key,
                    tone: 'end',
                    text: `Loot: ${event.itemName} ×${event.quantity}`,
                    detail: `from ${nameOf(event.sourceId)}`,
                });
                break;
        }
    }

    return lines;
}

/** Running commentary on a playground fight: actions, rolls, damage maths and deaths. */
export function TestCombatLog({ events, units, onClear, className = '' }: TestCombatLogProps) {
    const { t } = useTranslation('playground');
    const boxRef = useRef<HTMLDivElement | null>(null);

    const lines = useMemo(() => {
        const names = new Map(units.map((unit) => [unit.id, unit.name]));
        return formatEvents(events, (unitId) => names.get(unitId) ?? unitId);
    }, [events, units]);

    // Follow the fight: the newest line is the one being looked at.
    useEffect(() => {
        const box = boxRef.current;
        if (box) box.scrollTop = box.scrollHeight;
    }, [lines.length]);

    return (
        <section
            aria-label={t('playground.combat.logTitle')}
            className={`flex min-h-0 flex-col border-2 border-white/15 bg-black/40 ${className}`}
        >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-white/15 px-2 py-1">
                <h3 className="text-[11px] uppercase tracking-[0.15em] text-white/55">
                    {t('playground.combat.logTitle')}
                </h3>

                {onClear && lines.length > 0 && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="text-[10px] uppercase tracking-[0.12em] text-white/40 transition-colors hover:text-white"
                    >
                        {t('playground.combat.logClear')}
                    </button>
                )}
            </header>

            <div ref={boxRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
                {lines.length === 0 ? (
                    <p className="text-[11px] text-white/35">{t('playground.combat.logEmpty')}</p>
                ) : (
                    <ol className="flex flex-col gap-1.5 font-mono text-[11px] leading-4">
                        {lines.map((line) => (
                            <li key={line.key} className="flex flex-col">
                                <span className={TONE_CLASSES[line.tone]}>{line.text}</span>
                                {line.detail && (
                                    <span className="text-white/35">{line.detail}</span>
                                )}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </section>
    );
}

export default TestCombatLog;
