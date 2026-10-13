import * as yaml from "js-yaml";

/** Relationship keys an element may author, in the order the score matrix reads them. */
export type ElementRelationKey = "immune" | "super_strong" | "strong" | "weak" | "super_weak";

/** Defensive relationships of one element; each list holds target element ids. */
export interface ElementRelations {
    immune?: string[];
    super_strong?: string[];
    strong?: string[];
    weak?: string[];
    super_weak?: string[];
}

export interface ElementData {
    id: string;
    name: string;
    description: string;
    type: "natural" | string;
    relations: ElementRelations;
}

/** One entry of `elements.yaml` — its `id` is the mapping key, not a field. */
type ElementEntry = Omit<ElementData, "id">;

/** Shape of the single element catalogue file. */
interface ElementsFile {
    elements: Record<string, ElementEntry>;
}

// Vite's `import.meta.glob` only accepts a literal pattern, so the path is
// written out here. `?raw` + js-yaml is the pattern the other catalogue loaders
// use; `eager` + `import: 'default'` keeps the catalogue readable synchronously,
// like `itemService`.
const catalogueModules = import.meta.glob(
    "../data/combat/elements/elements.yaml",
    { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** Cache of the parsed catalogue, keyed by element id. */
const elementCache: Map<string, ElementData> = new Map();

/** Reads the authored `elements:` mapping out of the catalogue file. */
function readCatalogueEntries(): Record<string, ElementEntry> {
    const entries: Record<string, ElementEntry> = {};

    for (const [path, source] of Object.entries(catalogueModules)) {
        try {
            const parsed = yaml.load(source) as ElementsFile | null;
            if (parsed?.elements) Object.assign(entries, parsed.elements);
        } catch (error) {
            console.error(`Failed to parse element catalogue "${path}":`, error);
        }
    }

    return entries;
}

/**
 * Loads and caches every element, keyed by id.
 * @returns Every element, in file order
 */
function loadElementCatalogue(): ElementData[] {
    if (elementCache.size > 0) {
        return [...elementCache.values()];
    }

    for (const [id, entry] of Object.entries(readCatalogueEntries())) {
        elementCache.set(id, {
            id,
            name: entry.name,
            description: entry.description,
            type: entry.type,
            relations: entry.relations ?? {},
        });
    }

    return [...elementCache.values()];
}

/**
 * Fetches element data by ID.
 * @param elementId Element ID (the key in `elements.yaml`)
 * @returns Element data or null if not found
 */
export async function getElementData(elementId: string): Promise<ElementData | null> {
    if (elementCache.has(elementId)) {
        return elementCache.get(elementId) ?? null;
    }

    return loadElementCatalogue().find((element) => element.id === elementId) ?? null;
}

/**
 * Fetches all available element data.
 * @returns Array of all element data
 */
export async function getAllElementsData(): Promise<ElementData[]> {
    return loadElementCatalogue();
}