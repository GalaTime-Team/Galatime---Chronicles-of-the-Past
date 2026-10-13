/**
 * How much a heal is worth.
 *
 * Shared by the `heal_ally` and `heal_self` considerations so triage is judged
 * the same way for both: a mend matters when the target is actually missing
 * health and the heal covers a meaningful share of it.
 */

import { AI_HEAL_REFERENCE_FRACTION } from '../../../constants/AiConstants';
import type { AiDecisionContext } from '../../../types/AiType';
import type { CombatAction, CombatUnit } from '../../../types/CombatType';
import { clamp } from '../../../utils/combatUtils';
import { previewHealOn } from '../damagePreview';
import { effectiveStats } from '../effectResolver';

/**
 * A `[0, 1]` value for healing `target`: the fraction of its health it is
 * missing, scaled by how completely the heal covers it.
 *
 * A heal worth {@link AI_HEAL_REFERENCE_FRACTION} of the target's max HP (or
 * more) counts as a full mend; a target at full health scores `0`.
 */
export function healScore(
    context: AiDecisionContext,
    action: CombatAction,
    target: CombatUnit,
): number {
    if (!action.heals) return 0;

    const maxHp = effectiveStats(target).maxHp;
    if (maxHp <= 0) return 0;

    const missing = 1 - clamp(target.currentHp / maxHp, 0, 1);
    if (missing <= 0) return 0;

    const healed = previewHealOn(action, context.actor, target, context.state.units);
    if (healed <= 0) return 0;

    const coverage = clamp(healed / (maxHp * AI_HEAL_REFERENCE_FRACTION), 0, 1);
    return missing * coverage;
}
