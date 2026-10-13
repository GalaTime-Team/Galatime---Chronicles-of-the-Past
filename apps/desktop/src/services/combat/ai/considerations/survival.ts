/**
 * `survival` — the value of removing incoming danger.
 *
 * The threat the unit faces next round, made real: a candidate that kills an
 * enemy removes that enemy's whole threat contribution, and bracing removes the
 * half the reduction protects. Scaled by how badly the unit needs it, so a
 * healthy unit ignores a low threat and a wounded one values the same removal
 * far more.
 */

import { DEFEND_DAMAGE_REDUCTION } from '../../../../constants/CombatConstants';
import { AI_MIN_THREAT } from '../../../../constants/AiConstants';
import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { effectiveStats } from '../../effectResolver';
import { candidateTargetUnits } from '../aiCandidates';
import { expectedDamageFor } from '../aiImpacts';
import { estimateThreatAgainst, threatFrom } from '../aiThreat';

export const survival: AiConsideration = {
    id: 'survival',
    evaluate(context, candidate) {
        const { actor, thresholds } = context;
        const maxHp = effectiveStats(actor).maxHp;
        if (maxHp <= 0) return 0;

        const threat = estimateThreatAgainst(context, actor);
        if (threat <= 0) return 0;

        const danger = clamp(threat / Math.max(AI_MIN_THREAT, maxHp), 0, 1);

        let removed = 0;
        if (candidate.action.dealsDamage) {
            for (const target of candidateTargetUnits(context, candidate)) {
                if (target.side === actor.side) continue;
                if (expectedDamageFor(context, candidate.action, target) >= target.currentHp) {
                    removed += threatFrom(context, target, actor);
                }
            }
        } else if (candidate.action.kind === 'defend') {
            removed = threat * DEFEND_DAMAGE_REDUCTION;
        }

        if (removed <= 0) return 0;

        const value = clamp(removed / Math.max(AI_MIN_THREAT, threat), 0, 1);
        const wounded = actor.currentHp / maxHp < thresholds.wounded;
        const urgency = wounded ? 1 : danger;

        return clamp(value * urgency, 0, 1);
    },
};
