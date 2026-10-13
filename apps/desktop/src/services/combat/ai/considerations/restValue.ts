/**
 * `rest` — recovering the resource that gates the kit.
 *
 * Only scores when a pool is below its `rest` threshold, and more the emptier it
 * is. A rest that would re-enable a skill the unit cannot currently afford earns
 * a bonus, so a caster tops its mana back up instead of throwing a weak spell.
 */

import { REST_MANA_RESTORE_FRACTION, REST_STAMINA_RESTORE_FRACTION } from '../../../../constants/CombatConstants';
import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { effectiveStats } from '../../effectResolver';
import { effectiveActionCost } from '../../weaponEffects';

/** Bonus when the rest unlocks a skill the unit cannot afford right now. */
const UNLOCK_BONUS = 0.3;

export const restValue: AiConsideration = {
    id: 'rest',
    evaluate(context, candidate) {
        if (candidate.action.kind !== 'rest') return 0;

        const { actor, thresholds } = context;
        const stats = effectiveStats(actor);

        const manaFraction = stats.maxMana > 0 ? actor.currentMana / stats.maxMana : 1;
        const staminaFraction = stats.maxStamina > 0 ? actor.currentStamina / stats.maxStamina : 1;

        let score = 0;
        if (thresholds.restMana > 0 && manaFraction < thresholds.restMana) {
            score = Math.max(score, clamp((thresholds.restMana - manaFraction) / thresholds.restMana, 0, 1));
        }
        if (thresholds.restStamina > 0 && staminaFraction < thresholds.restStamina) {
            score = Math.max(score, clamp((thresholds.restStamina - staminaFraction) / thresholds.restStamina, 0, 1));
        }
        if (score <= 0) return 0;

        const manaRestore = stats.maxMana * REST_MANA_RESTORE_FRACTION;
        const staminaRestore = stats.maxStamina * REST_STAMINA_RESTORE_FRACTION;

        const unlocks = actor.actions.some((action) => {
            if (action.kind !== 'skill' || !action.dealsDamage) return false;
            const cost = effectiveActionCost(actor, action);
            const blockedNow = cost.mana > actor.currentMana || cost.stamina > actor.currentStamina;
            const affordableAfter = cost.mana <= actor.currentMana + manaRestore
                && cost.stamina <= actor.currentStamina + staminaRestore;
            return blockedNow && affordableAfter;
        });

        return clamp(unlocks ? score + UNLOCK_BONUS : score, 0, 1);
    },
};
