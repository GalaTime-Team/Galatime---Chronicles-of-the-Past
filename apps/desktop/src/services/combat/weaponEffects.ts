/**
 * Weapon effects on their holder.
 *
 * The weapon *action* is built by `actionFactory`; the weapon *passives* that
 * change how a holder fights (skill cost, status output, amplified attributes)
 * are read here, in one place, so no service has to reach into the weapon state
 * and re-implement the rule. Every function is pure and reads only
 * {@link CombatUnit.weapon}, which keeps them usable from both the turn
 * resolver and the HUD preview without side effects.
 */

import { CURSED_STAMINA_TAX } from '../../constants/CombatConstants';
import type {
    CombatAction,
    CombatActionCost,
    CombatStatDelta,
    CombatStats,
    CombatUnit,
} from '../../types/CombatType';
import { WeaponFlag } from '../../types/WeaponType';

/** The stats `amplify_best` ranks. Pools are excluded — they are not "attributes". */
const AMPLIFY_STATS: ReadonlyArray<keyof CombatStats> = [
    'physicalAttack',
    'magicalAttack',
    'physicalDefense',
    'magicalDefense',
    'speed',
];

/** Runtime stat field to the authored (snake_case) name used by stat deltas. */
const STAT_KEY: Record<string, string> = {
    physicalAttack: 'physical_attack',
    magicalAttack: 'magical_attack',
    physicalDefense: 'physical_defense',
    magicalDefense: 'magical_defense',
    speed: 'speed',
};

/** Whether the holder's weapon carries a given flag. */
export function weaponHasFlag(unit: CombatUnit, flag: WeaponFlag): boolean {
    return unit.weapon?.flags.includes(flag) ?? false;
}

/**
 * The costs of an action, after the holder's weapon discounts.
 *
 * A `cost_modifiers.mana` entry scales the mana cost of every skill of the
 * listed elements (Staff of God: aqua/lapis at 75%). The discount is applied
 * wherever costs are read — availability, payment — so the number the HUD shows
 * and the number actually spent can never disagree.
 */
export function effectiveActionCost(unit: CombatUnit, action: CombatAction): CombatActionCost {
    const modifier = unit.weapon?.costModifiers?.mana;
    const cursedTax = action.weapon && weaponHasFlag(unit, 'cursed') ? CURSED_STAMINA_TAX : 0;

    if (!modifier) {
        return cursedTax > 0
            ? { ...action.costs, stamina: action.costs.stamina + cursedTax }
            : action.costs;
    }

    const { multiplier, elements } = modifier;
    const applies = !elements || elements.length === 0 || elements.includes(action.elementId);
    if (!applies) {
        return cursedTax > 0
            ? { ...action.costs, stamina: action.costs.stamina + cursedTax }
            : action.costs;
    }

    const mana = Math.max(0, Math.round(action.costs.mana * multiplier));
    if (mana === action.costs.mana && cursedTax === 0) return action.costs;
    return { ...action.costs, mana, stamina: action.costs.stamina + cursedTax };
}

/**
 * Multipliers for the holder's strongest attributes.
 *
 * The attributes above their own average are ranked descending and the top
 * `count` (at most three) are scaled by `multiplier` — Ruyi Jingu Bang's
 * "empower the holder's best attributes" rule. Returns `null` when nothing is
 * above average, so a `modify_stat` ability can report "did not fire".
 */
export function amplifyBestStatMultipliers(
    stats: CombatStats,
    count: number,
    multiplier: number,
): CombatStatDelta | null {
    const entries = AMPLIFY_STATS.map((stat) => ({ stat, value: stats[stat] }));
    const average = entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length;

    const chosen = entries
        .filter((entry) => entry.value > average)
        .sort((a, b) => b.value - a.value)
        .slice(0, Math.max(1, Math.round(count)));

    if (chosen.length === 0) return null;

    const delta: Record<string, number> = {};
    for (const { stat } of chosen) delta[STAT_KEY[stat]] = multiplier;
    return delta as CombatStatDelta;
}

/**
 * Output multiplier the holder applies to its heal/buff/debuff magnitudes.
 *
 * Asclepius Wand doubles them; a unit with no such weapon returns `1`, so
 * callers can multiply unconditionally.
 */
export function effectPowerMultiplier(unit: CombatUnit): number {
    const value = unit.weapon?.effectPower ?? 1;
    return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * The stacking bonus an exponential weapon adds to this swing.
 *
 * A lance (and Gungnir) grows by `per_hit` for every consecutive landed hit on
 * the same target, capped at `cap`. The count itself lives on the holder's
 * weapon state; this reads it and returns the multiplier the damage chain folds
 * (`1` when the weapon does not stack).
 */
export function weaponStackMultiplier(unit: CombatUnit, action: CombatAction): number {
    const exponential = action.weapon?.exponential;
    if (!exponential) return 1;

    const stacks = Math.max(0, unit.weapon?.stacks ?? 0);
    const bonus = Math.min(exponential.per_hit * stacks, exponential.cap ?? 1);
    return 1 + Math.max(0, bonus);
}
