/**
 * Types for the turn-based combat system.
 *
 * Two groups — `allies` and `enemies` — each deploy up to two battle lines,
 * `front` and `rear`. Damage, targeting, positioning and turn order are all
 * derived from this vocabulary, so it is shared by the services that own the
 * rules and by the presentation layer (`components/game/combat`).
 *
 * `front`/`rear` deliberately match `CombatFormationLaneId` so a `CombatState`
 * can be rendered by the formation HUD without a translation step.
 */

import type { AttackEffect, PublicAttack } from './AttackDataType';
import type { CombatAbilityInstance } from './AbilityType';
import type { AiProfile } from './AiType';
import type { Difficulty } from '../constants/DifficultyConstants';
import type { EntitiesData, WeaponEntry } from './EntityDataType';
import type { WeaponActionSpec, WeaponRuntimeState, WeaponStatDelta } from './WeaponType';

/** Which side of the battlefield a unit fights for. */
export type CombatSide = 'allies' | 'enemies';

/** Battle line. `front` trades blows; `rear` supports from a distance. */
export type CombatLine = 'front' | 'rear';

/** Damage channel. Picks the attack/defence stats a hit reads. */
export type DamageType = 'physical' | 'magical';

/**
 * Reach of an action.
 *
 * `short` cannot be used from the rear line and cannot reach the enemy rear
 * line; `medium` and `long` are unrestricted.
 */
export type CombatRange = 'short' | 'medium' | 'long';

export type CombatUnitStatus = 'alive' | 'defeated';

export type CombatPhase = 'active' | 'finished';

export type CombatOutcome = 'victory' | 'defeat' | 'fled';

export type CombatResourceId = 'hp' | 'mana' | 'stamina';

/**
 * Effective statistics of a combatant, in camelCase.
 *
 * The YAML catalogues name these in snake_case; {@link CombatStatDelta} keeps
 * the authored spelling so a buff can be copied straight from a skill file.
 */
export interface CombatStats {
    maxHp: number;
    maxMana: number;
    maxStamina: number;
    physicalAttack: number;
    magicalAttack: number;
    physicalDefense: number;
    magicalDefense: number;
    speed: number;
    /**
     * Outgoing accuracy modifier, in points.
     *
     * It changes how well the unit's *own* attacks land; it never makes the
     * unit easier to hit. The default `0` is a modifier, not a percentage: the
     * authored chance to hit lives on the action.
     */
    accuracy: number;
    /**
     * Incoming evasion modifier, in points.
     *
     * It makes the unit harder to hit — the mirror of {@link accuracy}.
     */
    evasion: number;
    /** Outgoing critical chance, in percent. */
    critChance: number;
}

/** A flat addition to a stat block, as authored in a skill `buff`/`debuff`. */
export interface CombatStatDelta {
    hp?: number;
    mana?: number;
    stamina?: number;
    physical_attack?: number;
    magical_attack?: number;
    physical_defense?: number;
    magical_defense?: number;
    speed?: number;
    accuracy?: number;
    evasion?: number;
    crit_chance?: number;
}

/**
 * How a status reads to the units that clean or dispel it.
 *
 * `positive` is a gift, `negative` a curse, `neutral` a control status that
 * only an explicit status id removes.
 */
export type CombatEffectPolarity = 'positive' | 'negative' | 'neutral';

/** Where a status moves its bearer, as authored by a `move` effect. */
export interface CombatMoveSpec {
    /** `self` moves the caster, `target` moves the unit the effect landed on. */
    who: 'self' | 'target';
    /** Destination line; `other` means "the line the bearer is not in". */
    toLine: 'front' | 'rear' | 'other';
    /** Trades places with the caster instead of just stepping across. */
    swapWithCaster: boolean;
}

/** How far back a `rewind` pulls its target, and what it restores. */
export interface CombatRewindSpec {
    /** How many of the target's own turns to undo; `null` means all of them. */
    turns: number | null;
    /** Which pools are restored. Empty means every pool. */
    resources: Array<'hp' | 'mana' | 'stamina'>;
    /** Whether the statuses of the rewound turns are undone too. */
    cleanse: boolean;
}

