import type { InventoryEntry, WorldState } from '../../types/WorldStateType';
import { createDialogueError } from '../../utils/dialogueUtils';
import type { StateWriteResult } from './worldStateService';

/**
 * Item ownership.
 *
 * An entry is always a count: one herb is `1`, two are `2`, none is absent or
 * `0`. "Owns the ancient key" is still a question about a quantity, so the
 * inventory never has to hold a boolean — which is also why `add_item` and
 * `remove_item` can always add and subtract. A dialogue asks about it in
 * whichever way reads best, `inventory.ancient_key >= 1` or `= true`.
 */

/** Quantity assumed when an effect omits one. */
export const DEFAULT_ITEM_QUANTITY = 1;

/** Reads an inventory entry, normalising "absent" to `null`. */
function readEntry(state: WorldState, itemId: string): InventoryEntry | null {
    return state.inventory[itemId] ?? null;
}

/** A quantity must be a positive whole number to be meaningful. */
function isValidQuantity(quantity: number): boolean {
    return Number.isInteger(quantity) && quantity > 0;
}

function invalidQuantityError(itemId: string, quantity: number) {
    return createDialogueError(
        'invalid_effect',
        `Quantity for item "${itemId}" must be a positive whole number.`,
        { item_id: itemId, quantity },
    );
}

function insufficientItemError(itemId: string, requested: number, owned: number) {
    return createDialogueError(
        'insufficient_item',
        `Player does not own ${requested} of "${itemId}".`,
        { item_id: itemId, requested, owned },
    );
}

/** Whether the player owns at least `quantity` of an item. */
export function hasItem(
    state: WorldState,
    itemId: string,
    quantity: number = DEFAULT_ITEM_QUANTITY,
): boolean {
    return (readEntry(state, itemId) ?? 0) >= quantity;
}

/** Gives the player an item. */
export function addItem(
    state: WorldState,
    itemId: string,
    quantity: number = DEFAULT_ITEM_QUANTITY,
    source = 'add_item',
): StateWriteResult {
    if (!isValidQuantity(quantity)) {
        return { change: null, error: invalidQuantityError(itemId, quantity) };
    }

    const previous = readEntry(state, itemId);
    const next = (previous ?? 0) + quantity;

    state.inventory[itemId] = next;

    return {
        change: {
            kind: 'item_added',
            target: `inventory.${itemId}`,
            previous,
            next,
            delta: quantity,
            source,
        },
        error: null,
    };
}

/**
 * Takes an item from the player.
 *
 * Refuses to leave the inventory in an inconsistent state: removing more than
 * the player owns fails with `insufficient_item` instead of going negative.
 */
export function removeItem(
    state: WorldState,
    itemId: string,
    quantity: number = DEFAULT_ITEM_QUANTITY,
    source = 'remove_item',
): StateWriteResult {
    if (!isValidQuantity(quantity)) {
        return { change: null, error: invalidQuantityError(itemId, quantity) };
    }

    const previous = readEntry(state, itemId);
    const owned = previous ?? 0;

    if (owned < quantity) {
        return { change: null, error: insufficientItemError(itemId, quantity, owned) };
    }

    const next = owned - quantity;
    state.inventory[itemId] = next;

    return {
        change: {
            kind: 'item_removed',
            target: `inventory.${itemId}`,
            previous,
            next,
            delta: -quantity,
            source,
        },
        error: null,
    };
}