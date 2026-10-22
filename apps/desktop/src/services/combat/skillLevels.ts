/**
 * Upgraded skill tiers (`[id]_II` … `[id]_V`).
 *
 * An entity may reference an upgraded version of a catalogue skill by suffixing
 * its id with a roman numeral: `freeze_ii` means "the `freeze` skill, level 2".
 * The catalogue only ever authors the base skill (level 1) — the tiers are
 * derived here, so one authored entry feeds every upgrade level (2 → II,
 * 3 → III, 4 → IV, 5 → V).
 *
 * Balance intent (all tunables in `CombatConstants`):
 *
 * - **Worth taking:** power grows +15%/level while cost grows only +5%/level,
 *   so mana efficiency rises ~9.5% every tier — a level V skill delivers ~33%
 *   more output per point of mana than level I.
 * - **Not strictly dominant:** absolute cost still grows (+20% at level V) and
 *   level III+ buy extra cooldown turns, so spamming one maxed skill is worse
 *   than rotating a varied kit. Upgrades reward investment without making the
 *   other skills dead weight.
 *
 * Everything here is pure — no catalogue or session access — so the derivation
 * is unit-testable and usable from both the combat builder and the content API.
 */

import {
    MAX_SKILL_LEVEL,
    SKILL_LEVEL_COOLDOWN_EVERY,
    SKILL_LEVEL_COST_GROWTH,
    SKILL_LEVEL_POWER_GROWTH,
} from '../../constants/CombatConstants';
import type { AttackEffect, PublicAttack } from '../../types/AttackDataType';
import { asRecord, readNumber } from '../../utils/combatUtils';

/** Suffix → level. Anything else (or no suffix at all) is the authored level 1. */
const SKILL_LEVEL_SUFFIXES: Record<string, number> = {
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
};

/** Level → display label; level 1 is unlabelled (the base skill). */
const SKILL_LEVEL_LABELS: Record<number, string> = {
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V',
};

/** One resolved skill reference: the catalogue entry plus its upgrade tier. */
export interface SkillLevelRef {
    /** Catalogue id the level derives from (`freeze_ii` → `freeze`). */
    baseId: string;
    /** 1 when the id is authored without a roman-numeral suffix. */
    level: number;
}

/**
 * Splits `[id]_[roman]` into its base id and level.
 *
 * Case-insensitive (`freeze_ii` and `freeze_II` both work) and suffix-anchored,
 * so ids that merely contain those letters (`water_gun`) stay level 1. An
 * unknown numeral (`_vi`, `_i`) is *not* a tier: the id is taken as authored.
 */
export function parseSkillLevelId(skillId: string): SkillLevelRef {
    const trimmed = skillId.trim();
    const match = /^(.+)_([iv]+)$/i.exec(trimmed);
    if (!match) return { baseId: trimmed, level: 1 };

    const level = SKILL_LEVEL_SUFFIXES[match[2].toLowerCase()] ?? 1;
    return level > 1 ? { baseId: match[1], level } : { baseId: trimmed, level: 1 };
}

/** `2 → 'II'`, `3 → 'III'`, `4 → 'IV'`, `5 → 'V'`; `''` for level 1. */
export function skillLevelLabel(level: number): string {
    return SKILL_LEVEL_LABELS[level] ?? '';
}

/**
 * Scales a damage-power specification (`10`, `{ kind: 'fixed', value }` or
 * `{ min, max }`) by `factor`.
 *
 * Power keeps its decimals on purpose: rounding a small base (10 → 11.5) would
 * distort the +15%/level curve, and the damage chain rounds at the end anyway.
 */
function scalePower(power: unknown, factor: number): number | Record<string, unknown> {
    if (typeof power === 'number') return power * factor;
    const spec = asRecord(power);
    if (!spec) return power as number | Record<string, unknown>;

    const next: Record<string, unknown> = { ...spec };
    for (const key of ['value', 'min', 'max'] as const) {
        const amount = readNumber(next[key], Number.NaN);
        if (Number.isFinite(amount)) next[key] = amount * factor;
    }
    return next;
}

/** Scales a flat amount that must stay whole (costs, effect numbers). */
function scaleRounded(value: unknown, factor: number): number {
    const amount = readNumber(value, Number.NaN);
    if (!Number.isFinite(amount)) return readNumber(value, 0);
    return Math.round(amount * factor);
}

