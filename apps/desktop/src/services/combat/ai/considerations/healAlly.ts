/**
 * `heal_ally` — triage: mend the ally who needs it most.
 *
 * Scores the worst-off *other* ally the action would mend (the unit's own health
 * is `heal_self`'s job), so a support unit reaches for whoever is closest to
 * falling.
 */

import type { AiConsideration } from '../../../../types/AiType';
import { candidateTargetUnits } from '../aiCandidates';
import { healScore } from '../aiHealing';

export const healAlly: AiConsideration = {
    id: 'heal_ally',
    evaluate(context, candidate) {
        const { actor } = context;
        if (!candidate.action.heals) return 0;

        let best = 0;
        for (const target of candidateTargetUnits(context, candidate)) {
            if (target.side !== actor.side || target.id === actor.id) continue;
            best = Math.max(best, healScore(context, candidate.action, target));
        }

        return best;
    },
};
