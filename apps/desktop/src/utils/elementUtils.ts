export interface ElementWeakness {
  [elementId: string]: number;
}

/**
 * Consolidates weaknesses from multiple elements by summing the values.
 * 
 * Example: if Ignis has weak_to Aqua (value 1) and Caeli (value 1),
 * and Naturalea also has weak_to Aqua (value 1), the result will be:
 * { aqua: 2, caeli: 1 }
 * 
 * @param elementWeaknesses Array of weakness objects
 * @returns Consolidated object with combined weaknesses
 */
export function consolidateWeaknesses(
  elementWeaknesses: ElementWeakness[]
): ElementWeakness {
  const consolidated: ElementWeakness = {};

  for (const weaknesses of elementWeaknesses) {
    for (const [elementId, score] of Object.entries(weaknesses)) {
      consolidated[elementId] = (consolidated[elementId] || 0) + score;
    }
  }

  return consolidated;
}

/**
 * Converts weakness scores to the final damage multiplier scale.
 * 
 * Mapping:
 * - immune (-3) -> x0
 * - super_strong (-2) -> x0.25
 * - strong (-1) -> x0.5
 * - normal (0) -> x1
 * - weak (1) -> x2
 * - super_weak (2) -> x4
 * 
 * @param score Raw weakness score
 * @returns Final damage multiplier
 */
export function scoreToMultiplier(score: number): number {
  switch (score) {
    case -3:
      return 0; // immune
    case -2:
      return 0.25; // super_strong
    case -1:
      return 0.5; // strong
    case 0:
      return 1; // normal
    case 1:
      return 2; // weak
    case 2:
      return 4; // super_weak
    default:
      // Interpolação linear para valores fora do intervalo
      if (score < -3) return 0;
      if (score > 2) return 4;
      return 1; // fallback
  }
}

/**
 * Maps all relationships from an element to a scores object.
 * Processes immune_to, super_strong_vs, strong_vs, weak_to, super_weak_to in a single pass.
 * 
 * Score mapping:
 * - immune_to -> -3
 * - super_strong_vs -> -2
 * - strong_vs -> -1
 * - weak_to -> 1
 * - super_weak_to -> 2
 * 
 * @param element Element data with relationship arrays
 * @returns Object with elementId as key and score as value
 */
export function mapElementRelationshipsToScores(element: any): ElementWeakness {
    const weaknesses: ElementWeakness = {};
    
    const scores: Record<string, number> = {
        immune_to: -3,
        super_strong_vs: -2,
        strong_vs: -1,
        weak_to: 1,
        super_weak_to: 2,
    };

    for (const [prop, score] of Object.entries(scores)) {
        const value = element[prop];
        if (value && Array.isArray(value)) {
            for (const targetElement of value) {
                weaknesses[targetElement] = (weaknesses[targetElement] || 0) + score;
            }
        }
    }

    return weaknesses;
}

/**
 * Converts a consolidated weaknesses object to damage multipliers.
 * @param weaknesses Object with elementIds as keys and scores as values
 * @returns Object with the same elementIds and damage multipliers
 */
export function weaknessesToMultipliers(
  weaknesses: ElementWeakness
): Record<string, number> {
  const multipliers: Record<string, number> = {};

  for (const [elementId, score] of Object.entries(weaknesses)) {
    multipliers[elementId] = scoreToMultiplier(score);
  }

  return multipliers;
}
