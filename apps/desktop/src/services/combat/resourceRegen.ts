/**
 * Idle resource regeneration.
 *
 * A resource (mana or stamina) a unit does not spend during its own turn
 * regenerates on the NEXT turn's start, and the payout grows every further
 * idle turn along the Fibonacci sequence — 1, 1, 2, 3, 5, 8, 13, 21 …
 *
 * Fibonacci was chosen over a plain exponential or the golden ratio because it
 * IS the golden-ratio exponential (`fib(n) ≈ φⁿ/√5`) while staying integer
 * native — no rounding drift, it starts exactly at the configured minimum, and
 * it reaches the cap in ~7 idle turns instead of ~4 (pure doubling), so the
 * reward for hoarding ramps smoothly rather than exploding.
 *
 * The payout is floored at `RESOURCE_REGEN_MINIMUM` and capped at
 * `RESOURCE_REGEN_MAX_FRACTION` of the pool's maximum.
 *
 * Spending ANY of the resource (a skill cost, a drain, a cursed tax) resets
 * that resource's streak to zero; inflows like `rest` or a heal do not.
 */

import {
    RESOURCE_REGEN_MAX_FRACTION,
    RESOURCE_REGEN_MINIMUM,
} from '../../constants/CombatConstants';
import type { CombatEvent, CombatUnit } from '../../types/CombatType';
import { changeResource, effectiveStats } from './effectResolver';

/** Resources the idle curve applies to (never HP). */
const IDLE_RESOURCES = ['mana', 'stamina'] as const;

/** The `steps`-th Fibonacci number, 1-indexed: 1, 1, 2, 3, 5, 8, 13, 21 … */
export function fibonacci(steps: number): number {
    let previous = 0;
    let current = 1;
    for (let index = 1; index < steps; index += 1) {
        const next = previous + current;
        previous = current;
        current = next;
    }
    return current;
}

/**
 * The payout for one idle turn of a pool with maximum `max`, after `idleTurns`
 * consecutive idle turns: Fibonacci growth, floored at the minimum and capped
 * at an eighth of the pool.
 */
export function idleRegenAmount(max: number, idleTurns: number): number {
    const cap = Math.max(RESOURCE_REGEN_MINIMUM, Math.floor(max * RESOURCE_REGEN_MAX_FRACTION));
    return Math.min(cap, Math.max(RESOURCE_REGEN_MINIMUM, fibonacci(Math.max(1, idleTurns))));
}

/**
 * Pays the idle regen at the START of a unit's own turn, before cooldowns and
 * effect ticks.
 *
 * For each resource: an unspent previous turn banks one more idle turn and pays
 * out; a spent one resets the streak and pays nothing. The streak keeps banking
 * while the pool is full, so sitting at full mana and then dumping it still
 * pays the capped amount on the next idle turn.
 */
export function tickResourceRegen(unit: CombatUnit): CombatEvent[] {
    const events: CombatEvent[] = [];
    const stats = effectiveStats(unit);

    for (const resource of IDLE_RESOURCES) {
        const spent = unit.resourceSpentSinceTurnStart[resource];
        unit.resourceSpentSinceTurnStart[resource] = false;

        if (spent) {
            unit.resourceIdleTurns[resource] = 0;
            continue;
        }

        unit.resourceIdleTurns[resource] += 1;
        const max = resource === 'mana' ? stats.maxMana : stats.maxStamina;
        if (max <= 0) continue;

        events.push(
            ...changeResource(unit, resource, idleRegenAmount(max, unit.resourceIdleTurns[resource])),
        );
    }

    return events;
}
