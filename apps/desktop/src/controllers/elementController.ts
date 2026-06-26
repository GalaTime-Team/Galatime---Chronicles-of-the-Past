import {
    getElementsData,
    getElementWeaknesses,
    getElementStrengths,
    getCommonElementIds,
    ElementWeakness,
} from "../services/elementService";
import {
    consolidateWeaknesses,
    weaknessesToMultipliers,
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
 * Calcula as fraquezas efetivas de um ou mais elementos.
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

    // 1. Buscar dados de todos os elementos
    const elementsData = await getElementsData(elementIds);

    // 2. Extrair fraquezas e forças de cada elemento válido
    const allWeaknesses: ElementWeakness[] = [];
    const validElements: string[] = [];

    for (let i = 0; i < elementsData.length; i++) {
        const element = elementsData[i];
        if (element !== null) {
            validElements.push(element.id);
            const weaknesses = getElementWeaknesses(element);
            const strengths = getElementStrengths(element);
            allWeaknesses.push(weaknesses);
            allWeaknesses.push(strengths);
        }
    }

    // 3. Consolidar fraquezas (somar valores)
    let consolidated = consolidateWeaknesses(allWeaknesses);

    // 4. Semear scores neutros para todos os elementos "common" que faltam
    const commonIds = await getCommonElementIds();
    for (const commonId of commonIds) {
        if (!(commonId in consolidated)) {
            consolidated[commonId] = 0; // x1 multiplier (neutral)
        }
    }

    // 5. Converter para multiplicadores de dano
    const multipliers = weaknessesToMultipliers(consolidated);

    // 6. Ordenar por elementId (alfabeticamente)
    const sorted: Record<string, number> = Object.keys(consolidated)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, elementId) => {
            acc[elementId] = multipliers[elementId] ?? 1;
            return acc;
        }, {} as Record<string, number>);

    // 7. Ordenar elementos válidos por elementId
    validElements.sort((a, b) => a.localeCompare(b));

    // 8. Gerar resumo
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

/**
 * Versão simplificada que retorna apenas os multiplicadores finais.
 * @param elementIds Array de IDs de elementos
 * @returns Objeto com elementId -> multiplicador
 */
export async function getElementsWeaknessMultipliers(
    elementIds: string[]
): Promise<Record<string, number>> {
    const result = await getElementsWeaknesses(elementIds);
    return result.multipliers;
}

/**
 * Calcula o multiplicador de dano total para um elemento alvo,
 * dado um array de elementos atacantes.
 * 
 * Exemplo: se o alvo é Aqua e os atacantes são [Ignis, Lux],
 * e ambos são fracos contra Aqua, o multiplicador será 2 + 2 = 4
 * (na verdade será somado o score bruto e depois convertido).
 * 
 * @param elementIds Array de IDs dos elementos atacantes
 * @param targetElement ID do elemento alvo
 * @returns Multiplicador de dano combinado para o alvo
 */
export async function getCombinedWeakness(
    elementIds: string[],
    targetElement: string
): Promise<number> {
    const result = await getElementsWeaknesses(elementIds);
    return result.multipliers[targetElement] ?? 1;
}
