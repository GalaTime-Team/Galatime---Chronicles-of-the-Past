/**
 * Status effects and effective statistics.
 *
 * Owns everything an effect does to a unit: applying a `buff`/`debuff`, the
 * flat `heal`/`damage`/`resource_regen`/`resource_drain` fields, and ticking
 * durations. {@link effectiveStats} folds live effects into a stat block so a
 * caller never has to remember which effects are active.
 */

import type { AttackEffect } from '../../types/AttackDataType';
import type {
    CombatAction,
    CombatEffectInstance,
    CombatEvent,
    CombatRandom,
    CombatResourceId,
    CombatStatDelta,
    CombatStats,
    CombatUnit,
} from '../../types/CombatType';
import {
    asRecord,
    clamp,
    readBoolean,
    readNumber,
    readStatDelta,
    readString,
    readVariance,
} from '../../utils/combatUtils';

/**
 * Authored stat name (as written in YAML) to the runtime stat field(s).
 *
 * `attack`/`defense` cover both channels, so an authored status does not have to
 * know whether its owner fights physically or magically.
 */
const STAT_FIELDS: Record<string, Array<keyof CombatStats>> = {
    hp: ['maxHp'],
    mana: ['maxMana'],
    stamina: ['maxStamina'],
    max_hp: ['maxHp'],
    max_mana: ['maxMana'],
    max_stamina: ['maxStamina'],
    physical_attack: ['physicalAttack'],
    magical_attack: ['magicalAttack'],
    attack: ['physicalAttack', 'magicalAttack'],
    physical_defense: ['physicalDefense'],
    magical_defense: ['magicalDefense'],
    defense: ['physicalDefense', 'magicalDefense'],
    speed: ['speed'],
};

/** The `effect_applied` member of {@link CombatEvent}. */
export type EffectAppliedEvent = Extract<CombatEvent, { type: 'effect_applied' }>;

/** Adds a stat delta to a block, keeping every stat at or above zero. */
export function applyStatDelta(
    stats: CombatStats,
    delta: CombatStatDelta | null,
    sign: number,
): void {
    if (!delta) return;
    for (const [key, amount] of Object.entries(delta as Record<string, number>)) {
        for (const field of STAT_FIELDS[key] ?? []) {
            stats[field] = Math.max(0, stats[field] + sign * amount);
        }
    }
}

/** Scales a stat block by a multiplier delta, keeping every stat at or above zero. */
export function applyStatMultipliers(
    stats: CombatStats,
    multipliers: CombatStatDelta | null,
): void {
    if (!multipliers) return;
    for (const [key, factor] of Object.entries(multipliers as Record<string, number>)) {
        for (const field of STAT_FIELDS[key] ?? []) {
            stats[field] = Math.max(0, stats[field] * factor);
        }
    }
}

/** The runtime fields an authored stat name addresses. */
export function statFieldsFor(name: string): Array<keyof CombatStats> {
    return STAT_FIELDS[name] ?? [];
}

/**
 * Reads a named stat off a combatant, for the ability `stat` condition.
 *
 * `hp`/`mana`/`stamina` read the *current* pool — a condition asks "how much is
 * left", while a buff authored with the same name raises the *maximum*. A
 * multi-field name (`attack`) reports the average of its channels.
 */
export function readUnitStat(unit: CombatUnit, name: string): number | null {
    switch (name) {
        case 'hp':
            return unit.currentHp;
        case 'hp_percent': {
            const max = effectiveStats(unit).maxHp;
            return max > 0 ? unit.currentHp / max : 0;
        }
        case 'mana':
            return unit.currentMana;
        case 'stamina':
            return unit.currentStamina;
        default:
            break;
    }

    const fields = STAT_FIELDS[name];
    if (!fields || fields.length === 0) return null;

    const stats = effectiveStats(unit);
    const total = fields.reduce((sum, field) => sum + stats[field], 0);
    return total / fields.length;
}

