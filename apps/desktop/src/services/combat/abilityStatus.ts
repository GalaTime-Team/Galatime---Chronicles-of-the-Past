/**
 * Status abilities: `add_status`, `remove_status`, `dispel` and `prevent_action`.
 *
 * `add_status` is the reference schema's general-purpose effect — a named status
 * carrying stat changes, a damage-over-time and/or forbidden action kinds. It
 * reuses the skill catalogue's {@link CombatEffectInstance}, so a status applied
 * by an ability and one applied by a skill are the same thing at runtime.
 */

import type { AbilityDefinition, AbilityStacking, AbilityStatusEffect } from '../../types/AbilityType';
import type { CombatEffectInstance, CombatStatDelta, CombatUnit } from '../../types/CombatType';
import { asRecord, readNumber, readString } from '../../utils/combatUtils';
import { abilityEffectTurns } from './abilityDuration';
import { abilityNotFired } from './abilityResult';
import type { AbilityActionResult } from './abilityResult';
import type { EffectAppliedEvent } from './effectResolver';

/** Reads `parameters.effects[]` into additive deltas and multipliers. */
function readStatusEffects(raw: unknown, outputMultiplier = 1): {
    buff: CombatStatDelta | null;
    multipliers: CombatStatDelta | null;
} {
    if (!Array.isArray(raw)) return { buff: null, multipliers: null };

    const buff: Record<string, number> = {};
    const multipliers: Record<string, number> = {};

    for (const entry of raw) {
        const effect = asRecord(entry) as AbilityStatusEffect | null;
        if (!effect) continue;

        const stat = readString(effect.stat, '');
        const value = readNumber(effect.value, Number.NaN);
        if (!stat || !Number.isFinite(value)) continue;

        // A multiplicative factor stays as authored; a flat magnitude is the
        // holder's output and is scaled by its weapon (Asclepius Wand).
        if (effect.mode === 'multiply') multipliers[stat] = value;
        else buff[stat] = Math.round(value * outputMultiplier * 10) / 10;
    }

    return {
        buff: Object.keys(buff).length > 0 ? buff : null,
        multipliers: Object.keys(multipliers).length > 0 ? multipliers : null,
    };
}

/** The list of statuses a `remove_status`/`dispel` may look for. */
function readStatusId(definition: AbilityDefinition): string {
    return readString(definition.action.parameters?.status_id, '');
}

/** Reads a non-empty string list out of `parameters`. */
function readStringList(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const strings = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
    return strings.length > 0 ? strings : null;
}

/** Everything one status needs; both `add_status` and `prevent_action` build it. */
interface StatusSpec {
    statusId: string;
    label: string;
    turns: number | null;
    buff: CombatStatDelta | null;
    multipliers: CombatStatDelta | null;
    preventActions: string[] | null;
    damagePerTurn: number;
    stacks: number;
    stacking: AbilityStacking;
    sourceId: string;
}

/**
 * Writes a status onto a unit, honouring `stacking`:
 *
 * - `replace` (the default) overwrites the live status with the new one;
 * - `refresh` keeps it but resets its duration;
 * - `stack` adds a stack and takes the longer of the two durations;
 * - `ignore` leaves a live status completely untouched.
 *
 * Returns the feedback event, or `null` when `ignore` swallowed the write.
 */
function writeStatus(unit: CombatUnit, spec: StatusSpec): EffectAppliedEvent | null {
    const incoming: CombatEffectInstance = {
        effectId: spec.statusId,
        sourceId: spec.sourceId,
        statusEffect: spec.label,
        elementId: null,
        turns: spec.turns,
        applyTo: null,
        buff: spec.buff,
        debuff: null,
        statMultipliers: spec.multipliers,
        preventActions: spec.preventActions,
        damagePerTurn: spec.damagePerTurn,
        stacks: spec.stacks,
        canStack: spec.stacking === 'stack',
    };

    const index = unit.effects.findIndex((active) => active.effectId === spec.statusId);

    if (index < 0) {
        unit.effects.push(incoming);
    } else if (spec.stacking === 'ignore') {
        return null;
    } else if (spec.stacking === 'refresh') {
        unit.effects[index] = { ...unit.effects[index], turns: incoming.turns };
    } else if (spec.stacking === 'stack') {
        const current = unit.effects[index];
        const longest = Math.max(current.turns ?? incoming.turns ?? 0, incoming.turns ?? 0);
        unit.effects[index] = {
            ...incoming,
            stacks: current.stacks + incoming.stacks,
            turns: longest > 0 ? longest : null,
        };
    } else {
        unit.effects[index] = incoming;
    }

    return {
        type: 'effect_applied',
        unitId: unit.id,
        effectId: spec.statusId,
        statusEffect: spec.label,
        turns: spec.turns,
    };
}

