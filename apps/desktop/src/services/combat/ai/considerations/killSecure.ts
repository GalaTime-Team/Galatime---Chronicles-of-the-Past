/**
 * `kill_secure` — the value of finishing a target off.
 *
 * A hit that covers a target's remaining health scores `1`; a partial hit decays
 * with the fraction it removes. Weighted above raw damage, it is what makes the
 * AI focus fire on a wounded enemy instead of spreading damage around.
 */

import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { candidateTargetUnits } from '../aiCandidates';
import { expectedDamageFor } from '../aiImpacts';

export const killSecure: AiConsideration = {
    id: 'kill_secure',
    evaluate(context, candidate) {
        const { action } = candidate;
        if (!action.dealsDamage) return 0;

        let best = 0;
        for (const target of candidateTargetUnits(context, candidate)) {
            const expected = expectedDamageFor(context, action, target);
            if (expected <= 0) continue;

            best = Math.max(best, clamp(expected / Math.max(1, target.currentHp), 0, 1));
        }

        return best;
    },
};
