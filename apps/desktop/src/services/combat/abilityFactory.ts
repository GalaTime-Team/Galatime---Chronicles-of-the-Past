/**
 * Ability normaliser.
 *
 * The entity YAML behind `abilities:` is untyped, so this module is the single
 * place that turns an authored entry into the typed {@link AbilityDefinition}
 * the engine reads. Everything downstream can then trust its shape — the engine
 * never has to guess whether `trigger.event` is a string or a nested object.
 *
 * Malformed entries are dropped rather than defaulted into nonsense: an ability
 * with no `id`, no recognised `trigger.event` or no recognised `action.type`
 * cannot do anything useful, and a silent skip beats a fight that throws.
 */

import type {
    AbilityAction,
    AbilityActionTarget,
    AbilityActionType,
    AbilityComparisonOperator,
    AbilityCondition,
    AbilityDefinition,
    AbilityDisplay,
    AbilityDuration,
    AbilityDurationType,
    AbilityStacking,
    AbilityStatTarget,
    AbilityTrigger,
    AbilityTriggerEvent,
    AbilityTriggerScope,
    CombatAbilityInstance,
} from '../../types/AbilityType';
import { asRecord, readChance, readNumber, readString } from '../../utils/combatUtils';

const TRIGGER_EVENTS: readonly AbilityTriggerEvent[] = [
    'battle_start',
    'turn_start',
    'turn_end',
    'before_attack',
    'after_attack',
    'before_damage',
    'after_damage',
    'on_attack',
    'on_hit',
    'on_miss',
    'on_death',
    'on_status_applied',
    'on_status_removed',
    'on_transform',
    'manual',
];

const TRIGGER_SCOPES: readonly AbilityTriggerScope[] = ['self', 'attacker', 'defender', 'ally', 'enemy', 'battle'];

const ACTION_TYPES: readonly AbilityActionType[] = [
    'modify_damage',
    'modify_durability',
    'add_status',
    'remove_status',
    'modify_stat',
    'set_immunity',
    'reflect_damage',
    'transform',
    'summon',
    'deal_damage',
    'heal',
    'dispel',
    'set_flag',
    'execute_ability',
    'prevent_action',
];

const ACTION_TARGETS: readonly AbilityActionTarget[] = [
    'self',
    'attacker',
    'defender',
    'source',
    'target',
    'allies',
    'enemies',
    'battle',
];

const STACKING_VALUES: readonly AbilityStacking[] = ['replace', 'refresh', 'stack', 'ignore'];

const STAT_TARGETS: readonly AbilityStatTarget[] = ['self', 'attacker', 'defender', 'source', 'target'];

const DURATION_TYPES: readonly AbilityDurationType[] = [
    'instant',
    'turns',
    'until_death',
    'until_battle_end',
    'permanent',
];

const COMPARISON_OPERATORS: readonly AbilityComparisonOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];

const DAMAGE_TYPES: readonly string[] = ['physical', 'magical', 'true', 'any'];

function isOneOf<T extends string>(allowed: readonly T[], value: string): value is T {
    return (allowed as readonly string[]).includes(value);
}

/** Reads an optional list of non-empty strings. */
function readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const strings = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
    return strings.length > 0 ? strings : undefined;
}

/** Reads a comparison operator, defaulting to `eq`. */
function readOperator(value: unknown): AbilityComparisonOperator {
    const operator = readString(value, 'eq');
    return isOneOf(COMPARISON_OPERATORS, operator) ? operator : 'eq';
}

function normalizeConditionList(value: unknown): AbilityCondition[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const conditions = value
        .map((entry) => normalizeCondition(entry))
        .filter((entry): entry is AbilityCondition => entry !== null);
    return conditions.length > 0 ? conditions : undefined;
}

