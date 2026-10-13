/**
 * Item effect application.
 *
 * Applies one item effect to one unit during a fight. Every branch reuses the
 * combat effect machinery (`effectResolver`) instead of re-implementing buffs,
 * statuses or resource swings, so an item and a skill that do the same thing can
 * never disagree.
 *
 * Single Responsibility: this module applies a single effect to a single unit.
 * Target resolution lives in `itemTargetResolver`; orchestration in
 * `inventoryCombatService`.
 */

import type { AttackEffect } from '../../types/AttackDataType';
import type {
    CombatElementIndex,
    CombatEvent,
    CombatRandom,
    CombatState,
    CombatUnit,
} from '../../types/CombatType';
import type {
    ItemDamageEffect,
    ItemDrainEffect,
    ItemEffect,
    ItemMysteryEffect,
    ItemResourceId,
    ItemRestoreEffect,
    ItemRestorePercentEffect,
    ItemReviveEffect,
    ItemStatusEffect,
} from '../../types/InventoryType';
import { elementMultiplier } from '../combat/damageCalculator';
import {
    applyEffectToUnit,
    changeResource,
    clearUnitEffects,
    effectiveStats,
    reviveUnit,
} from '../combat/effectResolver';

/** Everything one item effect needs in order to be applied to one unit. */
export interface ItemEffectContext {
    state: CombatState;
    actor: CombatUnit;
    target: CombatUnit;
    effect: ItemEffect;
    /** Action id recorded as the status effect's source (`inventory`). */
    sourceId: string;
    random: CombatRandom;
    /** Element efficacy index of the fight; `null` skips element scaling. */
    elementIndex: CombatElementIndex | null;
}

/** Stats a mystery item may raise or lower. */
const MYSTERY_STATS = [
    'physical_attack',
    'magical_attack',
    'physical_defense',
    'magical_defense',
    'speed',
] as const;

/** Applies one item effect to one unit, returning the combat feedback. */
export function applyItemEffect(context: ItemEffectContext): CombatEvent[] {
    const effect = context.effect;

    switch (effect.type) {
        case 'restore':
            return applyRestore(context.target, context.random, effect);
        case 'restore_percent':
            return applyRestorePercent(context.target, effect);
        case 'damage':
            return applyDamage(context, effect);
        case 'status':
            return applyStatus(context, effect);
        case 'revive':
            return applyRevive(context.target, effect);
        case 'cleanse':
            return clearUnitEffects(context.target);
        case 'drain':
            return applyDrain(context, effect);
        case 'mystery':
            return applyMystery(context, effect);
        default:
            return [];
    }
}

/** Restores a flat amount, rolling within `amount … amountMax` when a range is authored. */
function applyRestore(
    target: CombatUnit,
    random: CombatRandom,
    effect: ItemRestoreEffect,
): CombatEvent[] {
    const amount = effect.amountMax !== undefined
        ? Math.round(effect.amount + random() * (effect.amountMax - effect.amount))
        : effect.amount;

    return changeResource(target, effect.resource, Math.max(0, amount));
}

/** Restores a percentage of the pool's maximum. */
function applyRestorePercent(target: CombatUnit, effect: ItemRestorePercentEffect): CombatEvent[] {
    const maximum = maxResource(target, effect.resource);
    const amount = Math.max(1, Math.round((maximum * effect.amountPercent) / 100));
    return changeResource(target, effect.resource, amount);
}

/** Deals flat damage, scaled by the element matrix when the item authors an element. */
function applyDamage(context: ItemEffectContext, effect: ItemDamageEffect): CombatEvent[] {
    const multiplier = effect.element && context.elementIndex
        ? elementMultiplier(context.elementIndex, effect.element, context.target.elementIds)
        : 1;

    const amount = Math.max(0, Math.round(effect.amount * multiplier));
    if (amount <= 0) return [];

    return changeResource(context.target, 'hp', -amount);
}

/** Applies a buff/debuff/DoT status through the shared effect instance machinery. */
function applyStatus(context: ItemEffectContext, effect: ItemStatusEffect): CombatEvent[] {
    const applied = applyEffectToUnit(
        context.target,
        toAttackEffect(effect),
        context.sourceId,
        effect.element ?? null,
        context.random,
    );

    return applied ? [applied] : [];
}

/** Brings a fallen ally back at a percentage of their maximum HP. */
function applyRevive(target: CombatUnit, effect: ItemReviveEffect): CombatEvent[] {
    return reviveUnit(target, effect.amountPercent);
}

/** Damages a target and heals the user for a percentage of the damage. */
function applyDrain(context: ItemEffectContext, effect: ItemDrainEffect): CombatEvent[] {
    const events = changeResource(context.target, 'hp', -Math.max(0, Math.round(effect.amount)));

    const percent = effect.drainPercent ?? 100;
    const healed = Math.round((effect.amount * percent) / 100);
    if (healed > 0) events.push(...changeResource(context.actor, 'hp', healed));

    return events;
}

/** A deliberately unpredictable effect: a random stat buff or debuff for a few turns. */
function applyMystery(context: ItemEffectContext, mystery: ItemMysteryEffect): CombatEvent[] {
    const stat = MYSTERY_STATS[Math.floor(context.random() * MYSTERY_STATS.length)] ?? MYSTERY_STATS[0];
    const amount = 2 + Math.floor(context.random() * 4);
    const isBuff = context.random() < 0.5;

    const effect: ItemStatusEffect = {
        type: 'status',
        statusEffect: isBuff ? 'Mystery Blessing' : 'Mystery Curse',
        effectId: 'item_mystery',
        turns: mystery.turns ?? 3,
        buff: isBuff ? { [stat]: amount } : null,
        debuff: isBuff ? null : { [stat]: amount },
        element: null,
    };

    return applyStatus(context, effect);
}

/** Widens a status effect to the `AttackEffect` shape the instance factory reads. */
function toAttackEffect(effect: ItemStatusEffect): AttackEffect {
    return {
        effect_id: effect.effectId,
        status_effect: effect.statusEffect,
        element_id: effect.element ?? undefined,
        turns: effect.turns ?? undefined,
        damage: effect.damagePerTurn && effect.damagePerTurn > 0 ? effect.damagePerTurn : undefined,
        buff: effect.buff ?? undefined,
        debuff: effect.debuff ?? undefined,
    };
}

/** The maximum of a pool on a unit, with its live buffs folded in. */
function maxResource(unit: CombatUnit, resource: ItemResourceId): number {
    const stats = effectiveStats(unit);
    if (resource === 'hp') return stats.maxHp;
    if (resource === 'mana') return stats.maxMana;
    return stats.maxStamina;
}
