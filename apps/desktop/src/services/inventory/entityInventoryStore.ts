/**
 * Entity inventory store.
 *
 * The single accessor for "which items does entity X carry". One
 * {@link EntityInventoryState} is kept per entity id, in memory for the session.
 * The player's entry (`PLAYER_ENTITY_ID`) is the same map the dialogue layer
 * exposes as `WorldState.inventory`, so both views agree without duplicating a
 * quantity anywhere.
 *
 * Single Responsibility: this module owns the registry and nothing else. Item
 * rules live in `entityInventoryService`; combat use in `inventoryCombatService`.
 */

import type { EntityInventoryState, InventoryResult, InventorySlot } from '../../types/InventoryType';
import { addItem, removeItem, transferItem } from './entityInventoryService';

/** Entity id of the player, whose inventory is also `WorldState.inventory`. */
export const PLAYER_ENTITY_ID = 'player';

const inventories = new Map<string, EntityInventoryState>();

/** The inventory of an entity, created empty on first access. */
export function getInventory(entityId: string): EntityInventoryState {
    let inventory = inventories.get(entityId);

    if (!inventory) {
        inventory = {};
        inventories.set(entityId, inventory);
    }

    return inventory;
}

/** Registers (or replaces) an entity's inventory. */
export function setInventory(entityId: string, inventory: EntityInventoryState): void {
    inventories.set(entityId, inventory);
}

/** Adds items to an entity's inventory, enforcing the catalogue stack limit. */
export function addEntityItem(
    entityId: string,
    itemId: string,
    quantity: number = 1,
): InventoryResult<{ previous: InventorySlot; next: InventorySlot }> {
    return addItem(getInventory(entityId), itemId, quantity);
}

/** Removes items from an entity's inventory. */
export function removeEntityItem(
    entityId: string,
    itemId: string,
    quantity: number = 1,
): InventoryResult<{ previous: InventorySlot; next: InventorySlot }> {
    return removeItem(getInventory(entityId), itemId, quantity);
}

/** Moves items from one entity's inventory to another. */
export function moveEntityItem(
    fromEntityId: string,
    toEntityId: string,
    itemId: string,
    quantity: number = 1,
): InventoryResult<{
    fromPrevious: InventorySlot;
    fromNext: InventorySlot;
    toPrevious: InventorySlot;
    toNext: InventorySlot;
}> {
    return transferItem(getInventory(fromEntityId), getInventory(toEntityId), itemId, quantity);
}

/** Drops every registered inventory (tests, returning to the title screen). */
export function clearEntityInventoryStore(): void {
    inventories.clear();
}

/**
 * A snapshot of every registered inventory, shaped for `WorldState.entityInventories`.
 *
 * The maps are returned by reference; `createWorldState` copies them, so a
 * dialogue session never mutates the store in place.
 */
export function snapshotWorldInventories(): Record<string, EntityInventoryState> {
    return Object.fromEntries(inventories);
}

/**
 * Copies a world state's entity inventories into the store.
 *
 * Called when a dialogue ends, so items it granted or spent are visible to
 * combat. Each entry replaces the store's map for that entity; an entity the
 * state omits is left untouched.
 */
export function adoptWorldInventories(
    entityInventories: Record<string, EntityInventoryState> | undefined,
): void {
    if (!entityInventories) return;

    for (const [entityId, inventory] of Object.entries(entityInventories)) {
        inventories.set(entityId, { ...inventory });
    }
}
