/**
 * What an ability is being evaluated against.
 *
 * Kept in its own module because both the condition evaluator and the target
 * resolver read it — putting it in either one would make the other import it and
 * close a dependency cycle.
 */

import type { CombatRandom, CombatUnit, DamageType } from '../../types/CombatType';

export interface AbilityTriggerContext {
    /** The unit that caused the trigger (the attacker/actor), when there is one. */
    source: CombatUnit | null;
    /** The unit the event happened to (the defender), when there is one. */
    target: CombatUnit | null;
    /** Damage channel of the incoming hit, when there is one. */
    damageType: DamageType | null;
    /** Element of the incoming hit, when there is one. */
    elementId: string | null;
    /** Damage the incoming hit dealt, before any reflection. */
    damage: number;
    /** Every combatant on the field, for battle-scoped conditions and targets. */
    units: readonly CombatUnit[];
    /** Injectable randomness for `chance` conditions. */
    random: CombatRandom;
}

/**
 * A context for triggers that carry no hit: turn starts/ends, deaths and the
 * opening of the fight. `units` is still supplied, because a battle-scoped
 * condition (`target_count`) can be asked about any of them.
 */
export function passiveTriggerContext(
    random: CombatRandom,
    units: readonly CombatUnit[] = [],
): AbilityTriggerContext {
    return { source: null, target: null, damageType: null, elementId: null, damage: 0, units, random };
}