/** Applies a status to each target that accepted it. */
function applyStatusToTargets(
    targets: readonly CombatUnit[],
    definition: AbilityDefinition,
    overrides: Partial<StatusSpec> = {},
    outputMultiplier = 1,
): AbilityActionResult {
    const statusId = overrides.statusId ?? readStatusId(definition);
    if (!statusId) return abilityNotFired();

    const parameters = definition.action.parameters ?? {};
    const { buff, multipliers } = readStatusEffects(parameters.effects, outputMultiplier);

    const spec: StatusSpec = {
        statusId,
        label: readString(parameters.status_label, '') || statusId,
        turns: abilityEffectTurns(definition),
        buff,
        multipliers,
        preventActions: readStringList(parameters.prevent_actions),
        damagePerTurn: Math.max(0, readNumber(parameters.damage_per_turn, 0)),
        stacks: Math.max(1, Math.round(readNumber(parameters.stacks, 1))),
        stacking: definition.action.stacking ?? 'replace',
        sourceId: definition.id,
        ...overrides,
    };

    const events: EffectAppliedEvent[] = [];
    const targetIds: string[] = [];

    for (const target of targets) {
        const applied = writeStatus(target, { ...spec, statusId });
        if (!applied) continue;
        events.push(applied);
        targetIds.push(target.id);
    }

    if (targetIds.length === 0) return abilityNotFired();
    return { fired: true, targetIds, events, appliedEffectIds: [statusId] };
}

/** `parameters.status_id` + `effects[]` + `prevent_actions[]` + `damage_per_turn`. */
export function addStatusAbility(
    targets: readonly CombatUnit[],
    definition: AbilityDefinition,
    outputMultiplier = 1,
): AbilityActionResult {
    return applyStatusToTargets(targets, definition, {}, outputMultiplier);
}

/**
 * `parameters.actions[]` — a status whose only job is to forbid action kinds.
 *
 * It is an `add_status` under the hood, so `silenced` from `prevent_action` and
 * `silenced` from an authored `add_status` are enforced by the same check.
 */
export function preventActionAbility(
    targets: readonly CombatUnit[],
    definition: AbilityDefinition,
): AbilityActionResult {
    const actions = readStringList(definition.action.parameters?.actions);
    if (!actions) return abilityNotFired();

    return applyStatusToTargets(targets, definition, {
        statusId: readStatusId(definition) || definition.id,
        preventActions: actions,
    });
}

/** `parameters.status_id` — drops that status wherever it is live on the target. */
export function removeStatusAbility(
    targets: readonly CombatUnit[],
    definition: AbilityDefinition,
): AbilityActionResult {
    const statusId = readStatusId(definition);
    if (!statusId) return abilityNotFired();

    const events: AbilityActionResult['events'] = [];
    const targetIds: string[] = [];

    for (const target of targets) {
        const before = target.effects.length;
        target.effects = target.effects.filter(
            (effect) => effect.effectId !== statusId && effect.statusEffect !== statusId,
        );
        if (target.effects.length === before) continue;

        events.push({ type: 'effect_expired', unitId: target.id, effectId: statusId });
        targetIds.push(target.id);
    }

    if (targetIds.length === 0) return abilityNotFired();
    return { fired: true, targetIds, events };
}

/** Strips every status effect from each target. */
export function dispelAbility(targets: readonly CombatUnit[]): AbilityActionResult {
    const events: AbilityActionResult['events'] = [];
    const targetIds: string[] = [];

    for (const target of targets) {
        if (target.effects.length === 0) continue;

        for (const effect of target.effects) {
            events.push({ type: 'effect_expired', unitId: target.id, effectId: effect.effectId });
        }

        target.effects = [];
        targetIds.push(target.id);
    }

    if (targetIds.length === 0) return abilityNotFired();
    return { fired: true, targetIds, events };
}
