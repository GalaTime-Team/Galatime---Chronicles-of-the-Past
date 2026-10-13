/**
 * End-of-combat loot rolls.
 *
 * When a fight ends in victory every defeated enemy's authored `loot:` table is
 * rolled. A weapon can raise the odds for the whole party (King's Longsword), so the
 * chance multiplier is read once from the surviving holders and applied to every
 * entry. The result is reported as `loot_gained` events; delivering the items to
 * the world inventory is the caller's job.
 */

import type { LootEntry } from '../../types/EntityDataType';
import type { CombatEvent, CombatRandom, CombatUnit } from '../../types/CombatType';
import { readChance } from '../../utils/combatUtils';

/** One defeated enemy together with the loot table it drops. */
export interface DefeatedLoot {
    unit: CombatUnit;
    loot: readonly LootEntry[];
}

/**
 * The best loot bonus among the surviving holders.
 *
 * Only living units contribute, so a broken-off weapon on a corpse does not help
 * (`1` when nobody carries a loot weapon).
 */
export function lootChanceMultiplier(units: readonly CombatUnit[]): number {
    let multiplier = 1;
    for (const unit of units) {
        if (unit.status !== 'alive') continue;
        const bonus = unit.weapon?.lootChanceMultiplier ?? 1;
        if (bonus > multiplier) multiplier = bonus;
    }
    return multiplier;
}

/** Rolls every entry of every defeated enemy's loot table. */
export function rollCombatLoot(
    defeated: readonly DefeatedLoot[],
    chanceMultiplier: number,
    random: CombatRandom,
): CombatEvent[] {
    const events: CombatEvent[] = [];

    for (const { unit, loot } of defeated) {
        for (const entry of loot) {
            const itemId = entry.item_id ?? entry.item;
            if (!itemId) continue;

            const chance = Math.min(1, Math.max(0, readChance(entry.chance, 1) * chanceMultiplier));
            if (chance < 1 && random() >= chance) continue;

            events.push({
                type: 'loot_gained',
                itemId,
                itemName: itemId,
                quantity: Math.max(1, Math.round(entry.quantity ?? 1)),
                sourceId: unit.id,
            });
        }
    }

    return events;
}
