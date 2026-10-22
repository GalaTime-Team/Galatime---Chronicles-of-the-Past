/**
 * Tunable numbers for the combat system.
 *
 * Everything a designer is likely to want to change lives here, so the rule
 * modules (`services/combat/*`) stay about structure instead of magic numbers.
 */

import type { CombatLine, CombatRange, DamageType } from '../types/CombatType';

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
 * round and spends this much per turn, so speed 20 acts once a round while
 * speed 60 acts three times. Lower it to make speed matter more sharply.
 */
export const SPEED_PER_TURN = 20;

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

/** Chance that `flee` escapes the fight outright. */
export const FLEE_CHANCE = 0.5;

/**
 * Multiplier a `solar` skill gets by day.
 *
 * Symmetric around ×1 (`SOLAR_NIGHT_MULTIPLIER` is its mirror), so a solar
 * skill is neutral across a full day and the *hour* only decides which branch
 * the holder wants to be holding.
 */
export const SOLAR_DAY_MULTIPLIER = 1.5;

/** Multiplier a `solar` skill gets at night. */
export const SOLAR_NIGHT_MULTIPLIER = 0.5;

/** Multiplier a critical hit deals. */
export const CRIT_MULTIPLIER = 1.75;

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
