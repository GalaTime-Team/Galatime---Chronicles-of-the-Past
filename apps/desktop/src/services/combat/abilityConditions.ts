/**
 * Ability condition evaluation.
 *
 * A condition is a small tree (`all` / `any` / `not`) whose leaves compare a
 * combatant against what is happening to it: the channel and element of the
 * incoming hit, a stat, a live status, how many times the trigger has fired, how
 * many units a side still has, a flag, and a flat probability.
 *
 * Evaluation is pure — it reads units and the context and mutates nothing — so
 * the damage fold can run it for a HUD preview as safely as for a real hit.
 */

import type { AbilityComparisonOperator, AbilityCondition } from '../../types/AbilityType';
import type { CombatUnit, DamageType } from '../../types/CombatType';
import { resolveStatTarget } from './abilityTargets';
import type { AbilityTriggerContext } from './abilityContext';
import { hasStatusEffect, readUnitStat } from './effectResolver';

function compare(operator: AbilityComparisonOperator, left: number, right: number): boolean {
    switch (operator) {
        case 'ne':
            return left !== right;
        case 'gt':
            return left > right;
        case 'gte':
            return left >= right;
        case 'lt':
            return left < right;
        case 'lte':
            return left <= right;
        case 'eq':
        default:
            return left === right;
    }
}

/** `any` matches everything; a named channel must match exactly. */
function matchesDamageType(expected: string | undefined, actual: DamageType | null): boolean {
    if (!expected || expected === 'any') return true;
    if (!actual) return false;
    return expected === actual;
}

/** Applies an operator to an already-resolved match; `eq`/`ne` are the usual pair. */
function checkMatch(operator: AbilityComparisonOperator | undefined, matched: boolean): boolean {
    return (operator ?? 'eq') === 'ne' ? !matched : matched;
}

/**
 * Whether a condition holds for `unit` in `context`.
 *
 * A missing condition is always true — an ability that authors no condition
 * fires whenever its trigger does.
 */
export function evaluateAbilityCondition(
    condition: AbilityCondition | undefined,
    unit: CombatUnit,
    context: AbilityTriggerContext,
): boolean {
    if (!condition) return true;

    if (condition.chance !== undefined && context.random() >= condition.chance) return false;

    if (condition.all && !condition.all.every((entry) => evaluateAbilityCondition(entry, unit, context))) {
        return false;
    }

    if (condition.any && !condition.any.some((entry) => evaluateAbilityCondition(entry, unit, context))) {
        return false;
    }

    if (condition.not && evaluateAbilityCondition(condition.not, unit, context)) return false;

    if (condition.damage) {
        const matched = matchesDamageType(condition.damage.type, context.damageType);
        if (!checkMatch(condition.damage.operator, matched)) return false;
    }

    if (condition.attack) {
        const expected = condition.attack.type;
        const matched = !expected || expected === 'any' ? true : context.damageType === expected;
        if (!checkMatch(condition.attack.operator, matched)) return false;
    }

    if (condition.element) {
        const matched = context.elementId !== null && context.elementId === condition.element.id;
        if (!checkMatch(condition.element.operator, matched)) return false;
    }

    if (condition.turn_count) {
        const operator = condition.turn_count.operator ?? 'gte';
        if (!compare(operator, unit.turnCount, condition.turn_count.value ?? 0)) return false;
    }

    if (condition.event_count) {
        const event = condition.event_count.event ?? '';
        const operator = condition.event_count.operator ?? 'gte';
        if (!compare(operator, unit.eventCounts[event] ?? 0, condition.event_count.value ?? 0)) return false;
    }

    if (condition.stat) {
        const target = resolveStatTarget(condition.stat.target, unit, context);
        const value = target ? readUnitStat(target, condition.stat.name ?? '') : null;
        if (value === null) return false;

        const operator = condition.stat.operator ?? 'eq';
        if (!compare(operator, value, condition.stat.value ?? 0)) return false;
    }

    if (condition.status) {
        const target = resolveStatTarget(condition.status.target, unit, context);
        if (!target) return false;

        const present = hasStatusEffect(target, condition.status.id ?? '');
        if (present !== (condition.status.present ?? true)) return false;
    }

    if (condition.target_count) {
        const side = condition.target_count.side ?? 'all';
        const count = context.units.filter((candidate) => {
            if (candidate.status !== 'alive') return false;
            if (side === 'all') return true;
            return side === 'allies' ? candidate.side === unit.side : candidate.side !== unit.side;
        }).length;

        const operator = condition.target_count.operator ?? 'gte';
        if (!compare(operator, count, condition.target_count.value ?? 0)) return false;
    }

    if (condition.flag) {
        const actual = unit.flags[condition.flag.id ?? ''];
        if (JSON.stringify(actual) !== JSON.stringify(condition.flag.value)) return false;
    }

    return true;
}