function normalizeCondition(raw: unknown): AbilityCondition | null {
    const record = asRecord(raw);
    if (!record) return null;

    const condition: AbilityCondition = {};

    const all = normalizeConditionList(record.all);
    if (all) condition.all = all;

    const any = normalizeConditionList(record.any);
    if (any) condition.any = any;

    const not = normalizeCondition(record.not);
    if (not) condition.not = not;

    if (record.chance !== undefined) condition.chance = readChance(record.chance, 1);

    const damage = asRecord(record.damage);
    if (damage) {
        const type = readString(damage.type, 'any');
        condition.damage = {
            type: isOneOf(DAMAGE_TYPES, type) ? (type as NonNullable<AbilityCondition['damage']>['type']) : 'any',
            operator: readOperator(damage.operator),
        };
    }

    const element = asRecord(record.element);
    if (element) {
        const id = readString(element.id, '');
        if (id) condition.element = { id, operator: readOperator(element.operator) };
    }

    const turnCount = asRecord(record.turn_count);
    if (turnCount) {
        condition.turn_count = {
            operator: readOperator(turnCount.operator),
            value: readNumber(turnCount.value, 0),
        };
    }

    const eventCount = asRecord(record.event_count);
    if (eventCount) {
        condition.event_count = {
            event: readString(eventCount.event, ''),
            operator: readOperator(eventCount.operator),
            value: readNumber(eventCount.value, 0),
        };
    }

    const stat = asRecord(record.stat);
    if (stat) {
        const name = readString(stat.name, '');
        if (name) {
            const target = readString(stat.target, 'self');
            condition.stat = {
                target: isOneOf(STAT_TARGETS, target) ? target : 'self',
                name,
                operator: readOperator(stat.operator),
                value: readNumber(stat.value, 0),
            };
        }
    }

    const attack = asRecord(record.attack);
    if (attack) {
        const type = readString(attack.type, 'any');
        condition.attack = {
            type: type === 'physical' || type === 'magical' ? type : 'any',
            operator: readOperator(attack.operator),
        };
    }

    const status = asRecord(record.status);
    if (status) {
        const id = readString(status.id, '');
        if (id) {
            const target = readString(status.target, 'self');
            condition.status = {
                target: isOneOf(STAT_TARGETS, target) ? target : 'self',
                id,
                present: typeof status.present === 'boolean' ? status.present : true,
            };
        }
    }

    const targetCount = asRecord(record.target_count);
    if (targetCount) {
        const side = readString(targetCount.side, 'all');
        condition.target_count = {
            side: side === 'allies' || side === 'enemies' ? side : 'all',
            operator: readOperator(targetCount.operator),
            value: readNumber(targetCount.value, 0),
        };
    }

    const flag = asRecord(record.flag);
    if (flag) {
        const id = readString(flag.id, '');
        if (id) condition.flag = { id, value: flag.value };
    }

    return Object.keys(condition).length > 0 ? condition : null;
}

function normalizeTrigger(raw: unknown): AbilityTrigger | null {
    const record = asRecord(raw);
    if (!record) return null;

    const event = readString(record.event, '');
    if (!isOneOf(TRIGGER_EVENTS, event)) return null;

    const trigger: AbilityTrigger = { event };

    const scope = readString(record.scope, '');
    if (isOneOf(TRIGGER_SCOPES, scope)) trigger.scope = scope;

    if (typeof record.once === 'boolean') trigger.once = record.once;

    const turns = readNumber(asRecord(record.cooldown)?.turns, 0);
    if (turns > 0) trigger.cooldown = { turns };

    return trigger;
}

function normalizeAction(raw: unknown): AbilityAction | null {
    const record = asRecord(raw);
    if (!record) return null;

    const type = readString(record.type, '');
    if (!isOneOf(ACTION_TYPES, type)) return null;

    const action: AbilityAction = { type };

    const target = readString(record.target, '');
    if (isOneOf(ACTION_TARGETS, target)) action.target = target;

    const parameters = asRecord(record.parameters);
    if (parameters) action.parameters = parameters;

    if (record.chance !== undefined) action.chance = readChance(record.chance, 1);

    const duration = normalizeDuration(record.duration);
    if (duration) action.duration = duration;

    const stacking = readString(record.stacking, '');
    if (isOneOf(STACKING_VALUES, stacking)) action.stacking = stacking;

    return action;
}

