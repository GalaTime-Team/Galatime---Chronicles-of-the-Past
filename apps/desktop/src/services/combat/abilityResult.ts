/**
 * The outcome of executing one ability action.
 *
 * Kept apart from the actions themselves so the dispatcher
 * (`abilityActions.ts`) and the modules it delegates to (status, resources,
 * summon, transform, reflect) can share the shape without importing each other.
 */

import type { CombatEvent } from '../../types/CombatType';

export interface AbilityActionResult {
    /** `true` when the action did something and should be reported as fired. */
    fired: boolean;
    /** Units the action addressed, for the `ability_triggered` event. */
    targetIds: string[];
    /** Feedback the action produced (the trigger event itself is added by the caller). */
    events: CombatEvent[];
    /** `true` when the unit was replaced (a transform); its turn stops here. */
    replaced?: boolean;
    /** Status ids the action wrote, so the caller can fire `on_status_applied`. */
    appliedEffectIds?: string[];
    /** Ability ids the action asked to fire next (`execute_ability`). */
    manualAbilityIds?: string[];
}

/** The result of an action that could not be carried out. */
export function abilityNotFired(): AbilityActionResult {
    return { fired: false, targetIds: [], events: [] };
}
