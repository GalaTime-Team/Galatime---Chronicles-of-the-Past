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

    // If weak_to is not defined and type is "common", there are no specific weaknesses
    if (!element.weak_to || element.weak_to.length === 0) {
        return weaknesses;
    }

    // Each weakness has a score of 1 (weak_to)
    for (const weakElement of element.weak_to) {
        weaknesses[weakElement].score = 1;
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

    // If strong_vs is not defined, there are no specific strengths
    if (!element.strong_vs || element.strong_vs.length === 0) {
        return strengths;
    }

    // Each element that is strong against has a score of -1 (strong_vs)
    for (const strongElement of element.strong_vs) {
        strengths[strongElement].score = -1;
    }

    return strengths;
}
