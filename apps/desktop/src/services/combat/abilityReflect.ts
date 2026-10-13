/**
 * Reflect action.
 *
 * Throws part of an incoming hit back at the attacker. The reflected damage is a
 * fraction of what the hit dealt and lands on its own accuracy roll, so a
 * reflection is "part of the damage, with poor aim" rather than a copy.
 */

import type { AbilityDefinition } from '../../types/AbilityType';
import type { CombatUnit } from '../../types/CombatType';
import { clamp, readNumber } from '../../utils/combatUtils';
import type { AbilityTriggerContext } from './abilityContext';
import { abilityNotFired } from './abilityResult';
import type { AbilityActionResult } from './abilityResult';
import { rollHit } from './damageCalculator';

/** Parameters: `fraction` (0 … 1 of the hit) and `accuracy` (0 … 100). */
export function reflectDamage(
    reflector: CombatUnit,
    definition: AbilityDefinition,
    context: AbilityTriggerContext,
): AbilityActionResult {
    const attacker = context.source;
    if (!attacker || attacker.status !== 'alive' || context.damage <= 0) return abilityNotFired();

    const fraction = clamp(readNumber(definition.action.parameters?.fraction, 0.5), 0, 1);
    const accuracy = readNumber(definition.action.parameters?.accuracy, 100);

    const isHit = rollHit(context.random, accuracy);
    const amount = isHit ? Math.max(1, Math.round(context.damage * fraction)) : 0;
    if (amount > 0) attacker.currentHp = Math.max(0, attacker.currentHp - amount);

    return {
        fired: true,
        targetIds: [attacker.id],
        events: [{
            type: 'damage_reflected',
            sourceId: reflector.id,
            targetId: attacker.id,
            abilityId: definition.id,
            abilityName: definition.name,
            isHit,
            amount,
            targetHpAfter: attacker.currentHp,
        }],
    };
}
