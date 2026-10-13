/**
 * Entity inventory service.
 *
 * Each entity (character, mob) owns its own inventory. This service provides
 * the core operations for managing entity inventories: adding, removing,
 * querying, and transferring items.
 *
 * The player's inventory is stored in `WorldState.inventory` for backwards
 * compatibility, but conceptually it follows the same rules.
 *
 * Single Responsibility: this service only manages inventory state. It does
 * not know about combat, dialogue, or item effects — those are handled by
 * their respective services.
 */

import type {
    EntityInventoryState,
    InventoryResult,
    InventoryError,
    InventorySlot,
} from '../../types/InventoryType';
import { getItemDefinition, isKnownItem } from './itemService';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function inventoryError(
    code: InventoryError['code'],
    message: string,
    details?: Record<string, unknown>,
): InventoryError {
    return { code, message, details };
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/** Reads the quantity of an item in an entity's inventory. */
export function getQuantity(
    inventory: EntityInventoryState,
    itemId: string,
): InventorySlot {
    return inventory[itemId] ?? 0;
}

/** Checks if an entity has at least `quantity` of an item. */
export function hasItem(
    inventory: EntityInventoryState,
    itemId: string,
    quantity: number = 1,
): boolean {
    return getQuantity(inventory, itemId) >= quantity;
}

/** Lists all items in an entity's inventory with their quantities. */
export function listItems(
    inventory: EntityInventoryState,
): Array<{ itemId: string; quantity: InventorySlot }> {
    return Object.entries(inventory)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Adds items to an entity's inventory, enforcing the catalogue stack limit. */
export function addItem(
    inventory: EntityInventoryState,
    itemId: string,
    quantity: number = 1,
): InventoryResult<{ previous: InventorySlot; next: InventorySlot }> {
    const item = getItemDefinition(itemId);
    if (!item) {
        return {
            ok: false,
            error: inventoryError('item_not_found', `Item "${itemId}" does not exist in the catalogue.`),
        };
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return {
            ok: false,
            error: inventoryError('invalid_quantity', `Quantity must be a positive whole number, received ${quantity}.`),
        };
    }

    const previous = getQuantity(inventory, itemId);
    const next = previous + quantity;

    if (item.max_stack !== null && next > item.max_stack) {
        return {
            ok: false,
            error: inventoryError(
                'max_stack_exceeded',
                `Cannot hold ${next} of "${itemId}": the stack limit is ${item.max_stack}.`,
                { itemId, maxStack: item.max_stack, previous, requested: quantity },
            ),
        };
    }

    inventory[itemId] = next;

    return { ok: true, data: { previous, next } };
}

/** Removes items from an entity's inventory. */
export function removeItem(
    inventory: EntityInventoryState,
    itemId: string,
    quantity: number = 1,
): InventoryResult<{ previous: InventorySlot; next: InventorySlot }> {
    if (!isKnownItem(itemId)) {
        return {
            ok: false,
            error: inventoryError('item_not_found', `Item "${itemId}" does not exist in the catalogue.`),
        };
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return {
            ok: false,
            error: inventoryError('invalid_quantity', `Quantity must be a positive whole number, received ${quantity}.`),
        };
    }

    const previous = getQuantity(inventory, itemId);

    if (previous < quantity) {
        return {
            ok: false,
            error: inventoryError(
                'insufficient_quantity',
                `Cannot remove ${quantity} of "${itemId}": only ${previous} available.`,
            ),
        };
    }

    const next = previous - quantity;

    if (next === 0) {
        delete inventory[itemId];
    } else {
        inventory[itemId] = next;
    }

    return { ok: true, data: { previous, next } };
}

/** Transfers items from one entity's inventory to another. */
export function transferItem(
    from: EntityInventoryState,
    to: EntityInventoryState,
    itemId: string,
    quantity: number = 1,
): InventoryResult<{ fromPrevious: InventorySlot; fromNext: InventorySlot; toPrevious: InventorySlot; toNext: InventorySlot }> {
    const removal = removeItem(from, itemId, quantity);
    if (!removal.ok) return removal;

    const addition = addItem(to, itemId, quantity);
    if (!addition.ok) {
        from[itemId] = removal.data.previous;
        return addition;
    }

    return {
        ok: true,
        data: {
            fromPrevious: removal.data.previous,
            fromNext: removal.data.next,
            toPrevious: addition.data.previous,
            toNext: addition.data.next,
        },
    };
}

/** Clears all items from an entity's inventory. */
export function clearInventory(inventory: EntityInventoryState): void {
    for (const key of Object.keys(inventory)) {
        delete inventory[key];
    }
}

/** Creates a new empty inventory. */
export function createInventory(): EntityInventoryState {
    return {};
}

/** Clones an inventory (deep copy). */
export function cloneInventory(inventory: EntityInventoryState): EntityInventoryState {
    return { ...inventory };
}
