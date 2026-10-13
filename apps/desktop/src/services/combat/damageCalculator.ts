/**
 * Damage maths — the single damage calculation of the game.
 *
 * The authored formula is:
 *
 *     dano = (ATK_TIPO / RES_TIPO) x EFFECT x (PWR / POWER_DIVISOR) x VARIANCE
 *
 * `POWER_DIVISOR` is the constant in `CombatConstants` (currently `1`); read it
 * before reasoning about balance — this comment used to hard-code `/5`, which
 * stopped being true and quietly misled a whole balance pass.
 *
 * `VARIANCE` is a random multiplier; an action that authors no `damage_variance`
 * falls back to {@link DAMAGE_VARIANCE_RANGE} (0.9 … 1.1). A hit that lands never
 * deals less than {@link MINIMUM_DAMAGE}.
 *
 * `EFFECT` is the element efficacy taken from the shared element matrix, so the
 * existing `elementUtils` scaling (x0 … x4) is reused rather than duplicated. The
 * lane (position) modifier, the bracing reduction and the ability modifier folded
 * from the defender's passives are applied on top.
 *
 * Every consumer — the turn resolver and the HUD preview — goes through
 * {@link resolveDamage}, so this chain exists exactly once.
 */

import {
    DAMAGE_VARIANCE_RANGE,
    DEFEND_DAMAGE_REDUCTION,
    DEFAULT_ACCURACY,
    MINIMUM_DAMAGE,
    MINIMUM_DEFENSE,
    POWER_DIVISOR,
    RANDOMIZE_POWER_RANGE,
} from '../../constants/CombatConstants';
import type {
    AttackModifier,
    CombatAction,
    CombatElementIndex,
    CombatLine,
    CombatRandom,
    CombatStats,
    DamageType,
} from '../../types/CombatType';
import type { ElementData } from '../../types/ElementDataType';
import { clamp } from '../../utils/combatUtils';
import { elementDefenseScore, scoreToMultiplier } from '../../utils/elementUtils';
import { positionDamageModifier } from './positionRules';

/**
 * Precomputes the RAW defensive score of every target element against every
 * offensive element, so a fight never re-walks the matrix while resolving hits.
 *
 * Raw scores (not multipliers) are stored on purpose: a multi-element defender
 * has to ADD its elements' scores before the total is mapped, and averaging
 * multipliers would give a different — wrong — answer.
 */
export function buildElementDamageIndex(elements: readonly ElementData[]): CombatElementIndex {
    const defenseScores: Record<string, Record<string, number>> = {};

    for (const target of elements) {
        const against: Record<string, number> = {};
        for (const offensive of elements) {
            against[offensive.id] = elementDefenseScore(target, offensive.id);
        }
        defenseScores[target.id] = against;
    }

    return { defenseScores };
}

/**
 * Efficacy of one offensive element against a target that may carry several.
 *
 * The defender's elements ADD their raw scores together — an element that does
 * not mention the offence contributes `0` — and the total is mapped once to a
 * multiplier. So `immune (-3) + unmentioned (0) = -3 -> x0`, while
 * `immune (-3) + weak (+1) = -2 -> x0.25`. This is the same rule the
 * tooltips use (`elementController`), so a preview and a real hit can never
 * disagree.
 */
export function elementMultiplier(
    index: CombatElementIndex,
    offensiveElementId: string,
    targetElementIds: readonly string[],
): number {
    if (!offensiveElementId || targetElementIds.length === 0) return 1;

    let total = 0;
    for (const targetElementId of targetElementIds) {
        total += index.defenseScores[targetElementId]?.[offensiveElementId] ?? 0;
    }

    return scoreToMultiplier(total);
}

/** The attack stat a damage channel reads. */
export function attackStat(stats: CombatStats, damageType: DamageType): number {
    return damageType === 'physical' ? stats.physicalAttack : stats.magicalAttack;
}

/** The defence stat a damage channel reads. */
export function defenseStat(stats: CombatStats, damageType: DamageType): number {
    return damageType === 'physical' ? stats.physicalDefense : stats.magicalDefense;
}

