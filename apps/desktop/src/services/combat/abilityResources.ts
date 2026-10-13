/**
 * Resource abilities: flat damage and healing.
 *
 * Both go through `changeResource`, so an ability's `deal_damage`/`heal` emits
 * the same `resource_changed` feedback a skill's effects do — clamp to the pool,
 * no negative health, no overheal.
 */

import type { AbilityDefinition } from '../../types/AbilityType';
import type { CombatUnit } from '../../types/CombatType';
import { readNumber, readVariance } from '../../utils/combatUtils';
import { abilityNotFired } from './abilityResult';
import type { AbilityActionResult } from './abilityResult';
import { changeResource } from './effectResolver';
import type { AbilityTriggerContext } from './abilityContext';

/** `parameters.damage` (optionally `parameters.damage_variance`). */
export function dealDamageAbility(
    targets: readonly CombatUnit[],
    definition: AbilityDefinition,
    context: AbilityTriggerContext,
): AbilityActionResult {
    const power = Math.max(0, readNumber(definition.action.parameters?.damage, 0));
    if (power <= 0) return abilityNotFired();

    const variance = readVariance(definition.action.parameters?.damage_variance) ?? [1, 1];
    const events: AbilityActionResult['events'] = [];
    const targetIds: string[] = [];

    for (const target of targets) {
        if (target.status !== 'alive') continue;

        const rolled = power * (variance[0] + context.random() * (variance[1] - variance[0]));
        const amount = Math.max(1, Math.round(rolled));
        const applied = changeResource(target, 'hp', -amount);
        if (applied.length === 0) continue;

        events.push(...applied);
        targetIds.push(target.id);
    }

    if (targetIds.length === 0) return abilityNotFired();
    return { fired: true, targetIds, events };
}

/** `parameters.heal`. */
export function healAbility(
    targets: readonly CombatUnit[],
    definition: AbilityDefinition,
    outputMultiplier = 1,
): AbilityActionResult {
    const amount = Math.max(0, Math.round(readNumber(definition.action.parameters?.heal, 0) * outputMultiplier));
    if (amount <= 0) return abilityNotFired();

    const events: AbilityActionResult['events'] = [];
    const targetIds: string[] = [];

    for (const target of targets) {
        if (target.status !== 'alive') continue;

        const applied = changeResource(target, 'hp', amount);
        if (applied.length === 0) continue;

        events.push(...applied);
        targetIds.push(target.id);
    }

    if (targetIds.length === 0) return abilityNotFired();
    return { fired: true, targetIds, events };
}
