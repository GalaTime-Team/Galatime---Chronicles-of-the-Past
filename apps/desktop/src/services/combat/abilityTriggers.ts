/**
 * Ability trigger selection and dispatch.
 *
 * The rest of the combat system talks to this module through four entry points:
 * {@link resolveAbilityEvent} (one event, one unit), {@link resolveUnitTurnStart}
 * and {@link resolveUnitTurnEnd} (the bookends of a unit's own turn), and
 * {@link resolveBattleStartAbilities} for the opening.
 *
 * A chain is bounded: an ability may wake another (`execute_ability`, a status
 * that lands, a transform), but only {@link MAX_ABILITY_CHAIN} levels deep, so a
 * pair of abilities that keep triggering each other cannot hang the fight.
 *
 * `before_damage` abilities never reach here — they are folded into the damage
 * chain by `abilityModifiers`.
 */

import type { AbilityTriggerEvent, CombatAbilityInstance } from '../../types/AbilityType';
import type { CombatEvent, CombatRandom, CombatState, CombatUnit } from '../../types/CombatType';
import { executeAbilityAction } from './abilityActions';
import { evaluateAbilityCondition } from './abilityConditions';
import { passiveTriggerContext } from './abilityContext';
import type { AbilityTriggerContext } from './abilityContext';

/** How deep an ability may wake another before the chain is cut. */
const MAX_ABILITY_CHAIN = 4;

/** Abilities of `unit` that match `event` and whose condition holds, in priority order. */
export function selectTriggeredAbilities(
    unit: CombatUnit,
    event: AbilityTriggerEvent,
    context: AbilityTriggerContext,
    onlyAbilityId?: string,
): CombatAbilityInstance[] {
    return unit.abilities.filter((ability) => {
        if (onlyAbilityId && ability.definition.id !== onlyAbilityId) return false;

        const { definition } = ability;
        if (definition.trigger.event !== event) return false;
        if (definition.trigger.once && ability.triggered) return false;
        if (ability.cooldownRemaining > 0) return false;
        return evaluateAbilityCondition(definition.condition, unit, context);
    });
}

export interface AbilityResolveOptions {
    /** Only this ability may fire (`execute_ability` names one). */
    onlyAbilityId?: string;
    /** Chain depth, so a triggered ability cannot recurse forever. */
    depth?: number;
}

/**
 * Fires every ability of `unit` that matches `event`.
 *
 * `once`/cooldown are marked after dispatch, and a transform ends the unit's
 * processing — the replacement carries its own abilities, so continuing would
 * act on a unit that is no longer on the field.
 *
 * Follow-ups are resolved here rather than inside the action dispatcher, because
 * the dispatcher cannot import this module without closing a cycle: a status that
 * landed wakes `on_status_applied`, an `execute_ability` fires its target as
 * `manual`, and a transform hands over to the new body's `on_transform`.
 */
export function resolveAbilityEvent(
    state: CombatState,
    unit: CombatUnit,
    event: AbilityTriggerEvent,
    context: AbilityTriggerContext,
    options: AbilityResolveOptions = {},
): CombatEvent[] {
    const depth = options.depth ?? 0;
    if (depth >= MAX_ABILITY_CHAIN) return [];
    if (event !== 'on_death' && unit.status !== 'alive') return [];

    // The field is always the authority on who is present, whatever the caller
    // passed, so a battle-scoped condition can never read a stale roster.
    const scope: AbilityTriggerContext = context.units === state.units
        ? context
        : { ...context, units: state.units };

    // Bank the occurrence first, so an `event_count >= n` condition sees this one.
    unit.eventCounts[event] = (unit.eventCounts[event] ?? 0) + 1;

    const events: CombatEvent[] = [];
    const nested: AbilityResolveOptions = { depth: depth + 1 };

    for (const ability of selectTriggeredAbilities(unit, event, scope, options.onlyAbilityId)) {
        const result = executeAbilityAction(state, ability, unit, scope);
        if (!result.fired) continue;

        events.push({
            type: 'ability_triggered',
            unitId: unit.id,
            abilityId: ability.definition.id,
            abilityName: ability.definition.name,
            targetIds: result.targetIds,
        });
        events.push(...result.events);

        if (ability.definition.trigger.once) ability.triggered = true;
        const cooldown = ability.definition.trigger.cooldown?.turns ?? 0;
        if (cooldown > 0) ability.cooldownRemaining = cooldown;

        for (let index = 0; index < (result.appliedEffectIds?.length ?? 0); index += 1) {
            events.push(...resolveAbilityEvent(state, unit, 'on_status_applied', scope, nested));
        }

        for (const manualId of result.manualAbilityIds ?? []) {
            events.push(...resolveAbilityEvent(state, unit, 'manual', scope, {
                ...nested,
                onlyAbilityId: manualId,
            }));
        }

        if (result.replaced) {
            const replacement = state.units.find((candidate) => candidate.id === unit.id);
            if (replacement) {
                events.push(...resolveAbilityEvent(state, replacement, 'on_transform', scope, nested));
            }
            break;
        }
    }

    return events;
}

/** Fires `battle_start` for every unit, once, as a fight opens. */
export function resolveBattleStartAbilities(state: CombatState, random: CombatRandom): CombatEvent[] {
    const context = passiveTriggerContext(random, state.units);
    const events: CombatEvent[] = [];

    for (const unit of state.units) {
        events.push(...resolveAbilityEvent(state, unit, 'battle_start', context));
    }

    return events;
}

/** Fires `turn_start` for the unit whose own turn is beginning. */
export function resolveUnitTurnStart(
    state: CombatState,
    unit: CombatUnit,
    random: CombatRandom,
): CombatEvent[] {
    return resolveAbilityEvent(state, unit, 'turn_start', passiveTriggerContext(random, state.units));
}

/**
 * Closes a unit's own turn.
 *
 * The counter is banked first, so a `turn_count >= 4` condition sees the turn
 * that is ending — "after four of its turns" fires on the fourth. Ability
 * cooldowns tick here too, so they are measured in the unit's own turns.
 */
export function resolveUnitTurnEnd(
    state: CombatState,
    unit: CombatUnit,
    random: CombatRandom,
): CombatEvent[] {
    unit.turnCount += 1;

    for (const ability of unit.abilities) {
        if (ability.cooldownRemaining > 0) ability.cooldownRemaining -= 1;
    }

    return resolveAbilityEvent(state, unit, 'turn_end', passiveTriggerContext(random, state.units));
}
