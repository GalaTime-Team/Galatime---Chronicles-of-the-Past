/**
 * Authored monster abilities.
 *
 * An ability is data, not an action: it has a `trigger` (when it is considered),
 * a `condition` (whether it fires) and an `action` (what it does once it fires).
 *
 * This is the *authored* shape, written inline in the entity YAML
 * (`data/entities/{characters,mobs}/*.yaml` → `abilities:`). The runtime
 * projection a fight carries lives on `CombatUnit.abilities` as a
 * {@link CombatAbilityInstance}, which pairs the definition with the per-fight
 * state it accumulates (`triggered`, `cooldownRemaining`).
 *
 * The vocabulary mirrors `docs/abilities/HABILIDADES_EXEMPLO.md`. Two entries of
 * that schema are deliberately absent because the game has no system behind them
 * yet: `modify_durability` is a no-op (there is no durability), and the
 * `charges` fields (`trigger.cooldown.charges`, `duration.type: charges`,
 * `duration.refresh_on_trigger`) are not modelled — re-application is expressed
 * with `action.stacking` instead.
 */

import type { DamageType } from './CombatType';

/** Events that start an ability evaluation. */
export type AbilityTriggerEvent =
    /** Once per unit, when the fight opens. */
    | 'battle_start'
    /** At the start of the unit's own turn. */
    | 'turn_start'
    /** At the end of the unit's own turn. */
    | 'turn_end'
    /** Before the unit's own action resolves. */
    | 'before_attack'
    /** After the unit's own action resolves. */
    | 'after_attack'
    /** Folded into the damage a hit would deal, before it lands (passive). */
    | 'before_damage'
    /** Fired after a hit landed on the unit that owns the ability. */
    | 'after_damage'
    /** When the unit's own attack resolves, whatever the outcome. */
    | 'on_attack'
    /** When the unit's own attack lands. */
    | 'on_hit'
    /** When the unit's own attack misses. */
    | 'on_miss'
    /** Fired when the unit is defeated. */
    | 'on_death'
    /** When a status effect is applied to the unit. */
    | 'on_status_applied'
    /** When a status effect wears off the unit. */
    | 'on_status_removed'
    /** When the unit is replaced by another entity. */
    | 'on_transform'
    /** Fired only by `execute_ability`, never by the turn loop. */
    | 'manual';

/**
 * Whom the trigger refers to, relative to the unit that owns the ability.
 *
 * It supplies the action's default target: `after_damage` + `scope: self`
 * reacts to damage the owner *took*, while the same event + `scope: attacker`
 * reacts to damage the owner *dealt*.
 */
export type AbilityTriggerScope = 'self' | 'attacker' | 'defender' | 'ally' | 'enemy' | 'battle';

/** Comparison operators shared by the numeric/enum conditions. */
export type AbilityComparisonOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

/** Which combatant a condition reads, relative to the ability's owner. */
export type AbilityStatTarget = 'self' | 'attacker' | 'defender' | 'source' | 'target';

export interface AbilityTriggerCooldown {
    /** Own turns the ability waits before it may fire again. */
    turns?: number;
}

export interface AbilityTrigger {
    event: AbilityTriggerEvent;
    /** Default target of the action; `self` when omitted. */
    scope?: AbilityTriggerScope;
    /** When `true`, the ability may fire only once per combat. */
    once?: boolean;
    cooldown?: AbilityTriggerCooldown;
}

/**
 * When an ability fires.
 *
 * `all`/`any`/`not` nest freely. Every other field is a leaf test; when several
 * leaves sit side by side they must all hold (implicit `all`).
 */
export interface AbilityCondition {
    all?: AbilityCondition[];
    any?: AbilityCondition[];
    not?: AbilityCondition;
    /** Probability the ability fires; `1` (default) is certain. */
    chance?: number;
    /** Compares how many times `event` has already happened to the owner. */
    event_count?: {
        event?: string;
        operator?: AbilityComparisonOperator;
        value?: number;
    };
    /** Compares one of a combatant's stats (`hp_percent`, `attack`, `speed`, …). */
    stat?: {
        target?: AbilityStatTarget;
        name?: string;
        operator?: AbilityComparisonOperator;
        value?: number;
    };
    /** Compares the damage channel of the incoming hit. */
    damage?: {
        type?: DamageType | 'true' | 'any';
        operator?: AbilityComparisonOperator;
    };
    /** Compares the channel of the unit's own attack (the `on_hit` family). */
    attack?: {
        type?: 'physical' | 'magical' | 'any';
        operator?: AbilityComparisonOperator;
    };
    /** Checks whether a named status is present (or absent). */
    status?: {
        target?: AbilityStatTarget;
        id?: string;
        present?: boolean;
    };
    /** Compares how many living units a side has. */
    target_count?: {
        side?: 'allies' | 'enemies' | 'all';
        operator?: AbilityComparisonOperator;
        value?: number;
    };
    /** Compares a flag recorded earlier by `set_flag`. */
    flag?: {
        id?: string;
        value?: unknown;
    };
    /** Compares the element of the incoming hit. */
    element?: {
        id?: string;
        operator?: AbilityComparisonOperator;
    };
    /** Compares how many of the unit's own turns have elapsed. */
    turn_count?: {
        operator?: AbilityComparisonOperator;
        value?: number;
    };
}

