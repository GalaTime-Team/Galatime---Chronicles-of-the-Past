/**
 * `defend` — the worth of bracing.
 *
 * The engine halves incoming damage while bracing, so this scores the half of
 * next round's threat the brace would save, as a fraction of the unit's health.
 * It is also the decider's floor: `defend` is always a legal, cheap candidate, so
 * a unit with nothing better to do still moves the fight on.
 */

import { DEFEND_DAMAGE_REDUCTION } from '../../../../constants/CombatConstants';
import type { AiConsideration } from '../../../../types/AiType';
import { clamp } from '../../../../utils/combatUtils';
import { effectiveStats } from '../../effectResolver';
import { estimateThreatAgainst } from '../aiThreat';

export const defendValue: AiConsideration = {
    id: 'defend',
    evaluate(context, candidate) {
        if (candidate.action.kind !== 'defend') return 0;

        const { actor } = context;
        const maxHp = effectiveStats(actor).maxHp;
        if (maxHp <= 0) return 0;

        const avoided = estimateThreatAgainst(context, actor) * DEFEND_DAMAGE_REDUCTION;
        return clamp(avoided / maxHp, 0, 1);
    },
};
