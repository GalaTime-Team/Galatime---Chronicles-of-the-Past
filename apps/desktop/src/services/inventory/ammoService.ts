/**
 * Weapon ammunition against the inventory.
 *
 * A weapon that takes ammo names what feeds it in the catalogue's vocabulary
 * (`types/WeaponType.ts` → `WeaponAmmo`): either a specific item id (`item:
 * arrow`) or an item *type* (`item_type: arrow`), which any item of that type
 * satisfies — a bow does not care whether the quiver holds plain or iron
 * arrows.
 *
 * Counting and consuming live against an inventory record (`item id →
 * quantity`): the combat session keeps a private copy per unit, so shots spent
 * during a fight leave the holder's quiver when the fight is flushed back to
 * the store.
 */

import type { ItemDefinition } from '../../types/InventoryType';
import type { WeaponAmmo } from '../../types/WeaponType';
import { getItemDefinition } from './itemService';

/**
 * Whether one catalogue item qualifies as this weapon's ammo.
 *
 * A pinned `item` wins: the weapon wants that exact id. Otherwise a declared
 * `item_type` accepts every item that carries it.
 */
export function itemIsAmmo(item: ItemDefinition | null, ammo: WeaponAmmo): boolean {
    if (!item) return false;
    if (ammo.item) return item.id === ammo.item;
    if (ammo.item_type) return item.item_type === ammo.item_type;
    return false;
}

/** Total units of ammunition an inventory can feed the weapon. */
export function countAmmoUnits(inventory: Record<string, number>, ammo: WeaponAmmo): number {
    let total = 0;
    for (const [itemId, quantity] of Object.entries(inventory)) {
        if (quantity <= 0) continue;
        if (itemIsAmmo(getItemDefinition(itemId), ammo)) total += quantity;
    }
    return total;
}

/**
 * Removes one unit of ammunition from the inventory and returns the item id
 * that was spent, or `null` when nothing matched.
 *
 * The id is pinned first (`ammo.item`), so a fussy weapon always spends its own
 * kind; type-based ammo spends whichever matching item comes first.
 */
export function consumeAmmoUnit(
    inventory: Record<string, number>,
    ammo: WeaponAmmo,
): string | null {
    const ids = Object.keys(inventory);

    if (ammo.item) {
        if ((inventory[ammo.item] ?? 0) > 0) {
            inventory[ammo.item] -= 1;
            return ammo.item;
        }
        return null;
    }

    for (const itemId of ids) {
        if ((inventory[itemId] ?? 0) <= 0) continue;
        if (itemIsAmmo(getItemDefinition(itemId), ammo)) {
            inventory[itemId] -= 1;
            return itemId;
        }
    }
    return null;
}
