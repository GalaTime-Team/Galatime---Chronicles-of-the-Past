/**
 * Ability action dispatch.
 *
 * Executes ONE ability's action and reports what it changed. The larger families
 * live in their own modules — `abilityStatus` (statuses), `abilityResources`
 * (flat damage/heal), `abilitySummon`, `abilityTransform`, `abilityReflect` — so
 * this file is the switch plus the three actions too small to own a module
 * (immunity, stat change, flag).
 *
 * `modify_damage` never resolves here: it is folded into the damage chain by
 * `abilityModifiers.foldAttackModifiers`, because it has to be visible to the HUD
 * preview as well as to the real hit. `modify_durability` is part of the
 * reference schema but is a deliberate no-op — the game has no durability.
 */

import type { AbilityDefinition, CombatAbilityInstance } from '../../types/AbilityType';
import type { CombatEffectInstance, CombatState, CombatUnit } from '../../types/CombatType';
import { readStatDelta, readString, asRecord, readNumber } from '../../utils/combatUtils';
import type { AbilityTriggerContext } from './abilityContext';
import { abilityEffectTurns } from './abilityDuration';
import { effectiveStats, scaleStatDelta } from './effectResolver';
import { reflectDamage } from './abilityReflect';
import { dealDamageAbility, healAbility } from './abilityResources';
import { abilityNotFired } from './abilityResult';
import type { AbilityActionResult } from './abilityResult';
import {
    addStatusAbility,
    dispelAbility,
    preventActionAbility,
    removeStatusAbility,
} from './abilityStatus';
import { summonUnits } from './abilitySummon';
import { resolveAbilityTargets, resolveScopeUnit } from './abilityTargets';
import { transformUnit } from './abilityTransform';
import { amplifyBestStatMultipliers, effectPowerMultiplier } from './weaponEffects';

/** Parameters: `damage_type` (`physical` or `magical`). */
function applyImmunityAbility(
    targets: readonly CombatUnit[],
    definition: AbilityDefinition,
): AbilityActionResult {
    const damageType = readString(definition.action.parameters?.damage_type, '');
    if (damageType !== 'physical' && damageType !== 'magical') return abilityNotFired();

    const targetIds: string[] = [];
    for (const target of targets) {
        if (!target.immunities.includes(damageType)) target.immunities.push(damageType);
        targetIds.push(target.id);
    }

    if (targetIds.length === 0) return abilityNotFired();
    return { fired: true, targetIds, events: [] };
}

/**
 * Parameters: `stat_changes` (authored stat deltas) and/or `amplify_best`.
 *
 * The delta becomes a normal {@link CombatEffectInstance}, so `effectiveStats`
 * folds it in exactly like a skill's `buff`/`debuff` — a negative value reads as
 * a debuff. `amplify_best` (Ruyi Jingu Bang) instead ranks the target's own
 * attributes and scales the ones above their average, so the buff follows
 * whoever is holding the weapon.
 */
function applyStatAbility(
    targets: readonly CombatUnit[],
    definition: AbilityDefinition,
    outputMultiplier = 1,
): AbilityActionResult {
    const amplify = asRecord(definition.action.parameters?.amplify_best);
    const delta = scaleStatDelta(
        readStatDelta(definition.action.parameters?.stat_changes)
            ?? readStatDelta(definition.action.parameters?.buff),
        outputMultiplier,
    );
    if (!amplify && !delta) return abilityNotFired();

    const turns = abilityEffectTurns(definition);
    const count = readNumber(amplify?.count, 3);
    const multiplier = readNumber(amplify?.multiplier, 1.15);

    const targetIds: string[] = [];
    const events: AbilityActionResult['events'] = [];

    for (const target of targets) {
        const statMultipliers = amplify
            ? amplifyBestStatMultipliers(effectiveStats(target), count, multiplier)
            : null;
        if (!delta && !statMultipliers) continue;

        const effect: CombatEffectInstance = {
            effectId: definition.id,
            sourceId: definition.id,
            statusEffect: null,
            elementId: null,
            turns,
            applyTo: null,
            buff: delta,
            debuff: null,
            statMultipliers,
            polarity: 'positive',
            regenPerTurn: null,
            selfUpkeep: null,
            deferredCost: null,
            immunities: null,
            preventActions: null,
            preventSkills: false,
            untargetable: false,
            healBlock: false,
            counter: false,
            turnOffset: 0,
            cooldownTick: 0,
            move: null,
            rewind: null,
            damagePerTurn: 0,
            stacks: 1,
            canStack: false,
        };

        const index = target.effects.findIndex((active) => active.effectId === effect.effectId);
        if (index >= 0) target.effects[index] = effect;
        else target.effects.push(effect);

        targetIds.push(target.id);
        events.push({
            type: 'effect_applied',
            unitId: target.id,
            effectId: effect.effectId,
            statusEffect: null,
            turns,
        });
    }

    if (targetIds.length === 0) return abilityNotFired();
    return { fired: true, targetIds, events, appliedEffectIds: [definition.id] };
}