/** Whether a named status (by id or by label) is live on the unit. */
export function hasStatusEffect(unit: CombatUnit, statusId: string): boolean {
    return unit.effects.some(
        (effect) => effect.effectId === statusId || effect.statusEffect === statusId,
    );
}

/** Action kinds every live status currently forbids (`silenced` blocks attacks). */
export function preventedActionKinds(unit: CombatUnit): string[] {
    const kinds: string[] = [];
    for (const effect of unit.effects) {
        if (effect.preventActions) kinds.push(...effect.preventActions);
    }
    return kinds;
}

/**
 * Whether a prevented-kinds list forbids an action.
 *
 * The reference schema names the kinds it forbids and uses `attack` as the
 * umbrella for offensive actions, so a `silenced` status stops both skills and
 * weapons while an explicit kind (`rest`, `defend`) stops only itself.
 */
export function isActionPrevented(action: CombatAction, prevented: readonly string[]): boolean {
    if (prevented.length === 0) return false;
    if (prevented.includes(action.kind)) return true;

    const offensive = action.kind === 'skill' || action.kind === 'weapon';
    return offensive && prevented.includes('attack');
}

/** A unit's stats with its live buffs and debuffs folded in. */
export function effectiveStats(unit: CombatUnit): CombatStats {
    const stats: CombatStats = { ...unit.stats };
    for (const effect of unit.effects) {
        applyStatDelta(stats, effect.buff, 1);
        applyStatDelta(stats, effect.debuff, -1);
        applyStatMultipliers(stats, effect.statMultipliers);
    }
    return stats;
}

/** Resolves an authored turn count; a `[min, max]` pair takes the longer side. */
function resolveTurns(raw: AttackEffect['turns']): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
    if (Array.isArray(raw) && raw.length >= 2) {
        const a = readNumber(raw[0], Number.NaN);
        const b = readNumber(raw[1], Number.NaN);
        if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(1, Math.round(Math.max(a, b)));
    }
    return null;
}

/** Chance the effect lands; defaults to certain. */
function effectChance(effect: AttackEffect): number {
    const record = asRecord(effect) ?? {};
    const raw = readNumber(record.effect_hit_chance, Number.NaN);
    const fallback = readNumber(record.apply_chance, Number.NaN);
    const value = Number.isFinite(raw) ? raw : Number.isFinite(fallback) ? fallback : 1;
    if (value <= 0) return 0;
    return clamp(value <= 1 ? value : value / 100, 0, 1);
}

/** Action kinds an authored effect forbids (`prevent_actions`), or `null`.
 *
 * Effects authored on skills and weapons use the same field as abilities, so a
 * `Stun` written on a weapon blocks attacks exactly like one written in an
 * ability (`silenced`-style gating in `combatService.actionAvailability`).
 */
function readPreventActions(effect: AttackEffect): string[] | null {
    const raw = asRecord(effect)?.prevent_actions;
    if (!Array.isArray(raw)) return null;
    const kinds = raw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
    return kinds.length > 0 ? kinds : null;
}

/** Scales every flat value of a stat delta (a weapon's output boost). */
export function scaleStatDelta(
    delta: CombatStatDelta | null,
    factor: number,
): CombatStatDelta | null {
    if (!delta || factor === 1) return delta;
    const scaled: Record<string, number> = {};
    for (const [key, value] of Object.entries(delta as Record<string, number>)) {
        scaled[key] = Math.round(value * factor * 10) / 10;
    }
    return scaled as CombatStatDelta;
}

