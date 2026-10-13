/**
 * `effect_value` — the worth of what an action does beyond dealing damage.
 *
 * Damage-per-turn (normalised by the target's health), a `prevent_actions` lock
 * (worth a fixed, high amount: a turn taken from an enemy is a turn won), and
 * stat buffs/debuffs (normalised by a reference magnitude). Direct healing is
 * left to `heal_ally`/`heal_self`, so this never double-counts a mend.
 */

import { AI_EFFECT_REFERENCE } from '../../../../constants/AiConstants';
import type { AiConsideration } from '../../../../types/AiType';
import { asRecord, clamp, readNumber, readStatDelta } from '../../../../utils/combatUtils';
import { effectiveStats } from '../../effectResolver';
import { candidateTargetUnits } from '../aiCandidates';

/** Turns an authored `turns` field reads as, when it is a number. */
const DEFAULT_DOT_TURNS = 3;

export const effectValue: AiConsideration = {
    id: 'effect_value',
    evaluate(context, candidate) {
        const { action } = candidate;
        if (action.effects.length === 0) return 0;

        const targets = candidateTargetUnits(context, candidate);
        const referenceHp = targets.length > 0 ? Math.max(1, effectiveStats(targets[0]).maxHp) : 1;

        let score = 0;
        for (const effect of action.effects) {
            const record = asRecord(effect) ?? {};

            const damagePerTurn = readNumber(record.damage_per_turn, 0);
            if (damagePerTurn > 0) {
                const turns = readDotTurns(record.turns);
                score += clamp((damagePerTurn * turns) / referenceHp, 0, 1);
            }

            if (Array.isArray(record.prevent_actions) && record.prevent_actions.length > 0) {
                score += 0.8;
            }

            score += magnitude(readStatDelta(effect.buff)) / AI_EFFECT_REFERENCE;
            score += magnitude(readStatDelta(effect.debuff)) / AI_EFFECT_REFERENCE;
        }

        return clamp(score, 0, 1);
    },
};

/** Sum of a stat delta's absolute magnitudes. */
function magnitude(delta: Record<string, number> | null): number {
    if (!delta) return 0;
    let total = 0;
    for (const value of Object.values(delta)) total += Math.abs(value);
    return total;
}

/** Turns a `damage_per_turn` effect lasts, tolerating a `[min, max]` pair. */
function readDotTurns(raw: unknown): number {
    if (Array.isArray(raw)) {
        const values = raw.map((entry) => readNumber(entry, Number.NaN)).filter(Number.isFinite);
        if (values.length > 0) return Math.max(...values);
    }
    return Math.max(1, readNumber(raw, DEFAULT_DOT_TURNS));
}
