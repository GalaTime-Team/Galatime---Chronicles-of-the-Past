/**
 * Tunable numbers for the combat system — the single balance file.
 *
 * Everything a designer is likely to want to change lives here, so the rule
 * modules (`services/combat/*`) stay about structure instead of magic numbers.
 *
 * This includes:
 * - the base stats every unit is born with (`BASE_*`);
 * - the element efficacy ladder (`ELEMENT_RELATION_SCORES` /
 *   `ELEMENT_DAMAGE_MULTIPLIERS`);
 * - the damage formula, critical, variance, position and ability defaults.
 *
 * Change a number here, not in the services that read it.
 */

import type { CombatLine, CombatRange, DamageType } from '../types/CombatType';
import type { ElementRelationKey } from '../types/ElementDataType';

/* ------------------------------------------------------------------------- */
/* Unit baselines                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Base critical-hit chance every unit is born with, in percent.
 */
export const BASE_CRIT_CHANCE = 1;

/**
 * Base evasion every unit is born with, in points.
 *
 * Evasion is subtracted from the attacker's accuracy, exactly like a buff's
 * `evasion` does. `0` means a unit is hit at the action's authored chance
 * unless something raises its evasion.
 */
export const BASE_EVASION = 1;

/** Base accuracy modifier every unit is born with, in points. */
export const BASE_ACCURACY_MODIFIER = 0;

/* ------------------------------------------------------------------------- */
/* Element efficacy                                                          */
/* ------------------------------------------------------------------------- */

/**
 * Raw score each authored element relationship is worth.
 *
 * The defender's elements ADD their scores together (an element that does not
 * mention the offence contributes `0`) and the sum is mapped once through
 * {@link ELEMENT_DAMAGE_MULTIPLIERS}. These anchors are the vocabulary of the
 * catalogue: `immune` -3, `super_strong` -2, `strong` -1, `weak` +1,
 * `super_weak` +2.
 */
export const ELEMENT_RELATION_SCORES: Record<ElementRelationKey, number> = {
    immune: -3,
    super_strong: -2,
    strong: -1,
    weak: 1,
    super_weak: 2,
};

/**
 * Final damage multiplier for each summed element score band.
 *
 * Kept deliberately narrow so a good or bad matchup tilts a fight instead of
 * deciding it: a super-effective hit is worth +60%, not the old ×4, and a
 * resisted hit only loses 20% instead of half. Immunity stays absolute (`0`).
 * Any summed score beyond `super_weak` (several defending elements all weak to
 * the same offence) is clamped to this same band.
 */
export const ELEMENT_DAMAGE_MULTIPLIERS = {
    immune: 0,
    super_strong: 0.65,
    strong: 0.8,
    normal: 1,
    weak: 1.3,
    super_weak: 1.6,
} as const;

/** The element efficacy band a summed score falls into. */
export type ElementEfficacyBand = keyof typeof ELEMENT_DAMAGE_MULTIPLIERS;

/**
 * Units a single battle line can hold. Authored rosters must respect it.
 *
 * Ten is what the formation board draws without clipping: a lane no longer
 * stacks its sprites at a fixed overlap — it divides the height it has by the
 * units that share it (`CombatFormationSide`), so a short line spreads out and
 * a full one nests together inside the arena's floor.
 */
export const MAX_UNITS_PER_LINE = 10;

/** Most weapons one unit can carry into a fight, copies of the same weapon included. */
export const MAX_CARRIED_WEAPONS = 5;

/**
 * Damage multiplier applied when a unit hits another line.
 *
 * Read as `POSITION_DAMAGE_MODIFIERS[attackerLine][targetLine]`. Same-line and
 * ally targets are never penalised (handled by the position rules).
 */
export const POSITION_DAMAGE_MODIFIERS: Record<CombatLine, Record<CombatLine, number>> = {
    front: { front: 1, rear: 0.8 },
    rear: { front: 0.85, rear: 0.8 },
};

/** Lines a range can be fired from. Short reach is impossible from the rear. */
export const RANGE_ALLOWED_FROM_LINE: Record<CombatRange, CombatLine[]> = {
    short: ['front'],
    medium: ['front', 'rear'],
    long: ['front', 'rear'],
};

