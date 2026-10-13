import {
    getAllElementsDataService,
    getElementsData,
} from "../services/elementService";
import {
    combineDefenseScores,
    elementDefenseScore,
    scoreToMultiplier,
    scoreToType,
} from "../utils/elementUtils";


export interface ElementMultiplierResult {
    elements: string[];
    consolidated: Record<string, { type: string; score: number }>;
    multipliers: Record<string, { type: string; score: number }>;
    summary: {
        totalElements: number;
        hasImmunities: boolean;
        hasResistances: boolean;
        hasWeaknesses: boolean;
    };
}

/**
 * Calculates the effective weaknesses of one or more elements.
 * @param elementIds Array of element IDs
 * @returns ElementMultiplierResult
 */
export async function getElementsWeaknesses(
    elementIds: string[]
): Promise<ElementMultiplierResult> {

    if (!elementIds || elementIds.length === 0) {
        return {
            elements: [],
            consolidated: {},
            multipliers: {},
            summary: {
                totalElements: 0,
                hasImmunities: false,
                hasResistances: false,
                hasWeaknesses: false,
            },
        };
    }

    // Get data for all defender elements
    const elementsData = await getElementsData(elementIds);

    const validElements: string[] = [];
    const defenderElements: any[] = [];

    for (const element of elementsData) {
        if (element !== null) {
            validElements.push(element.id);
            defenderElements.push(element);
        }
    }

    // The tooltip lists every natural element, exactly like the attack tooltip does, so the
    // elements that no relationship mentions come out neutral (score 0 -> x1). Each entry is
    // the SUM of the defender's elements' scores (unmentioned = 0), the single efficacy rule
    // shared with the combat damage path. Corrupted elements are left out of the LIST,
    // matching the attack tooltip's filter, but are still summed when they defend.
    const allElements = await getAllElementsDataService();
    const consolidated: Record<string, { type: string; score: number }> = {};
    const multipliers: Record<string, { type: string; score: number }> = {};
    for (const element of allElements) {
        if (element.type !== "natural") continue;
        const score = combineDefenseScores(defenderElements, element.id);
        consolidated[element.id] = { type: scoreToType(score), score };
        multipliers[element.id] = { type: scoreToType(score), score: scoreToMultiplier(score) };
    }

    // Sort by elementId (alphabetically)
    const sortedMultipliers: Record<string, { type: string; score: number }> = Object.keys(multipliers)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, elementId) => {
            acc[elementId] = multipliers[elementId];
            return acc;
        }, {} as Record<string, { type: string; score: number }>);

    // Sort valid elements by elementId
    validElements.sort((a, b) => a.localeCompare(b));

    // Generate summary
    const hasImmunities = Object.values(multipliers).some((m) => m.score === 0);
    const hasResistances = Object.values(multipliers).some((m) => 0 < m.score && m.score < 1);
    const hasWeaknesses = Object.values(multipliers).some((m) => m.score > 1);

    return {
        elements: validElements,
        consolidated,
        multipliers: sortedMultipliers,
        summary: {
            totalElements: validElements.length,
            hasImmunities,
            hasResistances,
            hasWeaknesses,
        },
    };
}

/**
 * Calculates the effective damage of one or more elements.
 * @param elementIds Array of element IDs
 * @returns ElementMultiplierResult
 */
export async function getElementsDamage(
    elementIds: string[]
): Promise<ElementMultiplierResult> {

    if (!elementIds || elementIds.length === 0) {
        return {
            elements: [],
            consolidated: {},
            multipliers: {},
            summary: {
                totalElements: 0,
                hasImmunities: false,
                hasResistances: false,
                hasWeaknesses: false,
            },
        };
    }

    // Get data for all possible target elements
    const allTargetElements = await getAllElementsDataService();

    // For each target element, SUM its defensive score against each of the input
    // offensive elements (an element that does not mention the offence contributes 0).
    const consolidated: Record<string, { type: string; score: number }> = {};
    for (const targetElement of allTargetElements) {
        let combinedScoreForTarget = 0;
        for (const offensiveElementId of elementIds) {
            combinedScoreForTarget += elementDefenseScore(targetElement, offensiveElementId);
        }
        consolidated[targetElement.id] = { type: targetElement.type, score: combinedScoreForTarget };
    }

    // Convert to damage multipliers
    const multipliers: Record<string, { type: string; score: number }> = {};
    for (const [elementId, entry] of Object.entries(consolidated)) {
        multipliers[elementId] = { type: entry.type, score: scoreToMultiplier(entry.score) };
    }

    // Sort by elementId (alphabetically)
    const sortedMultipliers: Record<string, { type: string; score: number }> = Object.keys(consolidated)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, elementId) => {
            acc[elementId] = multipliers[elementId] ?? { type: "none", score: 1 };
            return acc;
        }, {} as Record<string, { type: string; score: number }>);

    // Sort valid elements (these are the target elements)
    const validElements = allTargetElements.map(e => e.id).sort((a, b) => a.localeCompare(b));

    // Generate summary
    const hasImmunities = Object.values(multipliers).some((m) => m.score === 0);
    const hasResistances = Object.values(multipliers).some((m) => 0 < m.score && m.score < 1);
    const hasWeaknesses = Object.values(multipliers).some((m) => m.score > 1);

    return {
        elements: validElements,
        consolidated,
        multipliers: sortedMultipliers,
        summary: {
            totalElements: validElements.length,
            hasImmunities,
            hasResistances,
            hasWeaknesses,
        },
    };
}