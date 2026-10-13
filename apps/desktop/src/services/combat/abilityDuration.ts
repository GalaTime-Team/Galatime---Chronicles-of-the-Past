/**
 * Lifetime of an effect an ability applies.
 *
 * Shared by every action that writes a status (`add_status`, `modify_stat`,
 * `prevent_action`), so a duration authored under `action.duration` or at the
 * ability's top level means the same thing everywhere.
 */

import type { AbilityDefinition } from '../../types/AbilityType';

/**
 * Turns the effect lasts, or `null` for "until it is cleared".
 *
 * `instant`, `until_death`, `until_battle_end` and `permanent` all read as
 * `null`: they outlive the unit that owns them, and death clears its effects
 * anyway. `action.duration` wins over the ability's own `duration`.
 */
export function abilityEffectTurns(definition: AbilityDefinition): number | null {
    const duration = definition.action.duration ?? definition.duration;
    if (duration?.type !== 'turns') return null;

    const value = Math.round(duration.value ?? 0);
    return value > 0 ? value : 1;
}
