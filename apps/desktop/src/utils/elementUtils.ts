import {
	ELEMENT_DAMAGE_MULTIPLIERS,
	ELEMENT_RELATION_SCORES,
} from '../constants/CombatConstants';

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
 * The score bands live in `CombatConstants` (`ELEMENT_RELATION_SCORES`) and the
 * multiplier each band is worth lives in `ELEMENT_DAMAGE_MULTIPLIERS`, so the
 * whole efficacy ladder can be tuned in one place:
 * - immune (-3) -> x0
 * - super_strong (-2) -> x0.65
 * - strong (-1) -> x0.8
 * - normal (0) -> x1
 * - weak (1) -> x1.3
 * - super_weak (2 or more) -> x1.6
 *
 * @param score Raw weakness score
 * @returns Final damage multiplier
 */
export function scoreToMultiplier(score: number): number {
	const bands = ELEMENT_RELATION_SCORES;

	if (score <= bands.immune) return ELEMENT_DAMAGE_MULTIPLIERS.immune;
	if (score <= bands.super_strong) return ELEMENT_DAMAGE_MULTIPLIERS.super_strong;
	if (score <= bands.strong) return ELEMENT_DAMAGE_MULTIPLIERS.strong;
	if (score >= bands.super_weak) return ELEMENT_DAMAGE_MULTIPLIERS.super_weak;
	if (score >= bands.weak) return ELEMENT_DAMAGE_MULTIPLIERS.weak;
	return ELEMENT_DAMAGE_MULTIPLIERS.normal;
}

/**
 * The relationship label a summed score falls into (tooltip metadata).
 *
 * @param score Summed defensive score
 * @returns The relationship key that best describes the total
 */
export function scoreToType(score: number): string {
	const bands = ELEMENT_RELATION_SCORES;

	if (score <= bands.immune) return "immune";
	if (score <= bands.super_strong) return "super_strong";
	if (score <= bands.strong) return "strong";
	if (score >= bands.super_weak) return "super_weak";
	if (score >= bands.weak) return "weak";
	return "none";
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

	for (const [prop, score] of Object.entries(ELEMENT_RELATION_SCORES)) {
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
 * Sums `ELEMENT_RELATION_SCORES` for every relationship array that mentions the
 * offensive element (`immune -3`, `super_strong -2`, `strong -1`, `weak +1`,
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
 * Final damage multiplier of one offensive element against a possibly
 * multi-element defender (`ELEMENT_DAMAGE_MULTIPLIERS`, currently x0 … x1.6).
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