/** Enemy lines a range can reach. Short reach stops at the front line. */
export const RANGE_REACHES_LINE: Record<CombatRange, CombatLine[]> = {
    short: ['front'],
    medium: ['front', 'rear'],
    long: ['front', 'rear'],
};

/**
 * Speed a unit must bank to earn one turn in a round.
 *
 * Turn frequency is proportional to speed: a unit banks `speed` points every
 * round and spends this much per turn by default. Lower it to make speed
 * matter more sharply.
 */
export const SPEED_PER_TURN = 20;

/**
 * Multiplier that defines when extra turns are earned.
 *
 * By default `3.5`, a unit needs 3.5 times as much speed as {@link SPEED_PER_TURN}
 * to earn its second turn, 7 times for its third, etc. (so speed 70 = 2
 * turns, speed 140 = 3 turns with the default values).
 */
export const EXTRA_TURN_RATIO = 3.5;

/**
 * Damage channel a weapon uses.
 *
 * Weapons share the skill damage formula (`ATK x EFFECT x PWR / RES`) and are
 * always physical for now, so an authored `damage_type` is not consulted.
 */
export const WEAPON_DAMAGE_TYPE: DamageType = 'physical';

/** Divisor applied to an action's power before the defence step. */
export const POWER_DIVISOR = 1;

/** Defence is a divisor, so it can never drop below this. */
export const MINIMUM_DEFENSE = 1;

/**
 * A hit that lands always deals at least this much.
 *
 * Without it, a low-power attack against a heavy defence would round to `0` and
 * read as a miss. A target that is immune (element `x0`) still takes nothing.
 */
export const MINIMUM_DAMAGE = 1;

/** Assumed hit chance when an action does not author one. */
export const DEFAULT_ACCURACY = 100;

/**
 * Variance multiplier applied when an action authors no `damage_variance`.
 *
 * Every hit is multiplied by a random number in this range, so identical
 * attacks never land the exact same number twice.
 */
export const DAMAGE_VARIANCE_RANGE: [number, number] = [0.9, 1.1];

/**
 * Power range rolled by a `randomize_power` weapon (bazar martial goods).
 *
 * The authored `power` is multiplied by a value in this range on every landed
 * hit, so a bargain weapon is as likely to overperform as to disappoint. The
 * HUD preview never rolls it (it uses the range's midpoint, `1`).
 */
export const RANDOMIZE_POWER_RANGE: [number, number] = [0.6, 1.4];

/** Extra durability a `cursed` weapon bleeds per action used. */

export const CURSED_WEAR_BONUS = 1;

/** Extra stamina a `cursed` weapon demands of every action it performs. */
export const CURSED_STAMINA_TAX = 2;

/** Chance that a `fragile` weapon breaks on a swing. */
export const FRAGILE_WEAPON_BREAK_CHANCE = 0.08;

/** Fraction of shots that spend ammo when a weapon authors no `consume_chance`. */
export const DEFAULT_AMMO_CONSUME_CHANCE = 1;

/** Fraction of a hit a `reflect` ability throws back when it authors no `fraction`. */
export const DEFAULT_REFLECT_FRACTION = 0.5;

/** Assumed reach when an action does not author one. */
export const DEFAULT_SKILL_RANGE: CombatRange = 'medium';

/** A weapon is a swing or a shot from the front, unless it says otherwise. */
export const DEFAULT_WEAPON_RANGE: CombatRange = 'short';

/** Multiplier applied to incoming damage while the target is defending. */
export const DEFEND_DAMAGE_REDUCTION = 0.5;

/** Fraction of the maximum restored by the `rest` action. */
export const REST_MANA_RESTORE_FRACTION = 0.3;
export const REST_STAMINA_RESTORE_FRACTION = 0.3;

/**
 * Idle-regen payout floor: a resource left unspent regenerates at least this
 * much on the next turn, no matter how small the pool is.
 */
export const RESOURCE_REGEN_MINIMUM = 1;

/**
 * Idle-regen payout ceiling, as a fraction of the pool's maximum.
 *
 * The payout grows along Fibonacci (1, 1, 2, 3, 5, 8, 13 …) every turn the
 * resource goes unspent, but never past an eighth of the pool per turn.
 */