/** Damage before the lane, bracing and variance steps. */
interface BaseDamageParams {
    attackValue: number;
    defenseValue: number;
    power: number;
    elementMultiplier: number;
    positionModifier: number;
    /** Reduction from the target bracing (`0` … `0.9`). */
    defenseReduction: number;
    /** Random multiplier applied to each hit (`1` when not rolling). */
    variance: number;
    /** Ability multiplier folded from the target's passive abilities (`1` = none). */
    attackMultiplier: number;
    /** `true` when an ability makes the target immune to the hit. */
    immune: boolean;
    /**
     * John II's `atk_def_ratio`: the hit is scaled again by `ATK / RES`, so a
     * fragile target takes far more and an armoured one far less.
     */
    atkDefRatio?: boolean;
}

/** The intermediate values of one hit, kept so the log can show the chain. */
interface DamageBreakdown {
    /** Damage before the lane and bracing steps. */
    base: number;
    /** Damage after the lane and bracing reductions. */
    positioned: number;
    /** Damage after the variance multiplier. */
    varied: number;
    /** Rounded damage actually applied. */
    final: number;
}

/**
 * The damage chain: `(ATK / RES) x EFFECT x (PWR / POWER_DIVISOR)`, then lane, bracing and
 * variance, then rounded.
 *
 * Defence is a divisor, so it can never drop below {@link MINIMUM_DEFENSE}. A hit
 * that lands always deals at least {@link MINIMUM_DAMAGE} — except against an
 * immune target (effect `x0`), which takes nothing.
 */
function calculateDamage(params: BaseDamageParams): DamageBreakdown {
    const { attackValue, defenseValue, power, elementMultiplier: effect } = params;
    if (power <= 0) return { base: 0, positioned: 0, varied: 0, final: 0 };

    const defense = Math.max(MINIMUM_DEFENSE, defenseValue);
    const base = (attackValue / defense) * effect * (power / POWER_DIVISOR);
    const reduction = 1 - clamp(params.defenseReduction, 0, 0.9);
    const positioned = base * params.positionModifier * reduction;
    // A `royal` weapon (John II) scales the hit by the same ATK/RES ratio again.
    const ratio = params.atkDefRatio ? attackValue / defense : 1;
    const varied = positioned * params.variance * params.attackMultiplier * ratio;
    const final = params.immune || effect === 0 ? 0 : Math.max(MINIMUM_DAMAGE, Math.round(varied));
    return { base, positioned, varied, final };
}

/** Everything one attacker/target damage resolution needs. */
export interface DamageRequest {
    action: CombatAction;
    attackerStats: CombatStats;
    defenderStats: CombatStats;
    /** Elements of the unit being hit; drives the efficacy multiplier. */
    defenderElementIds: readonly string[];
    elementIndex: CombatElementIndex;
    attackerLine: CombatLine;
    defenderLine: CombatLine;
    /** `true` when attacker and defender fight for the same side. */
    sameSide: boolean;
    /** `true` when the defender is bracing (`defend`). */
    defenderDefending: boolean;
    /**
     * Passive modifier folded from the defender's abilities.
     *
     * Required (not defaulted) on purpose: every caller has to decide, and both
     * callers read it through `foldAttackModifiers`, so the HUD preview and the
     * real hit can never fold different numbers.
     */
    modifier: AttackModifier;
    random: CombatRandom;
    /**
     * `true` (the default) rolls accuracy and variance, producing the numbers a
     * real hit would use. `false` returns the deterministic expectation of a
     * single hit — no accuracy roll, variance `1` — for target previews.
     */
    roll?: boolean;
}

/** The full damage accounting of one attacker/target pair. */
export interface DamageResult {
    /** `false` when every hit missed. */
    isHit: boolean;
    /** Hits that landed (`1` for a non-rolling preview). */
    hits: number;
    /** Attack stat the action read from the attacker. */
    attackValue: number;
    /** Defence stat the action read from the defender. */
    defenseValue: number;
    /** Authored power. */
    power: number;
    /** Damage channel the action used. */
    damageType: DamageType;
    /** Ability multiplier folded from the target's passive abilities (`1` = none). */
    attackMultiplier: number;
    /** `true` when an ability made the target immune to the hit. */
    immune: boolean;
    /** Element efficacy (`x0` … `x4`). */
    elementMultiplier: number;
    /** Variance multiplier applied (`1` when not rolling). */
    variance: number;
    /** Lane modifier (`1`, `0.85` or `0.8`). */
    positionModifier: number;
    /** Reduction from the defender bracing (`0` … `0.9`). */
    defenseReduction: number;
    /** One hit before the lane, bracing and variance steps. */
    baseDamage: number;
    /** Rounded damage applied across every hit. */
    finalDamage: number;
}

