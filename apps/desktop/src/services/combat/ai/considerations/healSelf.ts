/**
 * `heal_self` — patching yourself up.
 *
 * Same triage value as `heal_ally`, but for the actor's own health, with an extra
 * push when it is below the `wounded` threshold — the moment the old AI healed,
 * now one consideration among many.
 */

import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { effectiveStats } from '../../effectResolver';
import { healScore } from '../aiHealing';

export const healSelf: AiConsideration = {
    id: 'heal_self',
    evaluate(context, candidate) {
        const { actor, thresholds } = context;
        if (!candidate.action.heals) return 0;
        if (!candidate.targetIds.includes(actor.id)) return 0;

        const score = healScore(context, candidate.action, actor);
        if (score <= 0) return 0;

        const maxHp = Math.max(1, effectiveStats(actor).maxHp);
        const wounded = actor.currentHp / maxHp < thresholds.wounded;

        return clamp(score * (wounded ? 1.5 : 1), 0, 1);
    },
};
