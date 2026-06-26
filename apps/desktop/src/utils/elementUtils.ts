const scoreMap: Record<string, number> = {
	immune_to: -3,
	super_strong_vs: -2,
	strong_vs: -1,
	weak_to: 1,
	super_weak_to: 2,
};

/**
 * Consolidates scores from multiple elements by summing the values.
 * 
 * Example: if Ignis has weak_to Aqua (value 1) and Caeli (value 1),
 * and Naturalea also has weak_to Aqua (value 1), the result will be:
 * { aqua: 2, caeli: 1 }
 * 
 * @param elementWeaknesses Array of weakness objects
 * @returns Consolidated object with combined weaknesses
 */
export function consolidateScores(
	elementWeaknesses: Record<string, { type: string; score: number }>[]
): Record<string, { type: string; score: number }> {
	const consolidated: Record<string, { type: string; score: number }> = {};

	for (const weaknesses of elementWeaknesses) {
		for (const [elementId, { type, score }] of Object.entries(weaknesses)) {
			consolidated[elementId] = {
				type,
				score: (consolidated[elementId]?.score || 0) + score,
			};
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
 * Maps the defensive element's weaknesses and strengths to a score.
 * 
 * @param element Element data with relationship arrays
 * @returns Object with elementId as key and score as value
 */
export function mapElementWeaknessesToScores(element: any): Record<string, { type: string; score: number }> {
	const weaknesses: Record<string, { type: string; score: number }> = {};

	for (const [prop, score] of Object.entries(scoreMap)) {
		const value = element[prop];
		if (value && Array.isArray(value)) {
			for (const targetElement of value) {
				weaknesses[targetElement] = {
					type: prop, // Include the type (e.g., "weakness", "strength", etc.)
					score: (weaknesses[targetElement]?.score || 0) + score,
				};
			}
		}
	}

	return weaknesses;
}

/**
 * Maps the offensive element's effectiveness against a target element to a score.
 * 
 * @param element Element data with relationship arrays
 * @param offensiveElementId Offensive element ID
 * @returns Object with elementId as key and score as value
 */
export function mapElementDamageToScores(
	element: any,
	offensiveElementId: string
): Record<string, { type: string; score: number }> {
	const scores: Record<string, { type: string; score: number }> = {};

	for (const [prop, score] of Object.entries(scoreMap)) {
		if (element[prop]?.includes(offensiveElementId)) {
			scores[element.id] = {
				type: prop, // Include the type (e.g., "weakness", "strength", etc.)
				score: score,
			};
			return scores;
		}
	}

	scores[element.id] = {
		type: "none", // Default type if no match is found
		score: 0,
	};
	return scores;
}

/**
 * Converts a consolidated scores object to damage multipliers.
 * @param scores Object with elementIds as keys and scores as values
 * @returns Object with the same elementIds and damage multipliers
 */
export function scoresToMultipliers(
	scores: Record<string, { type: string; score: number }>
): Record<string, { type: string; score: number }> {
	const multipliers: Record<string, { type: string; score: number }> = {};

	for (const [elementId, { type, score }] of Object.entries(scores)) {
		multipliers[elementId] = {
			type,
			score: scoreToMultiplier(score),
		};
	}

	return multipliers;
}