/** Parameters: `flag_id` and `value` — read back later by a `flag` condition. */
function setFlagAbility(unit: CombatUnit, definition: AbilityDefinition): AbilityActionResult {
    const flagId = readString(definition.action.parameters?.flag_id, '');
    if (!flagId) return abilityNotFired();

    unit.flags[flagId] = definition.action.parameters?.value ?? true;
    return { fired: true, targetIds: [unit.id], events: [] };
}

/**
 * Parameters: `ability_id`.
 *
 * The dispatcher cannot fire another ability itself (it would import the trigger
 * module and close a cycle), so it asks the caller to — the returned ids are
 * resolved as `manual` triggers by `abilityTriggers`.
 */
function executeAbilityById(unit: CombatUnit, definition: AbilityDefinition): AbilityActionResult {
    const abilityId = readString(definition.action.parameters?.ability_id, '');
    if (!abilityId) return abilityNotFired();

    const known = unit.abilities.some((ability) => ability.definition.id === abilityId);
    if (!known) return abilityNotFired();

    return { fired: true, targetIds: [unit.id], events: [], manualAbilityIds: [abilityId] };
}

/**
 * Executes one ability's action and reports what it changed.
 *
 * The units it addresses come from `action.target`; when that is absent the
 * trigger's `scope` decides, so `after_damage` + `scope: self` defaults to the
 * owner while `+ action.target: attacker` reaches back at whoever hit it.
 */
export function executeAbilityAction(
    state: CombatState,
    ability: CombatAbilityInstance,
    unit: CombatUnit,
    context: AbilityTriggerContext,
): AbilityActionResult {
    const { definition } = ability;
    const { action } = definition;

    if (action.chance !== undefined && context.random() >= action.chance) return abilityNotFired();

    const scopeUnit = resolveScopeUnit(definition.trigger.scope, unit, context);
    const targets = action.target
        ? resolveAbilityTargets(action.target, unit, context)
        : (scopeUnit ? [scopeUnit] : [unit]);

    switch (action.type) {
        case 'add_status':
            return addStatusAbility(targets, definition, effectPowerMultiplier(unit));
        case 'prevent_action':
            return preventActionAbility(targets, definition);
        case 'remove_status':
            return removeStatusAbility(targets, definition);
        case 'dispel':
            return dispelAbility(targets);
        case 'deal_damage':
            return dealDamageAbility(targets, definition, context);
        case 'heal':
            return healAbility(targets, definition, effectPowerMultiplier(unit));
        case 'set_immunity':
            return applyImmunityAbility(targets, definition);
        case 'modify_stat':
            return applyStatAbility(targets, definition, effectPowerMultiplier(unit));
        case 'set_flag':
            return setFlagAbility(unit, definition);
        case 'execute_ability':
            return executeAbilityById(unit, definition);
        case 'summon':
            return summonUnits(state, unit, definition);
        case 'transform':
            return transformUnit(state, unit, definition);
        case 'reflect_damage':
            return reflectDamage(unit, definition, context);
        case 'modify_damage':
        case 'modify_durability':
        default:
            return abilityNotFired();
    }
}
