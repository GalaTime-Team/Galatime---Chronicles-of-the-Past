/**
 * Damage queries.
 *
 * Exposes the single damage chain for previews and tooltips, plus the precomputed
 * element efficacy index built from the shared element matrix.
 *
 * The chain itself lives in `services/combat/damageCalculator`; this facade only
 * re-exports the shape callers read.
 */

import { buildElementDamageIndex } from '../services/combat/damageCalculator';
import { previewCombatDamage } from '../services/combatService';
import { getAllElementsDataService } from '../services/elementService';
import type { CombatActionImpact, CombatElementIndex, CombatResult } from '../types/CombatType';

export type { CombatActionImpact } from '../types/CombatType';

/** Builds the element efficacy index from the bundled element catalogue. */
export async function fetchCombatElementIndex(): Promise<CombatElementIndex> {
    const elements = await getAllElementsDataService();
    return buildElementDamageIndex(elements);
}

/**
 * What an action would do to a target, without rolling randomness.
 *
 * Reads a live fight session, so it never advances the turn.
 */
export function previewCombatAttack(
    sessionId: string,
    actorUnitId: string,
    actionId: string,
    targetUnitId: string,
): CombatResult<CombatActionImpact> {
    return previewCombatDamage(sessionId, actorUnitId, actionId, targetUnitId);
}