function normalizeDuration(raw: unknown): AbilityDuration | undefined {
    const record = asRecord(raw);
    if (!record) return undefined;

    const duration: AbilityDuration = {};

    const type = readString(record.type, '');
    if (isOneOf(DURATION_TYPES, type)) duration.type = type;

    const value = readNumber(record.value, Number.NaN);
    if (Number.isFinite(value)) duration.value = value;

    return Object.keys(duration).length > 0 ? duration : undefined;
}

function normalizeDisplay(raw: unknown): AbilityDisplay | undefined {
    const record = asRecord(raw);
    if (!record) return undefined;

    const display: AbilityDisplay = {};
    if (typeof record.visible === 'boolean') display.visible = record.visible;

    const summary = readString(record.summary, '');
    if (summary) display.summary = summary;

    const icon = readString(record.icon, '');
    if (icon) display.icon = icon;

    const priority = readNumber(record.priority, Number.NaN);
    if (Number.isFinite(priority)) display.priority = priority;

    return Object.keys(display).length > 0 ? display : undefined;
}

/** Turns one authored entry into a definition, or `null` when it is unusable. */
export function normalizeAbilityDefinition(raw: unknown): AbilityDefinition | null {
    const record = asRecord(raw);
    if (!record) return null;

    const id = readString(record.id, readString(record.ability_name, ''));
    const trigger = normalizeTrigger(record.trigger);
    const action = normalizeAction(record.action);
    if (!id || !trigger || !action) return null;

    const display = normalizeDisplay(record.display);
    const definition: AbilityDefinition = {
        id,
        name: readString(record.name, id),
        description: readString(record.description, readString(display?.summary, '')),
        trigger,
        action,
    };

    const tags = readStringArray(record.tags);
    if (tags) definition.tags = tags;

    if (typeof record.enabled === 'boolean') definition.enabled = record.enabled;

    const priority = readNumber(record.priority, Number.NaN);
    if (Number.isFinite(priority)) definition.priority = priority;
    else if (display?.priority !== undefined) definition.priority = display.priority;

    const condition = normalizeCondition(record.condition);
    if (condition) definition.condition = condition;

    const duration = normalizeDuration(record.duration);
    if (duration) definition.duration = duration;

    if (display) definition.display = display;

    return definition;
}

/**
 * Normalises an entity's `abilities:` list into runtime instances.
 *
 * Disabled abilities are dropped here, so the engine can treat every instance it
 * sees as live. Instances start with no trigger history and no cooldown.
 */
export function createAbilityInstances(raw: unknown): CombatAbilityInstance[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((entry) => normalizeAbilityDefinition(entry))
        .filter((definition): definition is AbilityDefinition => definition !== null)
        .filter((definition) => definition.enabled !== false)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
        .map((definition) => ({ definition, triggered: false, cooldownRemaining: 0 }));
}

/**
 * The entity an ability brings onto the field, when it declares one.
 *
 * Only `summon` and `transform` name an entity; the blueprint pre-loader and the
 * two actions themselves read it through this one function so the parameter
 * names never drift apart.
 */
export function readAbilityEntityTarget(
    definition: AbilityDefinition,
): { entityId: string; entityType: 'mob' | 'character' } | null {
    const { type, parameters } = definition.action;
    if (type !== 'summon' && type !== 'transform') return null;

    const entityId = readString(parameters?.entity_id, '');
    if (!entityId) return null;

    const entityType = readString(parameters?.entity_type, 'mob');
    return { entityId, entityType: entityType === 'character' ? 'character' : 'mob' };
}