/**
 * One snapshot of a unit's past, kept so a `rewind` can undo it.
 *
 * The timeline is the unit's own: it records what it had at the start of each
 * of its turns, so rewinding is "go back to how things were N turns ago".
 */
export interface CombatTimelineEntry {
    /** The unit's turn count when the snapshot was taken. */
    turn: number;
    hp: number;
    mana: number;
    stamina: number;
    /** The statuses the unit carried at that moment. */
    effects: CombatEffectInstance[];
}

/** One live status effect on a unit. */
export interface CombatEffectInstance {
    effectId: string;
    /** Id of the action that applied the effect. */
    sourceId: string;
    /** Authored label (`Frozen`, `Wet`, …), or `null` for a pure stat change. */
    statusEffect: string | null;
    elementId: string | null;
    /** Remaining turns; `null` means "until combat ends". */
    turns: number | null;
    /** The authored `apply_to` scope, kept for display. */
    applyTo: string | null;
    /** Stat increases while the effect is live. */
    buff: CombatStatDelta | null;
    /** Stat decreases while the effect is live. */
    debuff: CombatStatDelta | null;
    /**
     * Stat multipliers while the effect is live (`{ physical_attack: 1.4 }`).
     *
     * Folded in after the flat buffs/debuffs, so `add_status` can express the
     * reference schema's `mode: multiply` without a second effect type.
     */
    statMultipliers: CombatStatDelta | null;
    /**
     * How the status reads to a cleanse or a dispel.
     *
     * Derived from the effect body (a debuff or a damage-over-time reads as
     * `negative`, a buff as `positive`), and overridable by the author.
     */
    polarity: CombatEffectPolarity;
    /** Resources the holder regains on each of the effect's turns. */
    regenPerTurn: CombatStatDelta | null;
    /** Resources the holder pays on each of the effect's turns. */
    selfUpkeep: CombatStatDelta | null;
    /** Health the holder pays on the turn after the effect lands. */
    deferredCost: CombatStatDelta | null;
    /** Status ids the holder cannot suffer while the effect lives. */
    immunities: string[] | null;
    /** Action kinds the effect forbids (`silenced` blocks attacks). */
    preventActions: string[] | null;
    /** The holder may not use skills while the effect lives. */
    preventSkills: boolean;
    /** The holder cannot be chosen as a target while the effect lives. */
    untargetable: boolean;
    /** The holder cannot be healed by anybody else while the effect lives. */
    healBlock: boolean;
    /** The holder reflects the next hit it takes. */
    counter: boolean;
    /** How many turns the effect shifts the holder's place in the order. */
    turnOffset: number;
    /** How many cooldown turns the effect takes off the holder's actions. */
    cooldownTick: number;
    /** Where the effect moves its bearer. */
    move: CombatMoveSpec | null;
    /** How far back the effect rewinds its bearer. */
    rewind: CombatRewindSpec | null;
    /** Flat damage the effect deals to its owner at the start of its turn. */
    damagePerTurn: number;
    /** How many copies are stacked; `1` when the effect does not stack. */
    stacks: number;
    canStack: boolean;
}

/** Remaining cooldown, in turns, keyed by action id. */
export type CombatCooldowns = Record<string, number>;

