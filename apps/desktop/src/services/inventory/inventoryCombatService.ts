/**
 * Combat item use.
 *
 * Owns the rules for using an item during a fight: which items are usable, what a
 * request must specify, and how the effects reach the units. It orchestrates the
 * pieces — `itemTargetResolver` picks the units, `itemEffectApplier` applies each
 * effect, `entityInventoryService` spends the item — so none of them has to know
 * about the others.
 *
 * Single Responsibility: this module only orchestrates one combat item use. It
 * does not decide what an item is (`itemService`) or what an effect does
 * (`itemEffectApplier`).
 */

import type {
    CombatElementIndex,
    CombatEvent,
    CombatRandom,
    CombatState,
    CombatUnit,
} from '../../types/CombatType';
import type {
    CombatItemUseRequest,
    CombatItemUseResult,
    InventoryErrorCode,
    ItemDefinition,
    ItemEffect,
    ItemTargetRule,
} from '../../types/InventoryType';
import { getQuantity, hasItem, removeItem } from './entityInventoryService';
import { applyItemEffect } from './itemEffectApplier';
import { getItemDefinition } from './itemService';
import { isSingleTargetRule, resolveItemTargets } from './itemTargetResolver';

/** Optional inputs the combat engine supplies when it drives an item use. */
export interface UseItemInCombatOptions {
    /** Element efficacy index of the fight; damage items scale with it when present. */
    elementIndex?: CombatElementIndex | null;
    /** Random source; defaults to `Math.random`. */
    random?: CombatRandom;
    /** Effect source id recorded on statuses; defaults to `'inventory'`. */
    sourceId?: string;
}

/** Checks if an item can be used in combat. */
export function canUseInCombat(item: ItemDefinition): boolean {
    return item.usable_in_combat;
}

/** Checks if an item can be used outside combat. */
export function canUseOutsideCombat(item: ItemDefinition): boolean {
    return item.usable_outside_combat;
}

/**
 * Uses an item from a unit's inventory during combat.
 *
 * Returns the result — the effects applied, the events they produced and the
 * remaining quantity. Does NOT consume the turn; that is the combat service's
 * responsibility.
 */
export function useItemInCombat(
    state: CombatState,
    actor: CombatUnit,
    inventory: Record<string, number>,
    request: CombatItemUseRequest,
    options: UseItemInCombatOptions = {},
): CombatItemUseResult {
    const item = getItemDefinition(request.item_id);

    if (!item) {
        return failure(request, actor, 'item_not_found', `Item "${request.item_id}" does not exist.`);
    }

    if (!canUseInCombat(item)) {
        return failure(
            request,
            actor,
            'item_not_usable_in_combat',
            `Item "${item.name}" cannot be used in combat.`,
            getQuantity(inventory, request.item_id),
        );
    }

    if (!hasItem(inventory, request.item_id)) {
        return failure(request, actor, 'insufficient_quantity', `No "${item.name}" in the inventory.`);
    }

    const explicitTarget = request.target_id
        ? state.units.find((unit) => unit.id === request.target_id) ?? null
        : null;

    const targetProblem = validateTargets(state, actor, item, explicitTarget);
    if (targetProblem) {
        return failure(
            request,
            actor,
            targetProblem.code,
            targetProblem.message,
            getQuantity(inventory, request.item_id),
        );
    }

    const events: CombatEvent[] = [];
    const effectsApplied: ItemEffect[] = [];

    for (const effect of item.effects) {
        const rule = effect.target ?? item.target;

        for (const target of resolveItemTargets(state, actor, rule, explicitTarget)) {
            events.push(...applyItemEffect({
                state,
                actor,
                target,
                effect,
                sourceId: options.sourceId ?? 'inventory',
                random: options.random ?? Math.random,
                elementIndex: options.elementIndex ?? null,
            }));
            effectsApplied.push(effect);
        }
    }

    if (effectsApplied.length === 0) {
        return failure(
            request,
            actor,
            'no_target_available',
            `"${item.name}" has no valid target right now.`,
            getQuantity(inventory, request.item_id),
        );
    }

    const spend = consumeItem(inventory, item);

    return {
        success: true,
        item_id: item.id,
        actor_id: actor.id,
        target_id: explicitTarget?.id ?? null,
        effects_applied: effectsApplied,
        events,
        quantity_remaining: spend.quantityRemaining,
        consumed: spend.consumed,
        error: null,
    };
}

/**
 * Checks the request against the item's single-target rules.
 *
 * Team-scoped and `self` effects need no target; a single-target rule needs the
 * caller to name a legal unit. Returns the failure to raise, or `null` when the
 * request is acceptable.
 */
function validateTargets(
    state: CombatState,
    actor: CombatUnit,
    item: ItemDefinition,
    explicitTarget: CombatUnit | null,
): { code: InventoryErrorCode; message: string } | null {
    const singleRules: ItemTargetRule[] = [
        ...new Set(item.effects.map((effect) => effect.target ?? item.target)),
    ].filter(isSingleTargetRule);

    if (singleRules.length === 0) return null;

    if (!explicitTarget) {
        return { code: 'target_required', message: `"${item.name}" requires a target.` };
    }

    const legal = singleRules.some(
        (rule) => resolveItemTargets(state, actor, rule, explicitTarget).length > 0,
    );

    return legal
        ? null
        : {
            code: 'invalid_target',
            message: `"${explicitTarget.name}" is not a valid target for "${item.name}".`,
        };
}

/** Removes one unit of the item when the definition is consumed on use. */
function consumeItem(
    inventory: Record<string, number>,
    item: ItemDefinition,
): { quantityRemaining: number; consumed: boolean } {
    const current = getQuantity(inventory, item.id);

    if (!item.consumed_on_use) return { quantityRemaining: current, consumed: false };

    const removal = removeItem(inventory, item.id, 1);
    return removal.ok
        ? { quantityRemaining: removal.data.next, consumed: true }
        : { quantityRemaining: current, consumed: false };
}

/** Builds a failed item-use result. */
function failure(
    request: CombatItemUseRequest,
    actor: CombatUnit,
    code: InventoryErrorCode,
    message: string,
    quantityRemaining = 0,
): CombatItemUseResult {
    return {
        success: false,
        item_id: request.item_id,
        actor_id: actor.id,
        target_id: request.target_id ?? null,
        effects_applied: [],
        events: [],
        quantity_remaining: quantityRemaining,
        consumed: false,
        error: { code, message },
    };
}

// ---------------------------------------------------------------------------
// Inventory action helpers
// ---------------------------------------------------------------------------

/** Gets all items usable in combat from a unit's inventory. */
export function getUsableCombatItems(
    inventory: Record<string, number>,
): Array<{ itemId: string; quantity: number; item: ItemDefinition }> {
    const items: Array<{ itemId: string; quantity: number; item: ItemDefinition }> = [];

    for (const [itemId, quantity] of Object.entries(inventory)) {
        if (quantity <= 0) continue;

        const item = getItemDefinition(itemId);
        if (item && canUseInCombat(item)) {
            items.push({ itemId, quantity, item });
        }
    }

    return items;
}

/** Checks if a unit has any usable combat items. */
export function hasUsableCombatItems(inventory: Record<string, number>): boolean {
    return getUsableCombatItems(inventory).length > 0;
}
