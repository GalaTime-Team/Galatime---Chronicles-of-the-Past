/**
 * Vocabulary for the opponent's Utility AI.
 *
 * A unit nobody plays needs an opinion about what to do. Rather than one shallow
 * rule (`combatAi`'s original "hit the weakest thing"), every unit scores each
 * legal *(action × target)* with a set of **weighted considerations** and takes
 * the best. The weights and thresholds live inline in the entity YAML (`ai:`),
 * like `abilities:`, so each mob gets its own personality without a shared
 * catalogue.
 *
 * The profile is stored resolved on `CombatUnit.aiProfile` (serialisable, like
 * `abilities`), and the difficulty only modulates *how well* the unit plays
 * (noise, switched-off considerations, thresholds) — never the rules.
 */

import type { Difficulty } from '../constants/DifficultyConstants';
import type {
    CombatAction,
    CombatActionPreview,
    CombatElementIndex,
    CombatRandom,
    CombatState,
    CombatUnit,
} from './CombatType';

/**
 * The considerations a profile can weight.
 *
 * Adding one is adding a module under `services/combat/ai/considerations/` plus a
 * key here and in {@link DEFAULT_AI_WEIGHTS} — the decider iterates this list, so
 * nothing else has to change.
 */
export type AiConsiderationId =
    | 'expected_damage'
    | 'kill_secure'
    | 'element_edge'
    | 'effect_value'
    | 'survival'
    | 'heal_ally'
    | 'heal_self'
    | 'defend'
    | 'rest'
    | 'reposition'
    | 'resource_guard'
    | 'item';

/** How a profile likes its targets. A bias, never a legality rule. */
export type AiTargetPreference = 'weakest' | 'squishiest' | 'healers' | 'threat';

/** What a profile refuses to waste a turn on (auto-detected from the target's kit). */
export type AiTargetAvoidance = 'immune' | 'reflect';

/** Behaviours the normaliser infers from a unit's abilities when not authored. */
export type AiQuirkId = 'fearless_death';

/** A named bundle of defaults (`ai: { style: brute }`), lived in code not data. */
export type AiStyleId = 'balanced' | 'brute' | 'caster' | 'support' | 'coward';

/** Weights, keyed by consideration id. Missing keys fall back to the defaults. */
export type AiWeights = Partial<Record<AiConsiderationId, number>>;

/**
 * The numbers a decision reads from the profile.
 *
 * Fractions are `0 … 1`. `wounded`/`panic` describe when surviving outranks
 * trading blows; `rest*`/`guard*` describe when the resource pools gate the kit.
 */
export interface AiThresholds {
    /** HP fraction below which a hurt unit favours healing and bracing. */
    wounded: number;
    /** Incoming threat over max HP above which the unit plays defensively. */
    panic: number;
    /** Mana fraction below which `rest` starts to score. */
    restMana: number;
    /** Stamina fraction below which `rest` starts to score. */
    restStamina: number;
    /** Mana fraction a candidate should not spend below. */
    guardMana: number;
    /** Stamina fraction a candidate should not spend below. */
    guardStamina: number;
}

/** The target biases a profile authors. */
export interface AiTargeting {
    prefer: AiTargetPreference[];
    avoid: AiTargetAvoidance[];
}

/**
 * The authored `ai:` block, exactly as it appears in YAML.
 *
 * Every field is optional and read tolerantly: an absent or malformed block
 * degrades to the default profile instead of breaking the fight.
 */
export interface AiProfileDefinition {
    style?: unknown;
    weights?: unknown;
    thresholds?: unknown;
    targeting?: unknown;
    quirks?: unknown;
    pace?: unknown;
}

/**
 * The resolved profile stored on a `CombatUnit`.
 *
 * Fully merged (defaults → style → authored overrides) so the decider never has
 * to re-derive a default mid-fight, and serialisable so it survives the state
 * copies the HUD makes.
 */
export interface AiProfile {
    style: AiStyleId;
    weights: Record<AiConsiderationId, number>;
    thresholds: AiThresholds;
    targeting: AiTargeting;
    quirks: AiQuirkId[];
    /** Ms the HUD leaves the decision on screen; `null` = use the caller's delay. */
    pace: number | null;
}

/**
 * The difficulty knobs, resolved once per decision.
 *
 * Only quality changes: `noise` blurs the read, `disabled` switches considerations
 * off, `topK` widens the choice, `thresholds` shifts when the unit gets cautious.
 */
export interface AiTuning {
    /** Uniform noise added to each candidate score (`0` = none). */
    noise: number;
    /** Considerations this level switches off entirely. */
    disabled: AiConsiderationId[];
    /** How many of the top candidates are eligible; `1` = always the best. */
    topK: number;
    /** Threshold overrides the level imposes (merged over the profile). */
    thresholds: Partial<AiThresholds>;
    /** Probability of taking a random legal candidate instead of the scored pick. */
    targetNoise: number;
}

/** One legal *(action × target)* the decider may choose. */
export interface AiCandidate {
    action: CombatAction;
    /** Stable key for tie-breaking and logging (`actionId` or `actionId:targetId`). */
    key: string;
    /** The single named target, when the rule is `enemy_one`; else `null`. */
    targetId: string | null;
    /** Every unit the action would land on (one for `enemy_one`). */
    targetIds: string[];
}

/**
 * Everything one decision needs, assembled by `combatService`.
 *
 * The session's `elementIndex` and `random` are private, so this seam is what
 * lets the decider stay a pure function while still reading the same maths and
 * the same RNG stream the real fight uses.
 */
export interface AiDecisionContext {
    state: CombatState;
    actor: CombatUnit;
    /** The actor's legal actions, with usability and legal targets. */
    previews: readonly CombatActionPreview[];
    elementIndex: CombatElementIndex;
    random: CombatRandom;
    difficulty: Difficulty;
    /** The actor's resolved profile. */
    profile: AiProfile;
    /** The difficulty knobs for this decision. */
    tuning: AiTuning;
    /** `profile.thresholds` with the level's overrides folded in. */
    thresholds: AiThresholds;
}

/**
 * One consideration: a pure score in `[0, 1]` for a candidate.
 *
 * Deliberately small and stateless — the decider multiplies the score by the
 * profile's weight, so a consideration never sees (or cares about) the weights.
 */
export interface AiConsideration {
    id: AiConsiderationId;
    evaluate(context: AiDecisionContext, candidate: AiCandidate): number;
}
