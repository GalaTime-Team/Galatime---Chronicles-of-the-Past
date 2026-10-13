/**
 * `reposition` — when changing line is worth a turn.
 *
 * Two reasons, both derived from the live board: a unit stuck in the rear whose
 * kit is blocked by short reach wants the front, and a fragile unit taking fire in
 * the front wants the rear. Anything else scores nothing, so a comfortable unit
 * never shuffles for no reason.
 */

import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { attackStat, defenseStat } from '../../damageCalculator';
import { effectiveStats } from '../../effectResolver';
import { estimateThreatAgainst } from '../aiThreat';

/** How much a blocked kit pulls a rear unit forward. */
const BLOCKED_REAR_SCORE = 0.6;

export const repositionValue: AiConsideration = {
    id: 'reposition',
    evaluate(context, candidate) {
        if (candidate.action.kind !== 'switch_line') return 0;

        const { actor } = context;

        // In the rear: only a unit whose short-range kit is unusable wants the front.
        if (actor.line === 'rear') {
            const blocked = actor.actions.some((action) => action.dealsDamage && action.range === 'short');
            return blocked ? BLOCKED_REAR_SCORE : 0;
        }

        // In the front: a fragile unit under pressure wants the rear.
        const stats = effectiveStats(actor);
        if (stats.maxHp <= 0) return 0;

        const danger = clamp(estimateThreatAgainst(context, actor) / stats.maxHp, 0, 1);
        const attack = Math.max(1, attackStat(stats, 'physical'));
        const defense = defenseStat(stats, 'physical');
        const fragility = clamp(1 - defense / (defense + attack), 0, 1);

        return clamp(danger * (0.4 + 0.6 * fragility), 0, 1);
    },
};
