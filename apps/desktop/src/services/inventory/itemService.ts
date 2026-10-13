/**
 * Item catalogue service.
 *
 * Loads the single item catalogue (`data/items/items.yaml`) once and exposes the
 * runtime {@link ItemDefinition}s. Read-only: it never mutates state, only
 * answers what an item is and what it does.
 *
 * The translation from authored YAML lives in `itemNormalizer`, the authoring
 * checks in `itemValidator`.
 */

import * as yaml from 'js-yaml';
import type { ItemDefinition } from '../../types/InventoryType';
import { asRecord } from '../../utils/combatUtils';
import { normalizeItem } from './itemNormalizer';

/** The catalogue file's root shape: a version stamp and the item list. */
interface ItemCatalogueFile {
    version?: number;
    items?: unknown[];
}

// Vite's `import.meta.glob` only accepts a literal pattern, so the path is
// written out here. `?raw` + js-yaml is the pattern the other catalogue loaders
// use; `eager` + `import: 'default'` keeps the catalogue readable synchronously,
// which the inventory services rely on.
const catalogueModules = import.meta.glob(
    '../../data/items/items.yaml',
    { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

let itemCache: Map<string, ItemDefinition> | null = null;

/** Reads the authored `items:` list out of every catalogue file. */
function readCatalogueEntries(): unknown[] {
    const entries: unknown[] = [];

    for (const [path, source] of Object.entries(catalogueModules)) {
        try {
            const parsed = asRecord(yaml.load(source)) as ItemCatalogueFile | null;
            if (parsed && Array.isArray(parsed.items)) entries.push(...parsed.items);
        } catch (error) {
            console.error(`Failed to parse item catalogue "${path}":`, error);
        }
    }

    return entries;
}

/**
 * Loads and caches every item definition, keyed by id.
 *
 * Cached after the first call; use `clearItemCache` in tests or on hot-reload.
 */
export function loadItemCatalogue(): Map<string, ItemDefinition> {
    if (itemCache) return itemCache;

    const items = new Map<string, ItemDefinition>();
    for (const entry of readCatalogueEntries()) {
        const item = normalizeItem(entry);
        if (item) items.set(item.id, item);
    }

    itemCache = items;
    return items;
}

/** Clears the item cache (tests, development reloads). */
export function clearItemCache(): void {
    itemCache = null;
}

/** Looks up one item definition by id. */
export function getItemDefinition(itemId: string): ItemDefinition | null {
    return loadItemCatalogue().get(itemId) ?? null;
}

/** Whether an item exists in the catalogue. */
export function isKnownItem(itemId: string): boolean {
    return loadItemCatalogue().has(itemId);
}

/** All item ids in the catalogue. */
export function getAllItemIds(): string[] {
    return [...loadItemCatalogue().keys()];
}
