/**
 * Transform action.
 *
 * Replaces the unit in place with another entity. The new form keeps the unit's
 * id, side, line and slot — the fight's turn queue still refers to the same unit
 * — and starts on the same fraction of its health.
 *
 * Effects and immunities are NOT carried over: the transformation is a new body,
 * and its abilities (including a transform back) start from scratch, so a soul
 * that flips forms gets a full cycle before it flips again.
 */

import type { AbilityDefinition } from '../../types/AbilityType';
import type { CombatState, CombatUnit } from '../../types/CombatType';
import { readString } from '../../utils/combatUtils';
import { readAbilityEntityTarget } from './abilityFactory';
import { abilityNotFired } from './abilityResult';
import type { AbilityActionResult } from './abilityResult';
import { getUnitBlueprint, instantiateUnit } from './unitBlueprint';

/** Parameters: `entity_id`, `entity_type` and an optional display `name`. */
export function transformUnit(
    state: CombatState,
    unit: CombatUnit,
    definition: AbilityDefinition,
): AbilityActionResult {
    const target = readAbilityEntityTarget(definition);
    if (!target) return abilityNotFired();

    const blueprint = getUnitBlueprint(target.entityId, target.entityType);
    if (!blueprint) return abilityNotFired();

    const hpRatio = unit.stats.maxHp > 0 ? unit.currentHp / unit.stats.maxHp : 1;
    const name = readString(definition.action.parameters?.name, '') || undefined;

    const replacement = instantiateUnit(blueprint, {
        id: unit.id,
        side: unit.side,
        line: unit.line,
        slot: unit.slot,
        isPlayerControlled: unit.isPlayerControlled,
        name,
        hpRatio,
    });

    const index = state.units.findIndex((candidate) => candidate.id === unit.id);
    if (index >= 0) state.units[index] = replacement;

    return {
        fired: true,
        targetIds: [replacement.id],
        replaced: true,
        events: [{
            type: 'unit_transformed',
            unitId: replacement.id,
            entityId: replacement.entityId,
            name: replacement.name,
        }],
    };
}
