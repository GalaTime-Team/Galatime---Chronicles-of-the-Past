import { ElementData, getElementData, getAllElementsData } from "../types/ElementDataType";

export async function getAllElementsDataService(): Promise<ElementData[]> {
    return getAllElementsData();
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
export function getElementWeaknesses(element: ElementData): Record<string, { type: string; score: number }> {
    const weaknesses: Record<string, { type: string; score: number }> = {};

    for (const weakElement of element.relations?.weak ?? []) {
        weaknesses[weakElement] = { type: "weak", score: 1 };
    }

    return weaknesses;
}

/**
 * Maps an element's strengths to a scores object.
 * @param element Element data
 * @returns Object with elementId as key and strength score as value
 */
export function getElementStrengths(element: ElementData): Record<string, { type: string; score: number }> {
    const strengths: Record<string, { type: string; score: number }> = {};

    for (const strongElement of element.relations?.strong ?? []) {
        strengths[strongElement] = { type: "strong", score: -1 };
    }

    return strengths;
}
