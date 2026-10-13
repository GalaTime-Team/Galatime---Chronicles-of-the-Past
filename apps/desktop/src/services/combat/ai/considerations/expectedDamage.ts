/**
 * `expected_damage` — how much of the target's health the candidate removes.
 *
 * The workhorse: the damage chain's deterministic expectation, normalised by the
 * target's max HP, so a hit that would take half a bar reads as `0.5`. A
 * multi-target action sums its targets but with a ceiling, so a huge AoE cannot
 * dwarf a decisive single-target strike.
 */

import { AI_AOE_DAMAGE_CAP } from '../../../../constants/AiConstants';
import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { effectiveStats } from '../../effectResolver';
import { candidateTargetUnits } from '../aiCandidates';
import { expectedDamageFor } from '../aiImpacts';

export const expectedDamage: AiConsideration = {
    id: 'expected_damage',
    evaluate(context, candidate) {
        const { action } = candidate;
        if (!action.dealsDamage) return 0;

        const targets = candidateTargetUnits(context, candidate);
        if (targets.length === 0) return 0;

        let fraction = 0;
        for (const target of targets) {
            const maxHp = effectiveStats(target).maxHp;
            if (maxHp <= 0) continue;
            fraction += expectedDamageFor(context, action, target) / maxHp;
        }

        return clamp(fraction, 0, AI_AOE_DAMAGE_CAP) / AI_AOE_DAMAGE_CAP;
    },
};
