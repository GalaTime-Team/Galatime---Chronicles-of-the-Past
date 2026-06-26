import * as yaml from "js-yaml";

export interface ElementData {
    id: string;
    name: string;
    description: string;
    type: "common" | string;
    immune_to?: string[];
    super_strong_vs?: string[];
    strong_vs?: string[];
    weak_to?: string[];
    super_weak_to?: string[];
}

/**
 * Cache of loaded elements
 */
const elementCache: Map<string, ElementData> = new Map();
let elementsGlob: Record<string, () => Promise<{ default: string }>> | null = null;

/**
 * Initializes the elements glob
 */
async function initializeElementsGlob() {
    if (elementsGlob === null) {
        elementsGlob = import.meta.glob(
            "../data/combat/elements/*.yaml",
            { query: '?raw' }
        ) as Record<string, () => Promise<{ default: string }>>;
    }
}

/**
 * Fetches element data by ID.
 * @param elementId Element ID (file name without extension)
 * @returns Element data or null if not found
 */
export async function getElementData(elementId: string): Promise<ElementData | null> {
    try {
        // Check cache
        if (elementCache.has(elementId)) {
            return elementCache.get(elementId) ?? null;
        }

        // Initialize glob if necessary
        await initializeElementsGlob();

        if (!elementsGlob) {
            console.error("Failed to initialize elements glob");
            return null;
        }

        // Find the corresponding file
        const globPath = `../data/combat/elements/${elementId}.yaml`;
        const loaderFn = elementsGlob[globPath];

        if (!loaderFn) {
            console.log("loaderFn: ", loaderFn, "globPath: ", globPath, "elementsGlob: ", elementsGlob);
            console.warn(`Element file not found: ${elementId}`);
            return null;
        }

        // Load and parse
        const module = await loaderFn();
        const content = module.default as string;
        const parsed = yaml.load(content) as unknown as ElementData;

        // Cache
        elementCache.set(elementId, parsed);

        return parsed;
    } catch (error) {
        console.error(`Error loading element data for ${elementId}:`, error);
        return null;
    }
}

/**
 * Fetches all available element data.
 * @returns Array of all element data
 */
export async function getAllElementsData(): Promise<ElementData[]> {
    await initializeElementsGlob();

    if (!elementsGlob) {
        console.error("Failed to initialize elements glob");
        return [];
    }

    const allElementIds = Object.keys(elementsGlob).map(path =>
        path.replace("../data/combat/elements/", "").replace(".yaml", "").replace("?raw", "")
    );

    const elements = await Promise.all(allElementIds.map(id => getElementData(id)));
    return elements.filter((e): e is ElementData => e !== null);
}