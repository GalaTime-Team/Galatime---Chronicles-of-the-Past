/**
 * Memoised impact lookups for one decision.
 *
 * Every consideration that needs "how much would this hit land for" goes through
 * here rather than calling the damage chain itself, so one decision resolves each
 * *(action × target)* pair at most once. The cache is keyed by the decision
 * context, which is built fresh per turn, so it can never leak between turns.
 */

import type { AiDecisionContext } from '../../../types/AiType';
import type { CombatAction, CombatActionImpact, CombatUnit } from '../../../types/CombatType';
import { effectiveAccuracy, normalizeAccuracy } from '../damageCalculator';
import { effectiveStats } from '../effectResolver';
import { previewImpact } from '../damagePreview';
import { effectiveTimePhase } from '../phaseOverride';
import { scatterCandidates } from '../targetResolver';

const impactCache = new WeakMap<AiDecisionContext, Map<string, CombatActionImpact>>();

/** The deterministic impact of `action` on `target`, computed once per context. */
export function impactFor(
    context: AiDecisionContext,
    action: CombatAction,
    target: CombatUnit,
): CombatActionImpact {
    let byPair = impactCache.get(context);
    if (!byPair) {
        byPair = new Map();
        impactCache.set(context, byPair);
    }

    const key = `${action.id}::${target.id}`;
    const cached = byPair.get(key);
    if (cached) return cached;

    const impact = previewImpact({
        actor: context.actor,
        action,
        target,
        units: context.state.units,
        elementIndex: context.elementIndex,
        random: context.random,
        // The AI reads the same hour of the day the fight does, so it stops
        // reaching for a solar skill at night on its own.
        timePhase: effectiveTimePhase(context.state),
    });
    byPair.set(key, impact);
    return impact;
}

/**
 * Expected number of hits an action lands on one given target.
 *
 * A normal multi-hit action puts every hit on the same target; a scatter action
 * spreads its rays across the whole pool, so one target takes `rays / pool` on
 * average.
 */
export function expectedHitsOn(
    action: CombatAction,
    actor: CombatUnit,
    units: readonly CombatUnit[],
): number {
    const rays = Math.max(1, action.scatterHits ?? action.hitCount);
    if (!action.scatterTargets) return rays;

    const pool = scatterCandidates(units, actor, action);
    return pool.length > 0 ? rays / pool.length : 0;
}

/**
 * Damage an action is expected to land on one target.
 *
 * The preview is a single deterministic hit, so the expectation multiplies it by
 * the hits the target is expected to take and its hit chance. Immunity (or a
 * `x0` element) yields `0`.
 */
export function expectedDamageFor(
    context: AiDecisionContext,
    action: CombatAction,
    target: CombatUnit,
): number {
    if (!action.dealsDamage) return 0;

    const impact = impactFor(context, action, target);
    if (impact.immune) return 0;

    const hits = expectedHitsOn(action, context.actor, context.state.units);
    // The attacker's aim modifier counts: a buffed attacker lands more of what
    // it aims, and the AI has to see that. The live stats are read, so a buff
    // or a debuff is worth what it is worth.
    const accuracy = effectiveAccuracy(action, effectiveStats(context.actor), effectiveStats(target));
    return impact.finalDamage * hits * (normalizeAccuracy(accuracy) / 100);
}
