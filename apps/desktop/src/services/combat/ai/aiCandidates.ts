/**
 * Turning legal actions into the candidates the decider scores.
 *
 * The service already validated every rule (cost, cooldown, reach, line,
 * targeting), so this only has to expand a preview into *(action × target)*
 * pairs. Two action kinds are dropped on purpose:
 *
 * - `inventory` is advertised but resolves to `not_implemented`, so picking it
 *   would spend the turn on a rejection;
 * - `flee` is never offered to a unit the player does not own.
 *
 * Either would deadlock the fight, so the AI simply never considers them.
 */

import type { AiCandidate, AiDecisionContext } from '../../../types/AiType';
import type { CombatUnit } from '../../../types/CombatType';

/** Actions the AI must never pick, because they cannot resolve. */
const EXCLUDED_KINDS: ReadonlySet<string> = new Set(['inventory', 'flee']);

/**
 * Every legal move for the actor, one candidate per target of a single-target
 * action and one candidate (carrying its whole target list) for the rest.
 */
export function buildAiCandidates(context: AiDecisionContext): AiCandidate[] {
    const { actor, previews } = context;
    const candidates: AiCandidate[] = [];

    for (const preview of previews) {
        if (!preview.usable) continue;

        const { action } = preview;
        if (EXCLUDED_KINDS.has(action.kind)) continue;

        if (action.targeting === 'enemy_one') {
            for (const targetId of preview.targetIds) {
                candidates.push({
                    action,
                    key: `${action.id}:${targetId}`,
                    targetId,
                    targetIds: [targetId],
                });
            }
            continue;
        }

        // `self` targets resolve to the actor; the team scopes carry their list.
        const targetIds = action.targeting === 'self' ? [actor.id] : [...preview.targetIds];
        candidates.push({ action, key: action.id, targetId: null, targetIds });
    }

    return candidates;
}

/** The live units a candidate would land on. */
export function candidateTargetUnits(
    context: AiDecisionContext,
    candidate: AiCandidate,
): CombatUnit[] {
    const byId = new Map(context.state.units.map((unit) => [unit.id, unit]));
    return candidate.targetIds
        .map((id) => byId.get(id))
        .filter((unit): unit is CombatUnit => unit !== undefined);
}
