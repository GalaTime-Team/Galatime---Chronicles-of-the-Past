/**
 * `element_edge` — a taste for super-effective matches beyond the raw damage.
 *
 * The damage chain already rewards a good element through `expected_damage`;
 * this adds a *preference* for it, so a caster will pick the element a target is
 * weak to even when another action would deal a comparable number. A neutral or
 * resisted match scores nothing.
 */

import type { AiConsideration } from '../../../../types/AiType';
import { candidateTargetUnits } from '../aiCandidates';
import { impactFor } from '../aiImpacts';

export const elementEdge: AiConsideration = {
    id: 'element_edge',
    evaluate(context, candidate) {
        const { action } = candidate;
        if (!action.dealsDamage) return 0;

        let best = 0;
        for (const target of candidateTargetUnits(context, candidate)) {
            best = Math.max(best, impactFor(context, action, target).elementMultiplier);
        }

        if (best >= 3) return 1;
        if (best >= 2) return 0.75;
        if (best >= 1.5) return 0.5;
        if (best > 1) return 0.25;
        return 0;
    },
};
