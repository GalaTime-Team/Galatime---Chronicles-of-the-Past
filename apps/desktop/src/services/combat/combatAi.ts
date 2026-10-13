/**
 * The opponent's turn.
 *
 * A fight only moves when somebody acts, and only a player-controlled unit has a
 * person behind it — so every other unit needs an opinion. This module is that
 * opinion, and it is now a thin facade: the decision itself is a Utility AI
 * (`services/combat/ai/`) that scores every legal *(action × target)* with a set
 * of weighted considerations drawn from the unit's own `ai:` profile.
 *
 * Keeping `chooseCombatAction` a pure function of a decision context means the
 * same decision can be tested without a battle around it. `combatService` builds
 * that context (`getCombatDecisionContext`); `CombatEncounter` calls this on the
 * opponent's turn and submits the result through the same path a player uses.
 */

import type { AiDecisionContext } from '../../types/AiType';
import type { CombatActionRequest } from '../../types/CombatType';
import { decideCombatAction, type AiDecision } from './ai/aiDecider';

/**
 * Picks the next action for a unit nobody plays.
 *
 * Returns `null` only when the unit has nothing it can legally do, which the
 * caller should treat as a stall rather than a move.
 */
export function chooseCombatAction(context: AiDecisionContext): CombatActionRequest | null {
    return decideCombatAction(context).request;
}

export { decideCombatAction };
export type { AiDecision };
