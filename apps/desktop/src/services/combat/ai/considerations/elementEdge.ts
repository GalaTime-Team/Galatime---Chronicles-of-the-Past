/**
 * `element_edge` — a taste for super-effective matches beyond the raw damage.
 *
 * The damage chain already rewards a good element through `expected_damage`;
 * this adds a *preference* for it, so a caster will pick the element a target is
 * weak to even when another action would deal a comparable number. A neutral or
 * resisted match scores nothing.
 */

import { ELEMENT_DAMAGE_MULTIPLIERS } from '../../../../constants/CombatConstants';
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

        // Read the ladder itself, so retuning the multipliers in
        // `CombatConstants` never leaves the AI judging efficacy by old bands.
        if (best >= ELEMENT_DAMAGE_MULTIPLIERS.super_weak) return 1;
        if (best >= ELEMENT_DAMAGE_MULTIPLIERS.weak) return 0.75;
        if (best > ELEMENT_DAMAGE_MULTIPLIERS.normal) return 0.5;
        return 0;
    },
};