/** A living participant. Combat is simulated by mutating these. */
export interface CombatUnit {
    /** Unique within one combat, e.g. `allies_front_0_arthur`. */
    id: string;
    /** Catalogue id of the entity the unit was built from. */
    entityId: string;
    /** Which catalogue `entityId` names, so the view can resolve the unit's sprites. */
    entityType: CombatEntityType;
    name: string;
    side: CombatSide;
    line: CombatLine;
    /** Index within its own lane, used to stack the sprites in the HUD. */
    slot: number;
    isPlayerControlled: boolean;
    status: CombatUnitStatus;
    elementIds: string[];
    stats: CombatStats;
    currentHp: number;
    currentMana: number;
    currentStamina: number;
    /** How many times each trigger event has fired for this unit (`event_count`). */
    eventCounts: Record<string, number>;
    /** Free-form values recorded by `set_flag` and read by a `flag` condition. */
    flags: Record<string, unknown>;
    actions: CombatAction[];
    effects: CombatEffectInstance[];
    /** Abilities authored on the entity, with their per-fight state. */
    abilities: CombatAbilityInstance[];
    /**
     * The unit's resolved AI personality (weights, thresholds, targeting).
     *
     * Always present — a unit with no authored `ai:` block carries the balanced
     * default — so the decider never has to guess. Serialisable, like `abilities`.
     */
    aiProfile: AiProfile;
    /**
     * Damage channels the unit is immune to.
     *
     * Kept apart from `effects` because immunity is read by the damage chain
     * itself (a folded multiplier), not by `effectiveStats`.
     */
    immunities: DamageType[];
    /** How many of this unit's own turns have elapsed (`turn_count`). */
    turnCount: number;
    /** Consecutive turns each resource went unspent — drives the idle regen curve. */
    resourceIdleTurns: Record<Exclude<CombatResourceId, 'hp'>, number>;
    /** Whether each resource was paid out of since this unit's last turn began. */
    resourceSpentSinceTurnStart: Record<Exclude<CombatResourceId, 'hp'>, boolean>;
    cooldowns: CombatCooldowns;
    /** Set by the `defend` action; halves incoming damage until the next turn. */
    defending: boolean;
    /**
     * The equipped weapon's mutable state (durability, ammo, passive modifiers),
     * or `null` for a unit with no weapon. Cloned per unit; the action list is
     * shared, so per-holder state lives here rather than on the action.
     *
     * Always the `state` of the carried weapon that is equipped.
     */
    weapon: WeaponRuntimeState | null;
    /**
     * Every weapon the unit carries into the fight, equipped or not.
     *
     * Each entry keeps its own durability and ammo, so a weapon swapped out
     * mid-fight comes back with the wear it already took.
     */
    carriedWeapons: CarriedWeapon[];
    /**
     * The unit's recent past, one snapshot per turn.
     *
     * A `rewind` reads it to put the unit back the way it was, so the mechanic
     * needs no separate undo log.
     */
    timeline: CombatTimelineEntry[];
}

/**
 * One weapon a unit carries, with the pieces that become live when it is equipped.
 *
 * `actions`, `stats` and `abilities` are what equipping adds to the unit; `state`
 * is the holder's own durability and ammo for it.
 */
export interface CarriedWeapon {
    weaponId: string;
    state: WeaponRuntimeState;
    /** The weapon's swing (and throw) actions, added to the unit while equipped. */
    actions: CombatAction[];
    /** Stat modifiers applied while equipped. */
    stats: WeaponStatDelta | null;
    /** Passives merged into the unit while equipped. */
    abilities: CombatAbilityInstance[];
}

/** How a unit chooses what an action hits. */
export type CombatTargetRule =
    | 'enemy_one'
    | 'enemies_all'
    | 'allies_all'
    | 'self'
    | 'both_teams';

export type CombatActionKind =
    | 'skill'
    | 'weapon'
    | 'defend'
    | 'rest'
    | 'flee'
    | 'inventory'
    | 'switch_line';

export interface CombatActionCost {
    mana: number;
    stamina: number;
    /** Health the action takes from its own user. */
    hp: number;
    /** Turns the action stays unavailable after use. */
    cooldown: number;
}

