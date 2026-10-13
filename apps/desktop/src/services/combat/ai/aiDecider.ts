/**
 * The decision pipeline.
 *
 * `candidates → score → choose`, in that order, with each step a separate module
 * so the whole thing stays a pure function of the decision context:
 *
 * 1. {@link buildAiCandidates} expands the legal actions into *(action × target)*
 *    pairs (the service already validated every rule);
 * 2. each pair is scored as `Σ (weight × consideration)`, then biased by the
 *    profile's `prefer`/`avoid` lists;
 * 3. the difficulty blurs, widens or randomises the choice;
 * 4. a `defend` brace is the floor when nothing is legal.
 *
 * Nothing here writes to the state — the caller submits the request through the
 * same path a player does.
 */

import type { AiCandidate, AiConsiderationId, AiDecisionContext } from '../../../types/AiType';
import type { CombatActionRequest } from '../../../types/CombatType';
import { clamp } from '../../../utils/combatUtils';
import { buildAiCandidates } from './aiCandidates';
import { targetBias } from './aiTargeting';
import { AI_CONSIDERATIONS } from './considerations';

/** One scored candidate, kept for logging. */
export interface AiScoredCandidate {
    key: string;
    actionId: string;
    targetId: string | null;
    score: number;
    /** The `[0, 1]` each active consideration gave it. */
    considerations: Partial<Record<AiConsiderationId, number>>;
}

/** What the decider chose, plus the ranking behind it. */
export interface AiDecision {
    /** `null` only when the unit has nothing legal to do (a stall). */
    request: CombatActionRequest | null;
    /** Every candidate, best first. */
    ranking: AiScoredCandidate[];
}

/** Internal candidate + score, before the public projection. */
interface Scored {
    candidate: AiCandidate;
    score: number;
    considerations: Partial<Record<AiConsiderationId, number>>;
}

/** Picks the next action for a unit nobody plays. */
export function decideCombatAction(context: AiDecisionContext): AiDecision {
    const candidates = buildAiCandidates(context);
    if (candidates.length === 0) {
        return { request: braceFallback(context), ranking: [] };
    }

    const scored = candidates.map((candidate) => scoreCandidate(context, candidate));
    scored.sort((a, b) => b.score - a.score || a.candidate.key.localeCompare(b.candidate.key));

    const chosen = pickWithDifficulty(context, scored);
    return { request: toRequest(chosen.candidate), ranking: scored.map(toRanking) };
}

/** `Σ (weight × consideration)`, then the target bias. */
function scoreCandidate(context: AiDecisionContext, candidate: AiCandidate): Scored {
    const { profile, tuning } = context;
    const considerations: Partial<Record<AiConsiderationId, number>> = {};
    let total = 0;

    for (const id of Object.keys(profile.weights) as AiConsiderationId[]) {
        if (tuning.disabled.includes(id)) continue;

        const weight = profile.weights[id];
        if (weight === 0) continue;

        const consideration = AI_CONSIDERATIONS[id];
        if (!consideration) continue;

        const value = clamp(consideration.evaluate(context, candidate), 0, 1);
        considerations[id] = value;
        total += weight * value;
    }

    total *= targetBias(context, candidate);
    return { candidate, score: total, considerations };
}

/**
 * Applies the difficulty to the ranking.
 *
 * `targetNoise` occasionally ignores the read entirely (an easy unit acting on a
 * whim); otherwise `noise` blurs the scores and `topK` widens the pick to the
 * top candidates. With `noise: 0` and `topK: 1` the best candidate always wins,
 * so `hard`/`hardcore` are fully deterministic.
 */
function pickWithDifficulty(context: AiDecisionContext, scored: readonly Scored[]): Scored {
    const { tuning, random } = context;

    if (tuning.targetNoise > 0 && random() < tuning.targetNoise) {
        const index = Math.floor(random() * scored.length);
        return scored[Math.min(index, scored.length - 1)];
    }

    if (tuning.noise <= 0 && tuning.topK <= 1) return scored[0];

    const noisy = scored.map((entry) => ({
        entry,
        score: entry.score + (random() * 2 - 1) * tuning.noise,
    }));
    noisy.sort((a, b) => b.score - a.score || a.entry.candidate.key.localeCompare(b.entry.candidate.key));

    const topK = Math.max(1, Math.min(tuning.topK, noisy.length));
    const index = topK > 1 ? Math.floor(random() * topK) : 0;
    return noisy[Math.min(index, topK - 1)].entry;
}

/** The request the service accepts. */
function toRequest(candidate: AiCandidate): CombatActionRequest {
    const request: CombatActionRequest = { actionId: candidate.action.id };
    if (candidate.action.targeting === 'enemy_one' && candidate.targetId) {
        request.targetId = candidate.targetId;
    }
    return request;
}

/**
 * The floor: brace when nothing scored.
 *
 * `defend` is normally a candidate itself, so this only fires for a unit whose
 * every action is unusable except the brace. Returns `null` when even that is not
 * available, which the caller reports as a stall.
 */
function braceFallback(context: AiDecisionContext): CombatActionRequest | null {
    const brace = context.previews.find(
        (preview) => preview.usable && preview.action.kind === 'defend',
    );
    return brace ? { actionId: brace.action.id } : null;
}

/** The public projection of a scored candidate. */
function toRanking(entry: Scored): AiScoredCandidate {
    return {
        key: entry.candidate.key,
        actionId: entry.candidate.action.id,
        targetId: entry.candidate.targetId,
        score: entry.score,
        considerations: entry.considerations,
    };
}
