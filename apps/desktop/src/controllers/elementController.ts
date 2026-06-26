import {
    getElementsData,
    getCommonElementIds,
    ElementWeakness,
} from "../services/elementService";
import {
    consolidateWeaknesses,
    weaknessesToMultipliers,
    mapElementRelationshipsToScores,
} from "../utils/elementUtils";


export interface ElementWeaknessResult {
    elements: string[];
    consolidated: Record<string, number>;
    multipliers: Record<string, number>;
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
 * @returns ElementWeaknessResult
 */
export async function getElementsWeaknesses(
    elementIds: string[]
): Promise<ElementWeaknessResult> {

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
    const allWeaknesses: ElementWeakness[] = [];
    const validElements: string[] = [];

    for (let i = 0; i < elementsData.length; i++) {
        const element = elementsData[i];
        if (element !== null) {
            validElements.push(element.id);
            // Map all relationships in a single pass
            const weaknesses = mapElementRelationshipsToScores(element as any);
            allWeaknesses.push(weaknesses);
        }
    }

    // Consolidate weaknesses
    let consolidated = consolidateWeaknesses(allWeaknesses);

    // Seed neutral scores for all missing "common" elements
    const commonIds = await getCommonElementIds();
    for (const commonId of commonIds) {
        if (!(commonId in consolidated)) {
            consolidated[commonId] = 0; // x1 multiplier (neutral)
        }
    }

    // Convert to damage multipliers
    const multipliers = weaknessesToMultipliers(consolidated);

    // Sort by elementId (alphabetically)
    const sorted: Record<string, number> = Object.keys(consolidated)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, elementId) => {
            acc[elementId] = multipliers[elementId] ?? 1;
            return acc;
        }, {} as Record<string, number>);

    // Sort valid elements by elementId
    validElements.sort((a, b) => a.localeCompare(b));

    // Generate summary
    const hasImmunities = Object.values(multipliers).some((m) => m === 0);
    const hasResistances = Object.values(multipliers).some((m) => 0 < m && m < 1);
    const hasWeaknesses = Object.values(multipliers).some((m) => m > 1);

    return {
        elements: validElements,
        consolidated,
        multipliers: sorted,
        summary: {
            totalElements: validElements.length,
            hasImmunities,
            hasResistances,
            hasWeaknesses,
        },
    };
}