/** A ready-to-use action, derived from a skill, a weapon or the universal list. */
export interface CombatAction {
    id: string;
    kind: CombatActionKind;
    name: string;
    description: string;
    elementId: string;
    damageType: DamageType;
    range: CombatRange;
    /** Authored power; `0` for actions that only heal or buff. */
    power: number;
    /** Hit chance as a percentage (`100` always hits). */
    accuracy: number;
    hitCount: number;
    costs: CombatActionCost;
    targeting: CombatTargetRule;
    effects: AttackEffect[];
    /** Multiplier range applied to each hit, e.g. `[0.8, 1.2]`. */
    damageVariance: [number, number] | null;
    /** `true` when the action deals direct damage. */
    dealsDamage: boolean;
    /** `true` when the action restores HP through an effect. */
    heals: boolean;
    /**
     * Per-swing weapon mechanics, when the action came from a weapon.
     *
     * Absent for skills and universal movements, so a weapon-only rule (extra
     * accuracy by range, exponential stacking, ammo) never fires on a skill.
     */
    weapon?: WeaponActionSpec;
    /**
     * The action bites harder by day (×1.5) and softer at night (×0.5).
     *
     * The flag is on the action, not on the effect, because a solar skill is
     * solar in every part of itself.
     */
    solar: boolean;
    /** The mirror of {@link solar}: ×1.5 at night, ×0.5 by day. */
    nocturnal: boolean;
    /** Base chance of a critical hit, in percent. */
    critChance: number;
    /** The hit always lands, whatever the accuracy roll would say. */
    ignoreAccuracy: boolean;
    /** Fraction of the target's defence the hit ignores (0 … 1). */
    defensePierce: number;
    /** Extra multipliers per element of the defender. */
    bonusVsElements: Record<string, number>;
    /** Extra multiplier against a target below a fraction of its health. */
    bonusVsHpBelow: { threshold: number; multiplier: number } | null;
    /** Health fraction below which the target panics and flees the fight. */
    fleeBelowHp: number | null;
    /** The status that guarantees a critical hit against its bearer. */
    guaranteedCritVsStatus: string | null;
}

/**Damage-channel modifiers folded from a defender's passive abilities.
 *
 * `multiplier` scales the damage (a big slime's gelatinous body leaves 10% of a
 * physical hit); `immune` voids it outright (`fire_cloak`). Both the real hit and
 * the HUD preview read the same value, so they can never disagree.
 */
export interface AttackModifier {
    /** Multiplier applied to the damage (`1` = unchanged). */
    multiplier: number;
    /** `true` when an ability makes the defender immune to the hit. */
    immune: boolean;
}

/**
 *  Everything the HUD needs to render one action slot for the active unit. */
export interface CombatActionPreview {
    action: CombatAction;
    usable: boolean;
    /** Why the action is unusable; `null` when `usable` is `true`. */
    reason: CombatErrorCode | null;
    /** Unit ids the action may be aimed at (empty for untargeted rules). */
    targetIds: string[];
}

/**
 * What one action would do to one target, worked out without rolling randomness.
 *
 * Backs the target preview: `hpDelta` is signed, so a positive number is health
 * the target stands to lose and a negative one is health it would gain back.
 * `elementMultiplier` is what turns the preview into an effectiveness reading.
 */
export interface CombatActionImpact {
    /** Health the target loses (positive) or gains (negative). */
    hpDelta: number;
    /** Which direction the health moves, so the HUD can colour the number. */
    kind: 'damage' | 'heal';
    /** `true` for previews, which never roll accuracy. */
    isHit: boolean;
    /** Hits counted (`1` for previews). */
    hits: number;
    /** Attack stat the action read from the attacker. */
    attackValue: number;
    /** Ability multiplier folded from the target's passive abilities (`1` = none). */
    attackMultiplier: number;
    /** `true` when an ability made the target immune to the hit. */
    immune: boolean;
    /** Defence stat the action read from the defender. */
    defenseValue: number;
    /** Authored power. */
    power: number;
    /** Damage channel the action uses. */
    damageType: DamageType;
    /** Efficacy of the action's element against this target (`x0` … `x4`). */
    elementMultiplier: number;
    /** Variance multiplier (`1` for previews, which do not roll). */
    variance: number;
    /** Lane modifier applied (`1`, `0.85` or `0.8`). */
    positionModifier: number;
    /** Reduction from the target bracing (`0` or `DEFEND_DAMAGE_REDUCTION`). */
    defenseReduction: number;
    /** One hit before the lane, bracing and variance steps. */
    baseDamage: number;
    /** Rounded damage applied across every hit. */
    finalDamage: number;
    /** Chance of a critical hit, in percent. */
    critChance: number;
    /** Chance of the hit landing, in percent (0 … 100). */
    hitChance: number;
}

