const scoreMap: Record<string, number> = {
	immune: -3,
	super_strong: -2,
	strong: -1,
	weak: 1,
	super_weak: 2,
};

/**
 * Consolidates scores from multiple elements by summing the values.
 * 
 * Example: if Ignis has weak Aqua (value 1) and Caeli (value 1),
 * and Florere also has weak Aqua (value 1), the result will be:
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
 * The relationship label a summed score falls into (tooltip metadata).
 *
 * @param score Summed defensive score
 * @returns The relationship key that best describes the total
 */
export function scoreToType(score: number): string {
	if (score <= -3) return "immune";
	if (score === -2) return "super_strong";
	if (score === -1) return "strong";
	if (score === 0) return "none";
	if (score === 1) return "weak";
	return "super_weak";
}

/**
 * Maps the defensive element's `relations` to a score per target element.
 *
 * @param element Element data with a `relations` block
 * @returns Object with elementId as key and score as value
 */
export function mapElementWeaknessesToScores(element: any): Record<string, { type: string; score: number }> {
	const weaknesses: Record<string, { type: string; score: number }> = {};
	const relations = element?.relations ?? {};

	for (const [prop, score] of Object.entries(scoreMap)) {
		const value = relations[prop];
		if (value && Array.isArray(value)) {
			for (const targetElement of value) {
				weaknesses[targetElement] = {
					type: prop, // The relationship key (immune, strong, weak, ...)
					score: (weaknesses[targetElement]?.score || 0) + score,
				};
			}
		}
	}

	return weaknesses;
}

/**
 * Raw defensive score of one element against one offensive element.
 *
 * Sums `scoreMap` for every relationship array that mentions the offensive
 * element (`immune -3`, `super_strong -2`, `strong -1`, `weak +1`,
 * `super_weak +2`). An element that does not mention the offensive element
 * contributes `0`.
 *
 * @param element Element data with a `relations` block
 * @param offensiveElementId Offensive element ID
 * @returns Summed defensive score (0 when unmentioned)
 */
export function elementDefenseScore(element: any, offensiveElementId: string): number {
	return mapElementWeaknessesToScores(element)[offensiveElementId]?.score ?? 0;
}

/**
 * Summed raw defensive score of a defender's elements against one offensive element.
 *
 * This is the single efficacy rule of the game: a multi-element defender adds the
 * score of each of its elements together (unmentioned = 0) before the total is
 * mapped to a multiplier. So `chaos (immune -3) + ignis (unmentioned 0) = -3`.
 *
 * @param elements Defender's element data
 * @param offensiveElementId Offensive element ID
 * @returns Summed defensive score
 */
export function combineDefenseScores(elements: readonly any[], offensiveElementId: string): number {
	let total = 0;
	for (const element of elements) {
		total += elementDefenseScore(element, offensiveElementId);
	}
	return total;
}

/**
 * Final damage multiplier (`x0` … `x4`) of one offensive element against a
 * possibly multi-element defender.
 *
 * @param elements Defender's element data
 * @param offensiveElementId Offensive element ID
 * @returns Damage multiplier
 */
export function combinedElementMultiplier(elements: readonly any[], offensiveElementId: string): number {
	return scoreToMultiplier(combineDefenseScores(elements, offensiveElementId));
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
