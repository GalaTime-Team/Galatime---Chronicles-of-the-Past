/**
 * `flee` — the value of running away.
 *
 * Only a candidate that actually is a `flee` action scores here. The panic gate
 * lives in {@link fleeChanceFor}, so a healthy unit returns `0` and the decider
 * never spends a turn on a card the service would refuse. Below the gate the
 * score combines how likely the escape is with how badly the unit needs it
 * (incoming threat and distance from the gate).
 */

import { AI_MIN_THREAT } from '../../../../constants/AiConstants';
import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { effectiveStats } from '../../effectResolver';
import {
    fleeChanceFor,
    fleeRuleFor,
    unitHpFraction,
} from '../../fleeRules';
import { estimateThreatAgainst } from '../aiThreat';

export const fleeValue: AiConsideration = {
    id: 'flee',
    evaluate(context, candidate) {
        if (candidate.action.kind !== 'flee') return 0;

        const { actor } = context;
        const rule = fleeRuleFor(actor);
        if (!rule) return 0;

        const chance = fleeChanceFor(actor);
        if (chance <= 0) return 0;

        const maxHp = effectiveStats(actor).maxHp;
        if (maxHp <= 0) return 0;

        const hp = unitHpFraction(actor);
        const desperation = rule.belowHp > 0
            ? clamp((rule.belowHp - hp) / rule.belowHp, 0, 1)
            : 0;
        const threat = estimateThreatAgainst(context, actor);
        const danger = clamp(threat / Math.max(AI_MIN_THREAT, maxHp), 0, 1);

        return clamp(chance * Math.max(danger, desperation), 0, 1);
    },
};