/** Builds the runtime instance of an authored effect. */
export function createEffectInstance(
    effect: AttackEffect,
    sourceId: string,
    elementId: string | null,
    outputMultiplier = 1,
): CombatEffectInstance {
    return {
        effectId: readString(effect.effect_id, `${sourceId}_effect`),
        sourceId,
        statusEffect: readString(effect.status_effect, '') || null,
        elementId: readString(effect.element_id, '') || elementId,
        turns: resolveTurns(effect.turns),
        applyTo: readString(effect.apply_to, '') || null,
        buff: scaleStatDelta(readStatDelta(effect.buff), outputMultiplier),
        debuff: scaleStatDelta(readStatDelta(effect.debuff), outputMultiplier),
        statMultipliers: null,
        preventActions: readPreventActions(effect),
        damagePerTurn: Math.max(0, readNumber(asRecord(effect)?.damage_per_turn, 0)),
        stacks: 1,
        canStack: readBoolean(effect.can_stack, false),
    };
}

/**
 * Resolves which units an effect's `apply_to` scope addresses.
 *
 * `target` binds to the action's chosen target; the team scopes read the actor's
 * side. The actor is included in its own `allies_all`/`both_teams` scope.
 */
export function resolveEffectTargets(
    applyTo: string | null,
    actor: CombatUnit,
    primaryTarget: CombatUnit | null,
    units: readonly CombatUnit[],
): CombatUnit[] {
    const alive = units.filter((unit) => unit.status === 'alive');

    switch (applyTo ?? 'target') {
        case 'self':
            return alive.filter((unit) => unit.id === actor.id);
        case 'allies_all':
            return alive.filter((unit) => unit.side === actor.side);
        case 'enemies_all':
            return alive.filter((unit) => unit.side !== actor.side);
        case 'both_teams':
            return alive;
        case 'target':
        default:
            return primaryTarget ? [primaryTarget] : [];
    }
}

/** Applies one effect instance to a unit, returning the feedback event. */
export function applyEffectToUnit(
    unit: CombatUnit,
    effect: AttackEffect,
    sourceId: string,
    elementId: string | null,
    random: CombatRandom,
    outputMultiplier = 1,
): EffectAppliedEvent | null {
    const chance = effectChance(effect);
    if (chance < 1 && random() >= chance) return null;

    const instance = createEffectInstance(effect, sourceId, elementId, outputMultiplier);
    const existingIndex = unit.effects.findIndex((active) => active.effectId === instance.effectId);

    if (existingIndex >= 0 && !instance.canStack) {
        unit.effects[existingIndex] = instance;
    } else {
        unit.effects.push(instance);
    }

    return {
        type: 'effect_applied',
        unitId: unit.id,
        effectId: instance.effectId,
        statusEffect: instance.statusEffect,
        turns: instance.turns,
    };
}

/**
 * Decrements every timed effect on a unit, expiring the finished ones.
 *
 * A damaging status (`damage_per_turn`) pays out first, so a poison that kills
 * its host on the turn it ticks is recorded before the effect is reaped.
 */
export function tickUnitEffects(unit: CombatUnit): CombatEvent[] {
    const events: CombatEvent[] = [];
    const remaining: CombatEffectInstance[] = [];

    for (const effect of unit.effects) {
        if (effect.damagePerTurn > 0) {
            const amount = effect.damagePerTurn * Math.max(1, effect.stacks);
            events.push(...changeResource(unit, 'hp', -amount));
        }

        if (effect.turns === null) {
            remaining.push(effect);
            continue;
        }

        const turns = effect.turns - 1;
        if (turns <= 0) {
            events.push({ type: 'effect_expired', unitId: unit.id, effectId: effect.effectId });
            continue;
        }

        remaining.push({ ...effect, turns });
    }

    unit.effects = remaining;
    return events;
}

/**
 * Moves a unit's HP, mana or stamina by `delta`, clamped to `[0, max]`.
 *
 * Returns the feedback event, or an empty list when the pool was already at the
 * bound. Shared with the turn service so costs and rest both emit the same
 * `resource_changed` feedback the HUD animates.
 */
