/**
 * Interface
 */

export interface ElementWeakness {
    [elementId: string]: number;
}

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
            "../../src/data/combat/elements/*.yaml",
            { query: '?raw' }
        ) as Record<string, () => Promise<{ default: string }>>;
    }
}

/**
 * Parses simple YAML without external dependencies.
 * Works for the specific structure of element files.
 * @param content YAML content as string
 * @returns Parsed object
 */
function parseSimpleYaml(content: string): Partial<ElementData> {
    const result: Record<string, unknown> = {};
    const lines = content.split("\n");
    let currentListKey: string | null = null;
    let currentList: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Ignore empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) {
            if (currentListKey && trimmed === "") {
                result[currentListKey] = currentList;
                currentListKey = null;
                currentList = [];
            }
            continue;
        }

        // Detect lists (start with `-`)
        if (trimmed.startsWith("-")) {
            const item = trimmed.substring(1).trim();
            currentList.push(item);
            continue;
        }

        // If was processing a list, finalize
        if (currentListKey) {
            result[currentListKey] = currentList;
            currentListKey = null;
            currentList = [];
        }

        // Detect key-value pairs
        const colonIndex = trimmed.indexOf(":");
        if (colonIndex > 0) {
            const key = trimmed.substring(0, colonIndex).trim();
            const valueStr = trimmed.substring(colonIndex + 1).trim();

            // Parse simple values
            if (valueStr === "") {
                // Next lines may be a list
                currentListKey = key;
                currentList = [];
            } else if (
                valueStr.startsWith('"') &&
                valueStr.endsWith('"') &&
                valueStr.length > 1
            ) {
                // String between quotes
                result[key] = valueStr.substring(1, valueStr.length - 1);
            } else if (valueStr === "true") {
                result[key] = true;
            } else if (valueStr === "false") {
                result[key] = false;
            } else if (!isNaN(Number(valueStr))) {
                result[key] = Number(valueStr);
            } else {
                // Simple string
                result[key] = valueStr;
            }
        }
    }

    // Finalize list if still present
    if (currentListKey) {
        result[currentListKey] = currentList;
    }

    return result;
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
        const parsed = parseSimpleYaml(content) as unknown as ElementData;

        // Cache
        elementCache.set(elementId, parsed);

        return parsed;
    } catch (error) {
        console.error(`Error loading element data for ${elementId}:`, error);
        return null;
    }
}

/**
 * Fetches multiple elements by ID.
 * @param elementIds List of element IDs
 * @returns Array of element data (null for not found elements)
 */
export async function getElementsData(
    elementIds: string[]
): Promise<(ElementData | null)[]> {
    return Promise.all(elementIds.map((id) => getElementData(id)));
}

/**
 * Maps an element's weaknesses to a scores object.
 * @param element Element data
 * @returns Object with elementId as key and weakness score as value
 */
export function getElementWeaknesses(element: ElementData): ElementWeakness {
    const weaknesses: ElementWeakness = {};

    // If weak_to is not defined and type is "common", there are no specific weaknesses
    if (!element.weak_to || element.weak_to.length === 0) {
        return weaknesses;
    }

    // Each weakness has a score of 1 (weak_to)
    for (const weakElement of element.weak_to) {
        weaknesses[weakElement] = 1;
    }

    return weaknesses;
}

/**
 * Maps an element's strengths to a scores object.
 * @param element Element data
 * @returns Object with elementId as key and strength score as value
 */
export function getElementStrengths(element: ElementData): ElementWeakness {
    const strengths: ElementWeakness = {};

    // If strong_vs is not defined, there are no specific strengths
    if (!element.strong_vs || element.strong_vs.length === 0) {
        return strengths;
    }

    // Each element that is strong against has a score of -1 (strong_vs)
    for (const strongElement of element.strong_vs) {
        strengths[strongElement] = -1;
    }

    return strengths;
}

/**
 * Enumerates all elements with type "common".
 * @returns Array of common element IDs
 */
export async function getCommonElementIds(): Promise<string[]> {
    try {
        // Initialize glob if necessary
        await initializeElementsGlob();

        if (!elementsGlob) {
            console.error("Failed to initialize elements glob");
            return [];
        }

        const commonIds: string[] = [];

        // Iterate through all element files
        for (const globPath of Object.keys(elementsGlob)) {
            // Extract ID from path (e.g., "../data/combat/elements/ignis.yaml" -> "ignis")
            const match = globPath.match(/\/([^\/]+)\.yaml$/);
            if (match) {
                const elementId = match[1];
                const elementData = await getElementData(elementId);

                // Check if it is type "common"
                if (elementData && elementData.type === "common") {
                    commonIds.push(elementId);
                }
            }
        }

        return commonIds;
    } catch (error) {
        console.error("Error enumerating common elements:", error);
        return [];
    }
}
