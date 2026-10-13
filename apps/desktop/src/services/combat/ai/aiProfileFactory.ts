/**
 * Normalises an entity's authored `ai:` block into the resolved profile a
 * decision reads.
 *
 * Same discipline as the ability factory: the YAML is untyped, so every read is
 * tolerant and a missing or malformed block degrades to the default profile
 * rather than breaking the fight. The merge order is
 * **defaults → style preset → authored overrides**, so `ai: { style: brute }`
 * on one line is a full personality, and anything below it can still be
 * redefined field by field.
 */

import {
    AI_STYLE_PRESETS,
    DEFAULT_AI_TARGETING,
    DEFAULT_AI_THRESHOLDS,
    DEFAULT_AI_WEIGHTS,
} from '../../../constants/AiConstants';
import type { CombatAbilityInstance } from '../../../types/AbilityType';
import type {
    AiConsiderationId,
    AiProfile,
    AiQuirkId,
    AiStyleId,
    AiTargetAvoidance,
    AiTargetPreference,
    AiThresholds,
} from '../../../types/AiType';
import { asRecord, readNumber, readString } from '../../../utils/combatUtils';

const CONSIDERATION_IDS = Object.keys(DEFAULT_AI_WEIGHTS) as AiConsiderationId[];
const STYLE_IDS: AiStyleId[] = ['balanced', 'brute', 'caster', 'support', 'coward'];
const TARGET_PREFERENCES: AiTargetPreference[] = ['weakest', 'squishiest', 'healers', 'threat'];
const TARGET_AVOIDANCES: AiTargetAvoidance[] = ['immune', 'reflect'];
const QUIRK_IDS: AiQuirkId[] = ['fearless_death'];
/**
 * Authored threshold names, in both spellings.
 *
 * The YAML around the codebase is snake_case (`physical_attack`), so thresholds
 * are authored that way too; the camelCase runtime keys are accepted as well so
 * the two never have to be kept in sync by hand.
 */
const THRESHOLD_ALIASES: Record<string, keyof AiThresholds> = {
    wounded: 'wounded',
    panic: 'panic',
    rest_mana: 'restMana',
    restMana: 'restMana',
    rest_stamina: 'restStamina',
    restStamina: 'restStamina',
    guard_mana: 'guardMana',
    guardMana: 'guardMana',
    guard_stamina: 'guardStamina',
    guardStamina: 'guardStamina',
};

/**
 * Weight a `fearless_death` unit gives to surviving.
 *
 * A slime that splits when it dies is rewarded for dying, so it should not weight
 * its own survival — near-zero, but not zero, so it still braces if that is all
 * it can do.
 */
const FEARLESS_SURVIVAL_WEIGHT = 0.05;

/** Reads the authored style, falling back to `balanced`. */
function readStyle(raw: unknown): AiStyleId {
    const value = readString(raw, '') as AiStyleId;
    return STYLE_IDS.includes(value) ? value : 'balanced';
}

/** Picks the known members of a string list, ignoring everything else. */
function readEnumList<T extends string>(raw: unknown, allowed: readonly T[]): T[] | null {
    if (!Array.isArray(raw)) return null;
    const picked = raw
        .map((entry) => readString(entry, ''))
        .filter((entry): entry is T => (allowed as readonly string[]).includes(entry));
    return picked;
}

/**
 * Quirks a unit's own abilities imply, when the author did not spell them out.
 *
 * `fearless_death`: a unit that bursts into more units (or transforms) when it
 * dies does not fear the grave — a slime that splits is rewarded for dying, so
 * it should not weight its own survival. Read off `on_death` + `summon`/
 * `transform`.
 */
export function detectAiQuirks(abilities: readonly CombatAbilityInstance[]): AiQuirkId[] {
    const fearless = abilities.some(({ definition }) => {
        if (definition.enabled === false) return false;
        if (definition.trigger.event !== 'on_death') return false;
        return definition.action.type === 'summon' || definition.action.type === 'transform';
    });

    return fearless ? ['fearless_death'] : [];
}

/**
 * Builds the resolved profile for one entity.
 *
 * `abilities` is the entity's own (already normalised) abilities, used only to
 * auto-detect quirks; pass `[]` when the caller has none.
 */
export function createAiProfile(
    raw: unknown,
    abilities: readonly CombatAbilityInstance[] = [],
): AiProfile {
    const definition = asRecord(raw) ?? {};
    const style = readStyle(definition.style);
    const preset = AI_STYLE_PRESETS[style];

    const weights = { ...DEFAULT_AI_WEIGHTS, ...preset.weights };
    const authoredWeightKeys = new Set<string>();
    const authoredWeights = asRecord(definition.weights);
    if (authoredWeights) {
        for (const id of CONSIDERATION_IDS) {
            const value = readNumber(authoredWeights[id], Number.NaN);
            if (Number.isFinite(value) && value >= 0) {
                weights[id] = value;
                authoredWeightKeys.add(id);
            }
        }
    }

    const thresholds = { ...DEFAULT_AI_THRESHOLDS, ...preset.thresholds };
    const authoredThresholds = asRecord(definition.thresholds);
    if (authoredThresholds) {
        for (const [rawKey, rawValue] of Object.entries(authoredThresholds)) {
            const key = THRESHOLD_ALIASES[rawKey];
            if (!key) continue;
            const value = readNumber(rawValue, Number.NaN);
            if (Number.isFinite(value) && value >= 0) thresholds[key] = value;
        }
    }

    const targeting = {
        prefer: [...(preset.targeting?.prefer ?? DEFAULT_AI_TARGETING.prefer)],
        avoid: [...(preset.targeting?.avoid ?? DEFAULT_AI_TARGETING.avoid)],
    };
    const authoredTargeting = asRecord(definition.targeting);
    if (authoredTargeting) {
        const prefer = readEnumList(authoredTargeting.prefer, TARGET_PREFERENCES);
        if (prefer) targeting.prefer = prefer;
        const avoid = readEnumList(authoredTargeting.avoid, TARGET_AVOIDANCES);
        if (avoid) targeting.avoid = avoid;
    }

    const quirks = new Set<AiQuirkId>(readEnumList(definition.quirks, QUIRK_IDS) ?? []);
    for (const quirk of detectAiQuirks(abilities)) quirks.add(quirk);

    // A quirk nudges the weights only where the author stayed silent, so an
    // explicit `weights:` always wins.
    if (quirks.has('fearless_death')) {
        if (!authoredWeightKeys.has('survival')) weights.survival = FEARLESS_SURVIVAL_WEIGHT;
        if (!authoredWeightKeys.has('heal_self')) weights.heal_self = FEARLESS_SURVIVAL_WEIGHT;
    }

    const authoredPace = readNumber(definition.pace, Number.NaN);
    const pace = Number.isFinite(authoredPace) && authoredPace >= 0
        ? Math.round(authoredPace)
        : null;

    return {
        style,
        weights,
        thresholds,
        targeting,
        quirks: [...quirks],
        pace,
    };
}