export const RESOURCE_REGEN_MAX_FRACTION = 1 / 8;

/** Base chance a `flee` attempt succeeds at the unit's panic threshold. */
export const FLEE_CHANCE = 0.5;

/**
 * Ceiling for the flee chance.
 *
 * A unit below its panic threshold rolls between {@link FLEE_CHANCE} and this,
 * rising as its health approaches zero. Even a cornered unit can be caught.
 */
export const MAX_FLEE_CHANCE = 0.9;

/**
 * Health fraction below which a player-controlled unit may try to flee.
 *
 * Enemies get their own threshold from the `ai.flee` block; the player has no
 * `ai` profile, so this is the shared "you are desperate enough" line.
 */
export const PLAYER_FLEE_BELOW_HP = 0.3;

/**
 * Multiplier a `solar` skill gets by day.
 *
 * The day value is `1` — the sun's own hour is how a solar skill is meant to
 * feel — and {@link SOLAR_NIGHT_MULTIPLIER} is how much the borrowed power
 * fades once night falls.
 */
export const SOLAR_DAY_MULTIPLIER = 1.0;

/** Multiplier a `solar` skill gets when it is not day (i.e. at night). */
export const SOLAR_NIGHT_MULTIPLIER = 0.25;

/** Multiplier a `lunar` skill gets at night. */
export const LUNAR_NIGHT_MULTIPLIER = 1.0;

/** Multiplier a `lunar` skill gets when it is not night (i.e. by day). */
export const LUNAR_DAY_MULTIPLIER = 0.25;

/** Multiplier a critical hit deals. */
export const CRIT_MULTIPLIER = 1.5;

/**
 * Fraction of a landed hit a `counter` status throws back at the attacker.
 */
export const COUNTER_REFLECT_FRACTION = 0.5;

/**
 * Lowest hit chance an attack may fall to.
 *
 * A roll of zero would never land, which reads as a broken action rather than
 * a hard one; five points is as bad as a shot gets.
 */
export const MIN_EFFECTIVE_ACCURACY = 5;

/**
 * First hour of the day, in the 24-hour clock.
 *
 * Before it, the world is in `night`; after {@link NIGHT_START_HOUR}, again.
 */
export const DAY_START_HOUR = 6;

/** Hour the sun goes down. */
export const NIGHT_START_HOUR = 18;

/**
 * How many of a unit's past turns are remembered.
 *
 * The timeline is what a `rewind` reads, so this is how far back one can go.
 */
export const MAX_REWIND_HISTORY = 12;

/** Feedback entries kept in `CombatState.log` before the oldest are dropped. */
export const MAX_LOG_ENTRIES = 200;

/**
 * Upgraded skill tiers: an entity may reference `[id]_II` … `[id]_V`, which is
 * the catalogue skill `[id]` rebalanced for level 2 … 5 (`[id]` alone = level 1).
 */
export const MAX_SKILL_LEVEL = 5;

/**
 * Power growth per level above 1 (level II = x1.15 … level V = x1.60).
 *
 * Power grows faster than cost so every tier is more mana-efficient than the
 * last — upgrading is never a downgrade — while the absolute cost growth below
 * keeps a rotated kit better than spamming a single skill.
 */
export const SKILL_LEVEL_POWER_GROWTH = 0.15;

/**
 * Mana/stamina growth per level above 1 (level II = x1.05 … level V = x1.20).
 *
 * Deliberately gentler than the power curve: efficiency still climbs ~9.5% per
 * level, but a level V skill costs 20% more per cast, so resource pools keep
 * cheaper skills relevant.
 */
export const SKILL_LEVEL_COST_GROWTH = 0.05;

/**
 * Extra cooldown turns bought every N levels above 1 (level III and IV add 1,
 * level V adds 2).
 *
 * The second lever against one-skill spam: the top tiers hit harder but cannot
 * be strung back-to-back, so the rest of the kit keeps earning its slots.
 * Level II is the pure upside tier — more power, no extra wait.
 */
export const SKILL_LEVEL_COOLDOWN_EVERY = 2;