/** Clones a numeric record (buff/debuff/regen/drain) with every value scaled. */
function scaleNumericRecord<T extends Record<string, number>>(record: T, factor: number): T {
    const next: Record<string, number> = {};
    for (const [key, raw] of Object.entries(record)) next[key] = scaleRounded(raw, factor);
    return next as T;
}

/**
 * Copies an effect with its numeric output scaled by the level's power factor.
 *
 * Only *output* numbers move: flat `damage`, `resource_regen`/`resource_drain`
 * and `buff`/`debuff` magnitudes (so a pure buff or heal skill also gets stronger
 * — otherwise its upgrade would cost more for the exact same effect). Control
 * knobs stay authored: `turns`, `effect_hit_chance`, `can_stack`,
 * `status_effect` and `apply_to`.
 */
function scaleEffect(effect: AttackEffect, factor: number): AttackEffect {
    const next: AttackEffect = { ...effect };

    if (effect.damage !== undefined) next.damage = scaleRounded(effect.damage, factor);
    if (effect.resource_regen) next.resource_regen = scaleNumericRecord(effect.resource_regen, factor);
    if (effect.resource_drain) next.resource_drain = scaleNumericRecord(effect.resource_drain, factor);
    if (effect.buff) next.buff = scaleNumericRecord(effect.buff, factor);
    if (effect.debuff) next.debuff = scaleNumericRecord(effect.debuff, factor);
    // The per-turn payouts are output too: a stronger tier regenerates more.
    if (effect.regen_per_turn) next.regen_per_turn = scaleNumericRecord(effect.regen_per_turn, factor);
    if (effect.self_upkeep) next.self_upkeep = scaleNumericRecord(effect.self_upkeep, factor);
    if (effect.deferred_cost) next.deferred_cost = scaleNumericRecord(effect.deferred_cost, factor);
    if (effect.heal !== undefined) next.heal = scaleRounded(effect.heal, factor);
    if (effect.damage_per_turn !== undefined) next.damage_per_turn = scaleRounded(effect.damage_per_turn, factor);

    return next;
}

/**
 * Returns a copy of `skill` rebalanced for `level` (1 or below = unchanged).
 *
 * The input is never mutated: every touched field is rebuilt, so the shared
 * catalogue cache stays pristine no matter how many tiers are resolved.
 *
 * What moves per level above 1:
 * - `power` and `damage.power`: ×(1 + 15% × steps)
 * - `costs.mana` / `costs.stamina`: ×(1 + 5% × steps), rounded
 * - `costs.cooldown`: +⌊steps / 2⌋ turns (level II +0, III/IV +1, V +2)
 * - effect output numbers (`damage`, regen/drain, buffs/debuffs): × power factor
 * - `name`: suffixed with the roman tier (`Freeze` → `Freeze II`)
 *
 * Everything else — accuracy, hit count, variance, targeting, range, effect
 * duration/chance — is deliberately left alone: those multiply the whole chain
 * and would push the top tiers into "must pick, why anything else" territory.
 */
export function applySkillLevel(skill: PublicAttack, level: number): PublicAttack {
    const target = Math.min(Math.max(Math.round(level), 1), MAX_SKILL_LEVEL);
    if (target <= 1) return skill;

    const steps = target - 1;
    const powerFactor = 1 + SKILL_LEVEL_POWER_GROWTH * steps;
    const costFactor = 1 + SKILL_LEVEL_COST_GROWTH * steps;
    const extraCooldown = Math.floor(steps / SKILL_LEVEL_COOLDOWN_EVERY);
    const label = skillLevelLabel(target);

    const next: PublicAttack = { ...skill };
    if (label) next.name = `${skill.name} ${label}`;

    // `damage.power` and the top-level `power` fallback are both read by the
    // action factory (`damage?.power ?? skill.power`), so both must move.
    if (skill.damage) {
        const damage: Record<string, unknown> = { ...skill.damage };
        if (damage.power !== undefined) damage.power = scalePower(damage.power, powerFactor);
        next.damage = damage;
    }
    if (skill.power !== undefined) next.power = scalePower(skill.power, powerFactor);

    const authoredCosts = asRecord(skill.costs) ?? {};
    next.costs = {
        mana: scaleRounded(authoredCosts.mana, costFactor),
        stamina: scaleRounded(authoredCosts.stamina, costFactor),
        hp: scaleRounded(authoredCosts.hp, costFactor),
        cooldown: Math.round(readNumber(authoredCosts.cooldown, 0)) + extraCooldown,
    };

    if (Array.isArray(skill.effects)) next.effects = skill.effects.map((effect) => scaleEffect(effect, powerFactor));

    return next;
}
