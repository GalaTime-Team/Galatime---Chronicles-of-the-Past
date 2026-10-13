/**
 * Passive damage modifiers.
 *
 * A `before_damage` ability never resolves on its own: it is folded into the
 * damage a hit would deal. Because the fold mutates nothing — it reads the
 * defender's immunities and its passive abilities and returns a multiplier — the
 * HUD preview and the real hit can run the exact same code, which is what keeps
 * the number on the sprite and the number in the log in agreement.
 *
 * Stateful reactions (`set_immunity`, `reflect_damage`, …) are NOT folded here;
 * they run from {@link resolveAbilityEvent} once the hit has landed.
 */

import type { AttackModifier, CombatRandom, CombatUnit, DamageType } from '../../types/CombatType';
import { readNumber } from '../../utils/combatUtils';
import { evaluateAbilityCondition } from './abilityConditions';
import type { AbilityTriggerContext } from './abilityContext';

/** The incoming hit a passive ability is being folded against. */
export interface IncomingAttack {
    damageType: DamageType;
    elementId: string | null;
}

/**
 * Multiplies one unit's `modify_damage` abilities of a given event.
 *
 * The `event` selects the side: a defender's `before_damage` scales damage
 * *taken*, an attacker's `before_attack` scales damage *dealt* (Fragarach's caeli
 * edge). Reading both here is what lets a weapon passive and a defensive passive
 * compose into one multiplier the preview and the real hit share.
 */
function foldModifyDamage(
    unit: CombatUnit,
    event: 'before_damage' | 'before_attack',
    context: AbilityTriggerContext,
): number {
    let product = 1;

    for (const ability of unit.abilities) {
        const { definition } = ability;
        if (definition.trigger.event !== event) continue;
        if (definition.trigger.once && ability.triggered) continue;
        if (ability.cooldownRemaining > 0) continue;
        if (definition.action.type !== 'modify_damage') continue;
        if (!evaluateAbilityCondition(definition.condition, unit, context)) continue;

        product *= Math.max(0, readNumber(definition.action.parameters?.multiplier, 1));
    }

    return product;
}

/**
 * Folds the defender's immunities and the attacker's offensive passives into one
 * modifier.
 *
 * A damage channel the defender is immune to voids the hit outright. Otherwise
 * every matching `modify_damage` ability multiplies the damage: the attacker's
 * `before_attack` ones first, then the defender's `before_damage` ones, with the
 * weapon's exponential stack bonus (`powerMultiplier`) applied on top. A
 * multiplier is never allowed to turn damage negative. `units` is the field the
 * fold is happening on, so a battle-scoped condition sees the real roster.
 */
export function foldAttackModifiers(
    defender: CombatUnit,
    attack: IncomingAttack,
    random: CombatRandom,
    units: readonly CombatUnit[] = [],
    attacker: CombatUnit | null = null,
    powerMultiplier = 1,
): AttackModifier {
    if (defender.immunities.includes(attack.damageType)) {
        return { multiplier: 0, immune: true };
    }

    const baseContext = {
        damageType: attack.damageType,
        elementId: attack.elementId,
        damage: 0,
        units,
        random,
    };

    let multiplier = Number.isFinite(powerMultiplier) ? Math.max(0, powerMultiplier) : 1;

    if (attacker) {
        multiplier *= foldModifyDamage(attacker, 'before_attack', {
            source: attacker,
            target: defender,
            ...baseContext,
        });
    }

    multiplier *= foldModifyDamage(defender, 'before_damage', {
        source: null,
        target: defender,
        ...baseContext,
    });

    return { multiplier, immune: multiplier <= 0 };
}