/** Damage breakdown for one attacker/target pair. */
export interface AttackResolution {
    attackerId: string;
    targetId: string;
    actionId: string;
    /** `false` when every hit missed. */
    isHit: boolean;    /** Ability multiplier folded from the target's passive abilities (`1` = none). */
    attackMultiplier: number;
    /** `true` when an ability made the target immune to the hit. */
    immune: boolean;    /** How many hits landed. */
    hits: number;
    /** Attack stat the action read from the attacker. */
    attackValue: number;
    /** Defence stat the action read from the defender. */
    defenseValue: number;
    /** Authored power. */
    power: number;
    /** Damage channel the action used. */
    damageType: DamageType;
    /** Element efficacy taken from the shared element matrix. */
    elementMultiplier: number;
    /** Variance multiplier rolled for this action. */
    variance: number;
    /** Lane modifier (1, 0.85 or 0.8). */
    positionModifier: number;
    /** Damage reduction from the target bracing (0 when it is not). */
    defenseReduction: number;
    /** One hit before the lane, bracing and variance steps. */
    baseDamage: number;
    /** Final damage applied across every hit. */
    finalDamage: number;
    /** Chance of a critical hit, in percent. */
    critChance: number;
    /** `true` when at least one of the hits was critical. */
    isCrit: boolean;
    /** Chance of a hit landing, in percent. */
    hitChance: number;
    /** Target HP before the hit. */
    targetHpBefore: number;
    /** Target HP after the hit. */
    targetHpAfter: number;
    /** Status effects that were applied. */
    appliedEffectIds: string[];
}

/** Healing applied by one action to one target. */
export interface HealResolution {
    sourceId: string;
    targetId: string;
    actionId: string;
    amount: number;
    targetHpAfter: number;
}

/** A typed feedback message the presentation layer can animate. */
export type CombatEvent =
    | { type: 'combat_started'; round: number; order: string[] }
    | { type: 'turn_started'; unitId: string; round: number }
    | {
        type: 'action_used';
        actorId: string;
        actionId: string;
        actionName: string;
        kind: CombatActionKind;
        targetIds: string[];
    }
    | { type: 'attack_resolved'; resolution: AttackResolution }
    | { type: 'healed'; resolution: HealResolution }
    | {
        type: 'effect_applied';
        unitId: string;
        effectId: string;
        statusEffect: string | null;
        turns: number | null;
    }
    | { type: 'effect_expired'; unitId: string; effectId: string }
    /** A status the target could not suffer, because it is immune to it. */
    | { type: 'effect_resisted'; unitId: string; effectId: string; statusEffect: string | null }
    /**
     * A unit was rewound: its resources went back to what they were, and the
     * statuses of the rewound turns were undone.
     */
    | {
        type: 'unit_rewound';
        unitId: string;
        /** How many of the unit's turns were undone. */
        turns: number;
        restoredHp: number;
        restoredMana: number;
        restoredStamina: number;
        /** Statuses the rewind removed. */
        removedEffectIds: string[];
    }
    | { type: 'flee_attempted'; unitId: string; escaped: boolean }
    | {
        type: 'resource_changed';
        unitId: string;
        resource: CombatResourceId;
        previous: number;
        next: number;
    }
    | { type: 'unit_defeated'; unitId: string }
    /** A living rear-line unit stepped into its side's emptied front line. */
    | { type: 'unit_line_changed'; unitId: string; line: CombatLine; slot: number }
    /** An ability owned by `unitId` satisfied its trigger and condition. */
    | {
        type: 'ability_triggered';
        unitId: string;
        abilityId: string;
        abilityName: string;
        targetIds: string[];
    }
    /** `sourceId` brought `unitId` onto the field (a split or a summon). */
    | {
        type: 'unit_summoned';
        sourceId: string;
        unitId: string;
        entityId: string;
        name: string;
        side: CombatSide;
        line: CombatLine;
        slot: number;
    }
    /** The unit at `unitId` was replaced in place by another entity. */
    | { type: 'unit_transformed'; unitId: string; entityId: string; name: string }
    /** Part of a hit was thrown back at the attacker. */
    | {
        type: 'damage_reflected';
        sourceId: string;
        targetId: string;
        abilityId: string;
        abilityName: string;
        isHit: boolean;
        amount: number;
        targetHpAfter: number;
    }
    | { type: 'turn_ended'; unitId: string }
    /** A weapon on `unitId` lost durability (wear) or was repaired. */
    | {
        type: 'weapon_durability_changed';
        unitId: string;
        weaponId: string;
        previous: number;
        next: number;
    }
    /** A weapon reached 0 durability and was destroyed. */
    | { type: 'weapon_broken'; unitId: string; weaponId: string; weaponName: string }
    /** A unit switched its equipped weapon. Costs no turn. */
    | {
        type: 'weapon_equipped';
        unitId: string;
        weaponId: string;
        weaponName: string;
        previousWeaponId: string | null;
    }
    /** A ranged weapon spent (or kept) a unit of ammunition. */
    | {
        type: 'weapon_ammo_changed';
        unitId: string;
        itemId: string;
        consumed: boolean;
        remaining: number;
    }
    /** A defeated enemy dropped an item (a loot roll, boosted by a weapon). */
    | {
        type: 'loot_gained';
        itemId: string;
        itemName: string;
        quantity: number;
        sourceId: string;
    }
    | { type: 'combat_ended'; outcome: CombatOutcome; reason: string };

