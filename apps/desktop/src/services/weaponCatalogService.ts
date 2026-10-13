/**
 * Weapon catalogue service.
 *
 * Loads `data/combat/weapons/weapons.yaml` once (glob + cache, mirroring
 * `attackContentService`) and resolves a weapon *definition* from either a
 * catalogue id or an inline block. Type defaults (`weapon_types`) are folded
 * **under** the authored fields, so a weapon inherits its family's reach and
 * accuracy without repeating them.
 *
 * The catalogue is the only place a weapon is *described*; the combat engine
 * projects a definition onto runtime shapes (`WeaponActionSpec` on the action,
 * `WeaponRuntimeState` on the unit) elsewhere.
 */

import * as yaml from 'js-yaml';
import type {
    WeaponCatalog,
    WeaponDefinition,
    WeaponReference,
    WeaponTypeDefaults,
} from '../types/WeaponType';

// Vite's `import.meta.glob` only accepts a literal pattern (a constant is
// rejected at transform time), so the path is written out here like the other
// catalogue loaders (`attackContentService`, `entityService`).

type RawYamlLoader = Record<string, () => Promise<{ default: string }>>;

let weaponsGlob: RawYamlLoader | null = null;
let catalogCache: WeaponCatalog | null = null;
let byIdCache: Map<string, WeaponDefinition> | null = null;

async function initializeGlob(): Promise<void> {
    if (weaponsGlob === null) {
        weaponsGlob = import.meta.glob(
            '../data/combat/weapons/*.yaml',
            { query: '?raw' },
        ) as RawYamlLoader;
    }
}

/** Loads and caches every `weapons.yaml` file merged into one catalogue. */
async function loadCatalog(): Promise<WeaponCatalog> {
    if (catalogCache) return catalogCache;

    await initializeGlob();
    const merged: WeaponCatalog = { weapon_types: {}, weapons: [] };

    for (const [path, loader] of Object.entries(weaponsGlob ?? {})) {
        try {
            const module = await loader();
            const parsed = yaml.load(module.default) as WeaponCatalog | null;
            if (!parsed) continue;

            if (parsed.weapon_types) {
                merged.weapon_types = { ...merged.weapon_types, ...parsed.weapon_types };
            }
            if (Array.isArray(parsed.weapons)) {
                merged.weapons!.push(...parsed.weapons);
            }
        } catch (error) {
            console.error(`Failed to load weapon catalogue "${path}":`, error);
        }
    }

    catalogCache = merged;
    return catalogCache;
}

/** Indexes the catalogue by id, last definition winning. */
async function weaponIndex(): Promise<Map<string, WeaponDefinition>> {
    if (byIdCache) return byIdCache;

    const catalog = await loadCatalog();
    const index = new Map<string, WeaponDefinition>();
    for (const weapon of catalog.weapons ?? []) {
        if (weapon && typeof weapon.id === 'string') index.set(weapon.id, weapon);
    }
    byIdCache = index;
    return index;
}

/** Folds a weapon family's defaults under the authored fields. */
function withTypeDefaults(
    weapon: WeaponDefinition,
    types: Record<string, WeaponTypeDefaults> | undefined,
): WeaponDefinition {
    const defaults = weapon.type ? types?.[weapon.type] : undefined;
    if (!defaults) return weapon;

    // Authored fields always win; the type only fills what the weapon omits.
    const merged: WeaponDefinition = { ...defaults, ...weapon };
    if (weapon.accuracy_by_range ?? defaults.accuracy_by_range) {
        merged.accuracy_by_range = weapon.accuracy_by_range ?? defaults.accuracy_by_range;
    }
    return merged;
}

/** Resolves a catalogue weapon by id, or `null` when it is unknown. */
export async function resolveWeapon(id: string): Promise<WeaponDefinition | null> {
    const index = await weaponIndex();
    const weapon = index.get(id);
    if (!weapon) return null;

    const catalog = await loadCatalog();
    return withTypeDefaults(weapon, catalog.weapon_types);
}

/**
 * Resolves an entity's `weapon:` value.
 *
 * A string is a catalogue id; an object is used as authored (still receiving
 * its type defaults, so an inline `type: sword` block gets sword reach).
 */
export async function resolveWeaponReference(
    reference: WeaponReference,
): Promise<WeaponDefinition | null> {
    if (typeof reference === 'string') return resolveWeapon(reference);

    const catalog = await loadCatalog();
    return withTypeDefaults(reference, catalog.weapon_types);
}

/** Every weapon in the catalogue, type defaults applied (for pickers/tests). */
export async function listWeapons(): Promise<WeaponDefinition[]> {
    const catalog = await loadCatalog();
    return (catalog.weapons ?? []).map((weapon) => withTypeDefaults(weapon, catalog.weapon_types));
}

/** Clears the cache (tests, dev reloads). */
export function clearWeaponCatalogCache(): void {
    catalogCache = null;
    byIdCache = null;
}
