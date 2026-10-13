/**
 * `resource_guard` — not spending below the reserve.
 *
 * A score where `1` means the action is safe and `0` means it breaks the floor:
 * the closer a candidate leaves a pool to (or under) the profile's `guard`
 * threshold, the lower it scores. It is what keeps a caster from burning its last
 * mana on a cheap spell when a better one is a turn away.
 */

import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { effectiveStats } from '../../effectResolver';
import { effectiveActionCost } from '../../weaponEffects';

export const resourceGuard: AiConsideration = {
    id: 'resource_guard',
    evaluate(context, candidate) {
        const { actor, thresholds } = context;
        const costs = effectiveActionCost(actor, candidate.action);
        if (costs.mana === 0 && costs.stamina === 0) return 1;

        const stats = effectiveStats(actor);
        let penalty = 0;

        if (costs.mana > 0 && stats.maxMana > 0) {
            const floor = stats.maxMana * thresholds.guardMana;
            const after = actor.currentMana - costs.mana;
            if (after < floor) penalty += clamp((floor - after) / Math.max(1, floor), 0, 1);
        }
        if (costs.stamina > 0 && stats.maxStamina > 0) {
            const floor = stats.maxStamina * thresholds.guardStamina;
            const after = actor.currentStamina - costs.stamina;
            if (after < floor) penalty += clamp((floor - after) / Math.max(1, floor), 0, 1);
        }

        return clamp(1 - penalty, 0, 1);
    },
};