/** What an ability does once its trigger and condition are satisfied. */
export type AbilityActionType =
    /** Scales the damage an incoming attack deals (passive). */
    | 'modify_damage'
    /** Authored by the reference schema; a no-op (there is no durability system). */
    | 'modify_durability'
    /** Applies (or refreshes) a status effect. */
    | 'add_status'
    /** Removes a status effect from the target by id. */
    | 'remove_status'
    /** Applies a flat stat change for a duration. */
    | 'modify_stat'
    /** Makes the unit immune to a damage channel. */
    | 'set_immunity'
    /** Deals part of an incoming hit back to the attacker. */
    | 'reflect_damage'
    /** Replaces the unit with another entity. */
    | 'transform'
    /** Adds units to the battlefield. */
    | 'summon'
    /** Deals flat damage to a target. */
    | 'deal_damage'
    /** Restores flat health to a target. */
    | 'heal'
    /** Strips every status effect from a target. */
    | 'dispel'
    /** Records a per-unit flag other abilities can read. */
    | 'set_flag'
    /** Fires another of the owner's abilities, as `manual`. */
    | 'execute_ability'
    /** Applies a status that forbids the target from using given action kinds. */
    | 'prevent_action';

/** Whom an ability action addresses. */
export type AbilityActionTarget =
    | 'self'
    | 'attacker'
    | 'defender'
    | 'source'
    | 'target'
    | 'allies'
    | 'enemies'
    | 'battle';

/** How a status behaves when applied on top of itself. */
export type AbilityStacking = 'replace' | 'refresh' | 'stack' | 'ignore';

/** How long an applied effect lasts. */
export type AbilityDurationType =
    | 'instant'
    | 'turns'
    | 'until_death'
    | 'until_battle_end'
    | 'permanent';

export interface AbilityDuration {
    type?: AbilityDurationType;
    /** Turn count, when `type` is `turns`. */
    value?: number;
}

/**
 * One line of an `add_status` effect list.
 *
 * `mode: add` folds `value` into the stat (a flat buff); `mode: multiply` scales
 * it (a 1.4x attack buff). Only `modify_stat` is authored today.
 */
export interface AbilityStatusEffect {
    type?: 'modify_stat';
    stat?: string;
    mode?: 'add' | 'multiply';
    value?: number;
}

export interface AbilityAction {
    type: AbilityActionType;
    /** Defaults to the trigger's `scope` (itself `self`). */
    target?: AbilityActionTarget;
    /** Action-specific values; the action type decides which are read. */
    parameters?: Record<string, unknown>;
    /** Probability the action applies; `1` (default) is certain. */
    chance?: number;
    /** Lifetime of the effect the action applies; falls back to the ability's own. */
    duration?: AbilityDuration;
    /** How an applied status behaves on re-application (default `replace`). */
    stacking?: AbilityStacking;
}

/** How the ability advertises itself to the HUD. */
export interface AbilityDisplay {
    /** `false` hides it from the formation tooltip. */
    visible?: boolean;
    /** Short line for a compact surface; falls back to `description`. */
    summary?: string;
    icon?: string;
    priority?: number;
}

/** One ability as authored in an entity YAML. */
export interface AbilityDefinition {
    id: string;
    name: string;
    description: string;
    tags?: string[];
    enabled?: boolean;
    /** Higher priority is evaluated first when several abilities fire together. */
    priority?: number;
    trigger: AbilityTrigger;
    condition?: AbilityCondition;
    action: AbilityAction;
    duration?: AbilityDuration;
    display?: AbilityDisplay;
}

/** A unit's ability plus the per-fight state it accumulates. */
export interface CombatAbilityInstance {
    definition: AbilityDefinition;
    /** `true` once a `trigger.once` ability has fired. */
    triggered: boolean;
    /** Own turns left before the ability may fire again. */
    cooldownRemaining: number;
}

/** The display projection the formation tooltip renders. */
export interface AbilityDisplayEntry {
    id: string;
    name: string;
    description: string;
}
