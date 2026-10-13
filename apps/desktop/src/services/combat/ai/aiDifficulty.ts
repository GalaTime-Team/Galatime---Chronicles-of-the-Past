/**
 * How the game's difficulty degrades a decision.
 *
 * Only the *quality* changes: the AI never gets new actions or cheaper costs, it
 * just reads the board less well. The knobs live in `AiConstants`; this module
 * only resolves them and folds the level's threshold overrides over the profile.
 */

import { AI_DIFFICULTY_TUNING } from '../../../constants/AiConstants';
import type { Difficulty } from '../../../constants/DifficultyConstants';
import type { AiProfile, AiThresholds, AiTuning } from '../../../types/AiType';

/** The tuning for a difficulty level; unknown levels fall back to `normal`. */
export function resolveAiTuning(difficulty: Difficulty): AiTuning {
    return AI_DIFFICULTY_TUNING[difficulty] ?? AI_DIFFICULTY_TUNING.normal;
}

/** The profile's thresholds with the level's overrides applied on top. */
export function effectiveThresholds(profile: AiProfile, tuning: AiTuning): AiThresholds {
    return { ...profile.thresholds, ...tuning.thresholds };
}
