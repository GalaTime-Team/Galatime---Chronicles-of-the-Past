/**
 * Threat estimation — the AI's "foresight" without simulating anything.
 *
 * Rather than replaying the next round, it reuses the maths the HUD already
 * trusts: how many turns each enemy will take (the same bank-and-carry
 * arithmetic `planTurnOrder` uses) times the best hit that enemy can legally
 * land. The result is memoised per decision context, so a consideration can ask
 * for it freely.
 */

import { SPEED_PER_TURN } from '../../../constants/CombatConstants';
import type { AiDecisionContext } from '../../../types/AiType';
import type { CombatState, CombatUnit } from '../../../types/CombatType';
import { normalizeAccuracy } from '../damageCalculator';
import { effectiveStats } from '../effectResolver';
import { legalTargetIds } from '../targetResolver';
import { impactFor } from './aiImpacts';

const threatCache = new WeakMap<AiDecisionContext, Map<string, number>>();

/** Turns a unit is expected to take in the round it is about to play. */
function turnsNextRound(state: CombatState, unit: CombatUnit): number {
    const total = (state.turnGauges[unit.id] ?? 0) + Math.max(0, effectiveStats(unit).speed);
    return Math.max(1, Math.floor(total / SPEED_PER_TURN));
}

/**
 * Damage one enemy is expected to land on `defender` over the next round.
 *
 * Mirrors `planTurnOrder`'s turn count and the damage chain's expectation (the
 * preview is one hit, so it is scaled by hit count and hit chance).
 */
export function threatFrom(
    context: AiDecisionContext,
    attacker: CombatUnit,
    defender: CombatUnit,
): number {
    const turns = turnsNextRound(context.state, attacker);
    let bestHit = 0;

    for (const action of attacker.actions) {
        if (!action.dealsDamage) continue;
        if (!legalTargetIds(context.state, attacker, action).includes(defender.id)) continue;

        const impact = impactFor(context, action, defender);
        if (impact.immune) continue;

        const expected = impact.finalDamage
            * Math.max(1, action.hitCount)
            * (normalizeAccuracy(action.accuracy) / 100);
        if (expected > bestHit) bestHit = expected;
    }

    return turns * bestHit;
}

/** Total damage the opposing side is expected to land on `defender` next round. */
export function estimateThreatAgainst(
    context: AiDecisionContext,
    defender: CombatUnit,
): number {
    let byUnit = threatCache.get(context);
    if (!byUnit) {
        byUnit = new Map();
        threatCache.set(context, byUnit);
    }

    const cached = byUnit.get(defender.id);
    if (cached !== undefined) return cached;

    let total = 0;
    for (const enemy of context.state.units) {
        if (enemy.status !== 'alive' || enemy.side === defender.side) continue;
        total += threatFrom(context, enemy, defender);
    }

    byUnit.set(defender.id, total);
    return total;
}