export function changeResource(
    unit: CombatUnit,
    resource: CombatResourceId,
    delta: number,
): CombatEvent[] {
    const stats = effectiveStats(unit);
    const max = resource === 'hp' ? stats.maxHp : resource === 'mana' ? stats.maxMana : stats.maxStamina;
    const previous = resource === 'hp'
        ? unit.currentHp
        : resource === 'mana'
            ? unit.currentMana
            : unit.currentStamina;

    const next = clamp(previous + delta, 0, max);
    if (next === previous) return [];

    // Paying out of mana/stamina (a cost, a drain, a cursed tax) breaks that
    // resource's idle streak, so the next turn's regen restarts from the floor.
    if (resource !== 'hp' && delta < 0) unit.resourceSpentSinceTurnStart[resource] = true;

    if (resource === 'hp') unit.currentHp = next;
    else if (resource === 'mana') unit.currentMana = next;
    else unit.currentStamina = next;

    return [{ type: 'resource_changed', unitId: unit.id, resource, previous, next }];
}

/**
 * Applies an effect's resource swing: flat damage, healing, regen and drain.
 *
 * Stat changes are handled by {@link effectiveStats}, so this only touches the
 * current HP/mana/stamina pools and emits the deltas.
 */
export function applyEffectResources(
    unit: CombatUnit,
    effect: AttackEffect,
    random: CombatRandom,
    outputMultiplier = 1,
): CombatEvent[] {
    const events: CombatEvent[] = [];
    const record = asRecord(effect) ?? {};

    const flatDamage = readNumber(effect.damage, 0);
    if (flatDamage > 0) {
        const variance = readVariance(effect.damage_variance) ?? [1, 1];
        const amount = Math.max(1, Math.round(flatDamage * (variance[0] + random() * (variance[1] - variance[0]))));
        events.push(...changeResource(unit, 'hp', -amount));
    }

    // Healing and regen are the holder's *own* output, so a weapon like the
    // Asclepius Wand boosts them; damage and drain are not touched.
    const heal = readNumber(record.heal, 0);
    if (heal > 0) events.push(...changeResource(unit, 'hp', Math.round(heal * outputMultiplier)));

    if (effect.resource_regen) {
        for (const [resource, value] of Object.entries(effect.resource_regen)) {
            const amount = readNumber(value, 0);
            if (amount > 0) events.push(...changeResource(unit, resource as CombatResourceId, Math.round(amount * outputMultiplier)));
            else if (amount !== 0) events.push(...changeResource(unit, resource as CombatResourceId, amount));
        }
    }

    if (effect.resource_drain) {
        for (const [resource, value] of Object.entries(effect.resource_drain)) {
            const amount = readNumber(value, 0);
            if (amount !== 0) events.push(...changeResource(unit, resource as CombatResourceId, -amount));
        }
    }

    return events;
}

/** Total healing an effect will produce, used to label an action as a heal. */
export function effectHeals(effect: AttackEffect): boolean {
    const record = asRecord(effect) ?? {};
    if (readNumber(record.heal, 0) > 0) return true;
    return readNumber(effect.resource_regen?.hp, 0) > 0;
}

/**
 * Revives a defeated unit at a percentage of its maximum HP.
 *
 * A living unit is left untouched, so a mis-aimed revive cannot be used to top
 * somebody up. Returns the resource feedback the caller logs.
 */
export function reviveUnit(unit: CombatUnit, hpPercent: number): CombatEvent[] {
    if (unit.status === 'alive') return [];

    const maxHp = effectiveStats(unit).maxHp;
    const restored = Math.max(1, Math.round((maxHp * clamp(hpPercent, 1, 100)) / 100));

    unit.status = 'alive';
    unit.defending = false;

    return changeResource(unit, 'hp', restored);
}

/**
 * Removes every live status from a unit.
 *
 * Returns one `effect_expired` per status, matching `tickUnitEffects`, so the log
 * reads the same whether a status ended by time or by a cleanse.
 */
export function clearUnitEffects(unit: CombatUnit): CombatEvent[] {
    const events: CombatEvent[] = unit.effects.map((effect) => ({
        type: 'effect_expired',
        unitId: unit.id,
        effectId: effect.effectId,
    }));

    unit.effects = [];
    return events;
}
