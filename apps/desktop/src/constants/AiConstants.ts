/**
 * Tunables for the opponent's Utility AI.
 *
 * Kept apart from `DifficultyConstants` (which stays a pure label catalogue) and
 * from the consideration modules (which stay about structure), so a designer can
 * retune the AI in one place. Everything here is a default: an entity's own
 * `ai:` block overrides it field by field.
 */

import type { Difficulty } from './DifficultyConstants';
import type {
    AiConsiderationId,
    AiQuirkId,
    AiStyleId,
    AiTargeting,
    AiThresholds,
    AiTuning,
    AiWeights,
} from '../types/AiType';

/** The balanced profile: what any unit with no `ai:` block plays as. */
export const DEFAULT_AI_WEIGHTS: Record<AiConsiderationId, number> = {
    expected_damage: 1.0,
    kill_secure: 1.6,
    element_edge: 0.3,
    effect_value: 0.5,
    survival: 0.8,
    heal_ally: 1.2,
    heal_self: 1.4,
    defend: 0.5,
    rest: 0.4,
    reposition: 0.6,
    resource_guard: 0.3,
    item: 0.0,
};

export const DEFAULT_AI_THRESHOLDS: AiThresholds = {
    wounded: 0.45,
    panic: 0.9,
    restMana: 0.25,
    restStamina: 0.2,
    guardMana: 0.15,
    guardStamina: 0.15,
};

/**
 * Prefer the weakest enemy and never waste a turn on a target the hit cannot
 * touch — the old AI's behaviour, now a bias instead of a hard rule.
 */
export const DEFAULT_AI_TARGETING: AiTargeting = {
    prefer: ['weakest'],
    avoid: ['immune', 'reflect'],
};

/** Default "thinking" pause (ms) when an entity authors no `pace`. */
export const DEFAULT_AI_PACE = 350;

/** A preset of defaults, merged under any authored override. */
export interface AiStylePreset {
    weights?: AiWeights;
    thresholds?: Partial<AiThresholds>;
    targeting?: Partial<AiTargeting>;
    quirks?: AiQuirkId[];
}

/**
 * The named styles `ai: { style: … }` resolves to.
 *
 * `balanced` is the empty preset (the defaults). Each other style only names the
 * weights/thresholds that make it feel different; everything else inherits.
 */
export const AI_STYLE_PRESETS: Record<AiStyleId, AiStylePreset> = {
    balanced: {},
    brute: {
        // Charges in, never braces, and does not fear the grave.
        weights: { survival: 0.2, heal_self: 0.2, defend: 0.0, kill_secure: 2.0 },
        thresholds: { wounded: 0.2 },
    },
    caster: {
        // Holds the rear, hunts super-effective matches, rests when mana is low.
        weights: { reposition: 1.0, element_edge: 0.8, rest: 0.6 },
        thresholds: { restMana: 0.3, guardMana: 0.2 },
        targeting: { prefer: ['squishiest'] },
    },
    support: {
        // Triage first, brace when there is nobody to mend.
        weights: { heal_ally: 2.2, defend: 0.9, rest: 0.6, expected_damage: 0.6 },
        thresholds: { restMana: 0.35 },
        targeting: { prefer: ['weakest'] },
    },
    coward: {
        // Braces and mends early, only swings when it must.
        weights: { survival: 1.6, defend: 1.4, heal_self: 1.8, expected_damage: 0.5 },
        thresholds: { wounded: 0.55, panic: 0.6 },
    },
};

/**
 * How the game's difficulty degrades the decision.
 *
 * The AI never cheats: same actions, same costs. Only its read of the board gets
 * blurrier (noise), narrower (disabled considerations, top-k) or jumpier
 * (targetNoise). `hardcore` instead plays *cautiously* — a higher `wounded`
 * threshold means it heals earlier.
 */
export const AI_DIFFICULTY_TUNING: Record<Difficulty, AiTuning> = {
    easy: {
        noise: 0.3,
        disabled: ['kill_secure', 'element_edge'],
        topK: 3,
        thresholds: { wounded: 0.3 },
        targetNoise: 0.4,
    },
    normal: {
        noise: 0.12,
        disabled: [],
        topK: 2,
        thresholds: {},
        targetNoise: 0,
    },
    hard: {
        noise: 0.04,
        disabled: [],
        topK: 1,
        thresholds: {},
        targetNoise: 0,
    },
    hardcore: {
        noise: 0,
        disabled: [],
        topK: 1,
        thresholds: { wounded: 0.55, restMana: 0.35 },
        targetNoise: 0,
    },
};

/** AoE damage may sum past one full health bar, but not without a ceiling. */
export const AI_AOE_DAMAGE_CAP = 1.5;

/** A heal worth this fraction of the target's max HP counts as a full mend. */
export const AI_HEAL_REFERENCE_FRACTION = 0.25;

/** Stat-delta magnitude (attack/defence points) that reads as a "full" effect. */
export const AI_EFFECT_REFERENCE = 40;

/** How far a disliked-but-legal target's score is scaled down (never to zero). */
export const AI_TARGET_BIAS_FLOOR = 0.5;

/** Guards the threat normalisation against a divide by zero. */
export const AI_MIN_THREAT = 1;