/**
 * Resolves the damage an action deals to one target.
 *
 * The only place a damage number is produced: the turn resolver and the HUD
 * preview both call it, so they can never drift apart.
 */
export function resolveDamage(request: DamageRequest): DamageResult {
    const { action, elementIndex, random } = request;
    const rolling = request.roll ?? true;

    const attackValue = attackStat(request.attackerStats, action.damageType);
    const defenseValue = defenseStat(request.defenderStats, action.damageType);
    const effect = elementMultiplier(elementIndex, action.elementId, request.defenderElementIds);
    const positionModifier = positionDamageModifier(
        request.attackerLine,
        request.defenderLine,
        request.sameSide,
    );
    const defenseReduction = request.defenderDefending ? DEFEND_DAMAGE_REDUCTION : 0;
    const variance = rolling ? rollVariance(random, action.damageVariance) : 1;

    // Per-range accuracy (staff/bow): the target's line stands in for distance,
    // so a shot at the back line is judged by the `rear` value and a swing at the
    // front line by `front`.
    const byRange = action.weapon?.accuracyByRange;
    const accuracy = byRange
        ? (request.defenderLine === 'front' ? byRange.front : byRange.rear)
        : action.accuracy;
    const atkDefRatio = action.weapon?.damageModifiers?.atk_def_ratio === true;
    // Bazar goods (`randomize_power`) wager the authored power on every swing.
    const randomizePower = action.weapon?.randomizePower === true;
    const [powerMin, powerMax] = RANDOMIZE_POWER_RANGE;

    const attempts = rolling ? Math.max(1, action.hitCount) : 1;
    let baseDamage = 0;
    let finalDamage = 0;
    let hits = 0;

    for (let hit = 0; hit < attempts; hit += 1) {
        if (rolling && !rollHit(random, accuracy)) continue;

        const hitPower = rolling && randomizePower
            ? action.power * (powerMin + random() * (powerMax - powerMin))
            : action.power;

        const breakdown = calculateDamage({
            attackValue,
            defenseValue,
            power: hitPower,
            elementMultiplier: effect,
            positionModifier,
            defenseReduction,
            variance,
            attackMultiplier: request.modifier.multiplier,
            immune: request.modifier.immune,
            atkDefRatio,
        });

        baseDamage = breakdown.base;
        finalDamage += breakdown.final;
        hits += 1;
    }

    return {
        isHit: hits > 0,
        hits,
        attackValue,
        defenseValue,
        power: action.power,
        damageType: action.damageType,
        elementMultiplier: effect,
        variance,
        positionModifier,
        defenseReduction,
        attackMultiplier: request.modifier.multiplier,
        immune: request.modifier.immune,
        baseDamage,
        finalDamage,
    };
}

/** Normalises an authored accuracy to a `0 … 100` percentage. */
export function normalizeAccuracy(accuracy: number): number {
    const value = Number.isFinite(accuracy) ? accuracy : DEFAULT_ACCURACY;
    const percent = value > 0 && value <= 1 ? value * 100 : value;
    return clamp(percent, 0, 100);
}

/** Rolls a single hit against an authored accuracy. */
export function rollHit(random: CombatRandom, accuracy: number): boolean {
    return random() * 100 < normalizeAccuracy(accuracy);
}

/**
 * Rolls a multiplier inside a damage-variance range.
 *
 * An action that authors no `damage_variance` uses {@link DAMAGE_VARIANCE_RANGE}.
 */
export function rollVariance(random: CombatRandom, variance: [number, number] | null): number {
    const [min, max] = variance ?? DAMAGE_VARIANCE_RANGE;
    return min + random() * (max - min);
}

/**
 * Randomness for HUD previews.
 *
 * A preview must not consume the fight's RNG stream, and a chance-gated passive
 * should read as "could apply" rather than "never applies" — `0` satisfies every
 * `chance` roll, so the preview stays optimistic and side-effect free.
 */
export const DETERMINISTIC_PREVIEW_RANDOM: CombatRandom = () => 0;