/**
 * Speed each unit has banked towards its next turn, keyed by unit id.
 *
 * The remainder left over after a round's turns are handed out carries into the
 * next round, so a speed that does not divide evenly still gets its share
 * (`30` against `20` yields 1 turn, then 2).
 */
export type CombatTurnGauges = Record<string, number>;

/** Whether the sun is up. Decides what `solar` and `nocturnal` skills are worth. */
export type CombatTimePhase = 'day' | 'night';

/** The serializable shape of a fight. The frontend renders this directly. */
export interface CombatState {
    sessionId: string;
    encounterId: string;
    encounterName: string;
    round: number;
    /** Index into {@link CombatState.order}. */
    turnIndex: number;
    /**
     * The hour of the day the fight happens at.
     *
     * Taken from the world clock when the fight opens, and fixed for its whole
     * duration — the sun does not move while two people are hitting each other.
     */
    hour: number;
    /** Whether the sun is up, derived from {@link CombatState.hour}. */
    timePhase: CombatTimePhase;
    /**
     * Turn queue for the current round, fastest first.
     *
     * A unit that acts several times in a round appears several times, so the
     * queue is rebuilt at every round boundary from the units still standing.
     */
    order: string[];
    /** Speed banked per unit, carried between rounds. */
    turnGauges: CombatTurnGauges;
    units: CombatUnit[];
    phase: CombatPhase;
    outcome: CombatOutcome | null;
    /** Most recent feedback, oldest first, capped while the fight runs. */
    log: CombatEvent[];
}

/** Result of advancing the fight by one action. */
export interface CombatTurnResult {
    state: CombatState;
    /** Only the events produced by this step. */
    events: CombatEvent[];
    outcome: CombatOutcome | null;
}

/** How an encounter member is loaded from the entity catalogues. */
export type CombatEntityType = 'character' | 'mob';

export interface CombatEncounterMember {
    /** File id in `data/entities/characters` or `data/entities/mobs`. */
    entityId: string;
    entityType: CombatEntityType;
    line: CombatLine;
    /** Marks the unit as played by the player rather than the AI. */
    isPlayerControlled?: boolean;
    /** Display override (a "Corrupted Slime" that is still `slime.yaml`). */
    name?: string;
    /** Max-HP override for bosses and scaled encounters. */
    hp?: number;
    /**
     * What this member carries into the fight, item id to quantity.
     *
     * When set, it replaces the entity store as the source of the unit's opening
     * inventory — the Test Playground declares stock per fight this way. When
     * absent, the store (with the entity YAML as first-time fallback) is read.
     */
    inventory?: Record<string, number>;
    /**
     * Catalogue weapon ids the member carries into the fight; the first is equipped.
     *
     * When absent, the entity's own weapon is used. An empty list fights unarmed.
     */
    weapons?: string[];
}

