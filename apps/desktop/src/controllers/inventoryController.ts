/**
 * Inventory API the rest of the app talks to.
 *
 * A thin facade over the inventory services, matching the pattern used by
 * `dialogueController` and `combatController`. Every function returns a
 * result type rather than throwing, so callers branch on a stable error code
 * instead of catching exceptions.
 */

import type {
    EntityInventoryState,
    InventoryResult,
    ItemDefinition,
    CombatItemUseRequest,
    CombatItemUseResult,
} from '../types/InventoryType';
import type { CombatUnit, CombatState } from '../types/CombatType';
import {
    addItem,
    removeItem,
    hasItem,
    getQuantity,
    listItems,
    transferItem,
    clearInventory,
    createInventory,
    cloneInventory,
} from '../services/inventory/entityInventoryService';
import {
    getItemDefinition,
    isKnownItem,
    getAllItemIds,
    loadItemCatalogue,
    clearItemCache,
} from '../services/inventory/itemService';
import {
    canUseInCombat,
    canUseOutsideCombat,
    useItemInCombat,
    getUsableCombatItems,
    hasUsableCombatItems,
} from '../services/inventory/inventoryCombatService';
import {
    addEntityItem,
    getInventory,
    moveEntityItem,
    removeEntityItem,
    setInventory,
} from '../services/inventory/entityInventoryStore';

// ---------------------------------------------------------------------------
// Catalogue queries
// ---------------------------------------------------------------------------

/** Looks up one item definition by id. */
export function fetchItemDefinition(itemId: string): ItemDefinition | null {
    return getItemDefinition(itemId);
}

/** Whether an item exists in the catalogue. */
export function checkItemExists(itemId: string): boolean {
    return isKnownItem(itemId);
}

/** All item ids in the catalogue. */
export function fetchAllItemIds(): string[] {
    return getAllItemIds();
}

/** The full item catalogue. */
export function fetchItemCatalogue(): Map<string, ItemDefinition> {
    return loadItemCatalogue();
}

/** Clears the item cache (tests, development reloads). */
export function resetItemCache(): void {
    clearItemCache();
}

// ---------------------------------------------------------------------------
// Inventory operations
// ---------------------------------------------------------------------------

/** Creates a new empty inventory. */
export function createNewInventory(): EntityInventoryState {
    return createInventory();
}

/** Clones an inventory (deep copy). */
export function cloneExistingInventory(inventory: EntityInventoryState): EntityInventoryState {
    return cloneInventory(inventory);
}

/** Reads the quantity of an item in an inventory. */
export function fetchQuantity(inventory: EntityInventoryState, itemId: string): number {
    return getQuantity(inventory, itemId);
}

/** Checks if an inventory holds at least `quantity` of an item. */
export function checkHasItem(inventory: EntityInventoryState, itemId: string, quantity?: number): boolean {
    return hasItem(inventory, itemId, quantity);
}

/** Lists all items in an inventory with their quantities. */
export function fetchInventoryItems(inventory: EntityInventoryState): Array<{ itemId: string; quantity: number }> {
    return listItems(inventory);
}

/** Adds items to an inventory. */
export function addItemToInventory(
    inventory: EntityInventoryState,
    itemId: string,
    quantity?: number,
): InventoryResult<{ previous: number; next: number }> {
    return addItem(inventory, itemId, quantity);
}

/** Removes items from an inventory. */
export function removeItemFromInventory(
    inventory: EntityInventoryState,
    itemId: string,
    quantity?: number,
): InventoryResult<{ previous: number; next: number }> {
    return removeItem(inventory, itemId, quantity);
}

/** Transfers items between inventories. */
export function transferItemBetweenInventories(
    from: EntityInventoryState,
    to: EntityInventoryState,
    itemId: string,
    quantity?: number,
): InventoryResult<{ fromPrevious: number; fromNext: number; toPrevious: number; toNext: number }> {
    return transferItem(from, to, itemId, quantity);
}

/** Clears all items from an inventory. */
export function clearEntityInventory(inventory: EntityInventoryState): void {
    clearInventory(inventory);
}

// ---------------------------------------------------------------------------
// Combat integration
// ---------------------------------------------------------------------------

/** Checks if an item can be used in combat. */
export function checkCanUseInCombat(item: ItemDefinition): boolean {
    return canUseInCombat(item);
}

/** Checks if an item can be used outside combat. */
export function checkCanUseOutsideCombat(item: ItemDefinition): boolean {
    return canUseOutsideCombat(item);
}

/** Uses an item from a unit's inventory during combat. */
export function useItemInCombatFromInventory(
    state: CombatState,
    actor: CombatUnit,
    inventory: EntityInventoryState,
    request: CombatItemUseRequest,
): CombatItemUseResult {
    return useItemInCombat(state, actor, inventory, request);
}

/** Gets all items usable in combat from an inventory. */
export function fetchUsableCombatItems(
    inventory: EntityInventoryState,
): Array<{ itemId: string; quantity: number; item: ItemDefinition }> {
    return getUsableCombatItems(inventory);
}

/** Checks if an inventory has any usable combat items. */
export function checkHasUsableCombatItems(inventory: EntityInventoryState): boolean {
    return hasUsableCombatItems(inventory);
}

// ---------------------------------------------------------------------------
// Entity inventory store
// ---------------------------------------------------------------------------

/** The live inventory of an entity (created empty on first access). */
export function fetchEntityInventory(entityId: string): EntityInventoryState {
    return getInventory(entityId);
}

/** Registers (or replaces) an entity's inventory. */
export function setEntityInventory(entityId: string, inventory: EntityInventoryState): void {
    setInventory(entityId, inventory);
}

/** Adds items to an entity's inventory. */
export function addItemToEntity(
    entityId: string,
    itemId: string,
    quantity?: number,
): InventoryResult<{ previous: number; next: number }> {
    return addEntityItem(entityId, itemId, quantity);
}

/** Removes items from an entity's inventory. */
export function removeItemFromEntity(
    entityId: string,
    itemId: string,
    quantity?: number,
): InventoryResult<{ previous: number; next: number }> {
    return removeEntityItem(entityId, itemId, quantity);
}

/** Moves items from one entity's inventory to another. */
export function moveItemBetweenEntities(
    fromEntityId: string,
    toEntityId: string,
    itemId: string,
    quantity?: number,
): InventoryResult<{ fromPrevious: number; fromNext: number; toPrevious: number; toNext: number }> {
    return moveEntityItem(fromEntityId, toEntityId, itemId, quantity);
}
