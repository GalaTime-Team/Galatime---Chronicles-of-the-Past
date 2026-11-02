/**
 * Who may run, and how likely the run is to work.
 *
 * Fleeing is a panic move, not a free escape: the unit must be below its own
 * health gate before the action is even legal, and the odds climb from the
 * profile's base chance towards {@link MAX_FLEE_CHANCE} as health approaches
 * zero. Players use a shared rule; an enemy only gets one when its `ai:` block
 * authors `flee`, so most enemies never carry the action at all.
 */

import {
    FLEE_CHANCE,
    MAX_FLEE_CHANCE,
    PLAYER_FLEE_BELOW_HP,
} from '../../constants/CombatConstants';
import type { AiFleeRule } from '../../types/AiType';
import type { CombatUnit } from '../../types/CombatType';
import { clamp } from '../../utils/combatUtils';
import { effectiveStats } from './effectResolver';

/** The shared rule for units the player controls. */
const PLAYER_FLEE_RULE: AiFleeRule = {
    belowHp: PLAYER_FLEE_BELOW_HP,
    baseChance: FLEE_CHANCE,
};

/** The rule that lets this unit flee, or `null` when it may not. */
export function fleeRuleFor(unit: CombatUnit): AiFleeRule | null {
    return unit.isPlayerControlled
        ? PLAYER_FLEE_RULE
        : unit.aiProfile?.flee ?? null;
}

/** How much of its maximum health the unit still has, as a fraction. */
export function unitHpFraction(unit: CombatUnit): number {
    const maxHp = effectiveStats(unit).maxHp;
    return maxHp > 0 ? clamp(unit.currentHp / maxHp, 0, 1) : 0;
}

/** Whether the unit is wounded enough to be allowed to run. */
export function canAttemptFlee(unit: CombatUnit): boolean {
    const rule = fleeRuleFor(unit);
    return rule !== null
        && rule.belowHp > 0
        && rule.baseChance > 0
        && unitHpFraction(unit) <= rule.belowHp;
}

/**
 * Chance the unit's next flee attempt succeeds, in `[0, 1]`.
 *
 * `0` means the unit may not flee at all (no rule, or still too healthy). At the
 * panic gate the chance is the rule's base; at zero health it is
 * {@link MAX_FLEE_CHANCE}.
 */
export function fleeChanceFor(unit: CombatUnit): number {
    const rule = fleeRuleFor(unit);
    if (!rule || !canAttemptFlee(unit)) return 0;

    const hp = unitHpFraction(unit);
    const desperation = rule.belowHp > 0
        ? clamp((rule.belowHp - hp) / rule.belowHp, 0, 1)
        : 1;
    const base = Math.min(rule.baseChance, MAX_FLEE_CHANCE);

    return clamp(
        base + (MAX_FLEE_CHANCE - base) * desperation,
        base,
        MAX_FLEE_CHANCE,
    );
}
