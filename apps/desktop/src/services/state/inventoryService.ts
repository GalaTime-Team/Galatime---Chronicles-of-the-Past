import type { InventoryEntry, WorldState } from '../../types/WorldStateType';
import { createDialogueError } from '../../utils/dialogueUtils';
import type { StateWriteResult } from './worldStateService';

/**
 * Item ownership.
 *
 * Counted items are numbers; key items are booleans, because "owns the ancient
 * key" is a fact rather than a quantity. Both shapes are supported so a
 * dialogue can test either with a plain comparison.
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

/**
 * Whether the player owns at least `quantity` of an item.
 *
 * Boolean entries are key items: they are either owned or not, so the
 * quantity is ignored.
 */
export function hasItem(
    state: WorldState,
    itemId: string,
    quantity: number = DEFAULT_ITEM_QUANTITY,
): boolean {
    const entry = readEntry(state, itemId);

    if (typeof entry === 'boolean') {
        return entry;
    }

    if (typeof entry === 'number') {
        return entry >= quantity;
    }

    return false;
}

/**
 * Gives the player an item.
 *
 * A boolean entry means the item is a key item, so owning it is a state and
 * the quantity is ignored.
 */
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

    if (typeof previous === 'boolean') {
        if (previous) {
            return { change: null, error: null };
        }

        state.inventory[itemId] = true;

        return {
            change: {
                kind: 'item_added',
                target: `inventory.${itemId}`,
                previous,
                next: true,
                source,
            },
            error: null,
        };
    }

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

    if (typeof previous === 'boolean') {
        if (!previous) {
            return { change: null, error: insufficientItemError(itemId, quantity, 0) };
        }

        state.inventory[itemId] = false;

        return {
            change: {
                kind: 'item_removed',
                target: `inventory.${itemId}`,
                previous,
                next: false,
                source,
            },
            error: null,
        };
    }

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