/** An authored fight: who stands where. */
export interface CombatEncounter {
    id: string;
    name: string;
    description?: string;
    /**
     * Forces the phase of the fight, ignoring the world clock's hour.
     *
     * Left out, the fight takes the hour of the day it starts at.
     */
    timePhase?: CombatTimePhase;
    allies: CombatEncounterMember[];
    enemies: CombatEncounterMember[];
}

/** One action request from the HUD. */
export interface CombatActionRequest {
    actionId: string;
    /** Required for `enemy_one`; ignored otherwise. */
    targetId?: string;
    /** Item id when the action is `inventory`. */
    itemId?: string;
}

/**
 * Element efficacy lookup, precomputed once per combat.
 *
 * `defenseScores[targetElementId][offensiveElementId]` is the RAW defensive
 * score the shared element matrix gives one target element against one
 * offensive element. Raw scores are stored (not multipliers) so a multi-element
 * defender can sum its elements before the total is mapped once.
 */
export interface CombatElementIndex {
    defenseScores: Record<string, Record<string, number>>;
}

/** Injectable randomness so turns can be replayed deterministically in tests. */
export type CombatRandom = () => number;

/** Stable error codes, safe to branch on in the presentation layer. */
export type CombatErrorCode =
    | 'encounter_not_found'
    | 'encounter_invalid'
    | 'session_not_found'
    | 'session_finished'
    | 'unit_not_found'
    | 'not_your_turn'
    | 'action_not_found'
    | 'action_unavailable'
    | 'target_required'
    | 'target_invalid'
    | 'out_of_range'
    | 'insufficient_mana'
    | 'insufficient_stamina'
    | 'out_of_ammo'
    | 'action_on_cooldown'
    | 'item_not_found'
    | 'item_not_usable'
    | 'item_not_usable_in_combat'
    | 'item_not_usable_outside_combat'
    | 'insufficient_quantity'
    | 'entity_not_found'
    | 'invalid_quantity'
    | 'inventory_full'
    | 'weapon_not_found'
    | 'weapon_already_equipped'
    | 'weapon_broken'
    | 'not_implemented';

/** A failure the caller can act on. Technical detail stays in the logs. */
export interface CombatError {
    code: CombatErrorCode;
    message: string;
    details?: Record<string, unknown>;
}

/** Discriminated result used instead of throwing across the API boundary. */
export type CombatResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: CombatError };

/** Options accepted when a fight is started. */
export interface StartCombatOptions {
    /** Replaces the encounter file (scripted fights, tests). */
    encounter?: CombatEncounter;
    /** Deterministic randomness. Defaults to `Math.random`. */
    random?: CombatRandom;
    /**
     * The hour of the day the fight happens at.
     *
     * Defaults to the world clock's hour. The fight keeps this hour for its
     * whole duration.
     */
    hour?: number;
    /**
     * Forces the phase, ignoring the hour.
     *
     * For the few fights that happen at a fixed time (a duel under the moon,
     * a test), where the hour itself does not matter.
     */
    timePhase?: CombatTimePhase;
    /**
     * Whether the fight's inventories are written back to the entity store when it
     * ends. On by default, so the game's items survive a battle; the Test
     * Playground turns it off, because its entities exist for one fight only.
     */
    persistInventories?: boolean;
    /**
     * How well the opponents play. Modulates the AI only (noise, switched-off
     * considerations, thresholds), never the combat rules. Defaults to `normal`.
     */
    difficulty?: Difficulty;
}

/** Re-exported so consumers of the combat types need one import. */
export type { EntitiesData, PublicAttack, WeaponEntry };
