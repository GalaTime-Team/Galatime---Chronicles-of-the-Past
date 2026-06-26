import {
    getAllElementsDataService,
    getElementsData,
} from "../services/elementService";
import {
    consolidateScores,
    scoresToMultipliers,
    mapElementWeaknessesToScores,
    mapElementDamageToScores,
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

    // Get data for all elements
    const elementsData = await getElementsData(elementIds);

    // Extract weaknesses of each valid element
    const allWeaknesses: Record<string, { type: string; score: number }>[] = [];
    const validElements: string[] = [];

    for (let i = 0; i < elementsData.length; i++) {
        const element = elementsData[i];
        if (element !== null) {
            validElements.push(element.id);
            // Map all relationships in a single pass
            const weaknesses = mapElementWeaknessesToScores(element as any);
            allWeaknesses.push(weaknesses);
        }
    }

    // Consolidate weaknesses
    let consolidated = consolidateScores(allWeaknesses);

    // Convert to damage multipliers
    const multipliers = scoresToMultipliers(consolidated);

    // Sort by elementId (alphabetically)
    const sortedMultipliers: Record<string, { type: string; score: number }> = Object.keys(consolidated)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, elementId) => {
            acc[elementId] = multipliers[elementId] ?? { type: "none", score: 1 };
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

    const allOffensiveScores: Record<string, { type: string; score: number }>[] = [];

    // For each target element, determine its defensive score against the input offensive elements
    for (const targetElement of allTargetElements) {
        let combinedScoreForTarget = 0;
        let targettype = targetElement.type;
        for (const offensiveElementId of elementIds) {
            // Map the target element's defensive relationships to an offensive score for the input element
            const scores = mapElementDamageToScores(targetElement, offensiveElementId);
            combinedScoreForTarget += scores[targetElement.id]?.score || 0;
        }
        allOffensiveScores.push({ [targetElement.id]: { type: targettype, score: combinedScoreForTarget } });
    }

    // Consolidate scores (this will effectively just take the combined score for each target)
    let consolidated = consolidateScores(allOffensiveScores);

    // Convert to damage multipliers
    const multipliers = scoresToMultipliers(consolidated);

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