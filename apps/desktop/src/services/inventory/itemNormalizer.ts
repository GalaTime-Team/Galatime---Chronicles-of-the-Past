/**
 * Item catalogue normaliser.
 *
 * Translates the authored YAML of `data/items/items.yaml` into the runtime
 * {@link ItemDefinition} shape. Every field is read through a tolerant
 * normaliser, so a typo in the catalogue degrades to a documented default rather
 * than leaking `undefined` into a fight.
 *
 * Single Responsibility: this module only translates authored data. Loading the
 * file lives in `itemService`; the authoring checks live in `itemValidator`.
 */

import type {
    ItemCategory,
    ItemDefinition,
    ItemEffect,
    ItemEffectType,
    ItemResourceId,
    ItemTargetRule,
} from '../../types/InventoryType';
import {
    asRecord,
    readBoolean,
    readNumber,
    readStatDelta,
    readString,
} from '../../utils/combatUtils';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Item categories, in the authored vocabulary. */
export const ITEM_CATEGORIES: readonly ItemCategory[] = [
    'consumable',
    'throwable',
    'buff',
    'debuff',
    'key_item',
];

/** Item target scopes, in the authored vocabulary. */
export const ITEM_TARGET_RULES: readonly ItemTargetRule[] = [
    'self',
    'one_ally',
    'one_enemy',
    'all_allies',
    'all_enemies',
    'both_teams',
    'dead_ally',
];

/** Everything an item effect can do. */
export const ITEM_EFFECT_TYPES: readonly ItemEffectType[] = [
    'restore',
    'restore_percent',
    'damage',
    'status',
    'revive',
    'cleanse',
    'drain',
    'mystery',
];

/** Pools an effect may restore. */
export const ITEM_RESOURCES: readonly ItemResourceId[] = ['hp', 'mana', 'stamina'];

/** Whether a value names a known item category. */
export function isItemCategory(value: unknown): value is ItemCategory {
    return typeof value === 'string' && (ITEM_CATEGORIES as readonly string[]).includes(value);
}

/** Whether a value names a known item target scope. */
export function isItemTargetRule(value: unknown): value is ItemTargetRule {
    return typeof value === 'string' && (ITEM_TARGET_RULES as readonly string[]).includes(value);
}

/** Whether a value names a known item effect type. */
export function isItemEffectType(value: unknown): value is ItemEffectType {
    return typeof value === 'string' && (ITEM_EFFECT_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

function normalizeCategory(value: unknown): ItemCategory {
    return isItemCategory(readString(value, '')) ? (value as ItemCategory) : 'consumable';
}

function normalizeTarget(value: unknown, fallback: ItemTargetRule): ItemTargetRule {
    return isItemTargetRule(readString(value, '')) ? (value as ItemTargetRule) : fallback;
}

function normalizeResource(value: unknown): ItemResourceId {
    const raw = readString(value, '');
    return (ITEM_RESOURCES as readonly string[]).includes(raw) ? (raw as ItemResourceId) : 'hp';
}

/** Turns a status lasts; absent or non-positive means "until combat ends". */
function readTurns(value: unknown): number | null {
    const turns = readNumber(value, Number.NaN);
    return Number.isFinite(turns) && turns > 0 ? Math.round(turns) : null;
}

/** A stack limit must be a positive whole number; anything else is unlimited. */
function readMaxStack(value: unknown): number | null {
    const raw = readNumber(value, Number.NaN);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
}

/**
 * Flags an entry inherits from its category when it does not spell them out.
 *
 * A consumable is freely usable and spent; a throwable/buff/debuff is a combat
 * tool and spent; a key item is carried but never "used".
 */
function categoryDefaults(category: ItemCategory): {
    usableInCombat: boolean;
    usableOutsideCombat: boolean;
    consumedOnUse: boolean;
} {
    switch (category) {
        case 'key_item':
            return { usableInCombat: false, usableOutsideCombat: false, consumedOnUse: false };
        case 'throwable':
        case 'buff':
        case 'debuff':
            return { usableInCombat: true, usableOutsideCombat: false, consumedOnUse: true };
        case 'consumable':
        default:
            return { usableInCombat: true, usableOutsideCombat: true, consumedOnUse: true };
    }
}

// ---------------------------------------------------------------------------
// Effect normalisation
// ---------------------------------------------------------------------------

/** Normalises one authored effect, or `null` when it is unreadable. */
function normalizeEffect(raw: unknown, itemTarget: ItemTargetRule): ItemEffect | null {
    const record = asRecord(raw);
    if (!record) return null;

    const type = readString(record.type, '');
    if (!isItemEffectType(type)) return null;

    const target = normalizeTarget(record.target, itemTarget);

    switch (type) {
        case 'restore': {
            const amount = readNumber(record.amount, 0);
            if (amount <= 0) return null;
            const resource = normalizeResource(record.resource);
            const amountMax = readNumber(record.amount_max, Number.NaN);
            return Number.isFinite(amountMax) && amountMax > amount
                ? { type, target, resource, amount, amountMax }
                : { type, target, resource, amount };
        }

        case 'restore_percent': {
            const amountPercent = readNumber(record.amount_percent, 0);
            if (amountPercent <= 0) return null;
            return { type, target, resource: normalizeResource(record.resource), amountPercent };
        }

        case 'damage': {
            const amount = readNumber(record.amount, 0);
            if (amount <= 0) return null;
            return { type, target, amount, element: readString(record.element, '') || null };
        }

        case 'status': {
            const statusEffect = readString(record.status_effect, '');
            if (!statusEffect) return null;
            return {
                type,
                target,
                statusEffect,
                effectId: readString(record.effect_id, statusEffect),
                turns: readTurns(record.turns),
                damagePerTurn: Math.max(0, readNumber(record.damage, 0)),
                buff: readStatDelta(record.buff),
                debuff: readStatDelta(record.debuff),
                element: readString(record.element, '') || null,
            };
        }

        case 'revive': {
            const amountPercent = readNumber(record.amount_percent, 0);
            if (amountPercent <= 0) return null;
            return { type, target, amountPercent };
        }

        case 'cleanse':
            return { type, target };

        case 'drain': {
            const amount = readNumber(record.amount, 0);
            if (amount <= 0) return null;
            const drainPercent = readNumber(record.drain_percent, Number.NaN);
            return Number.isFinite(drainPercent)
                ? { type, target, amount, drainPercent }
                : { type, target, amount };
        }

        case 'mystery':
            return { type, target, turns: readTurns(record.turns) };

        default:
            return null;
    }
}

/** Normalises an authored `effects:` list, dropping unreadable entries. */
function normalizeEffects(value: unknown, itemTarget: ItemTargetRule): ItemEffect[] {
    if (!Array.isArray(value)) return [];

    const effects: ItemEffect[] = [];
    for (const entry of value) {
        const effect = normalizeEffect(entry, itemTarget);
        if (effect) effects.push(effect);
    }
    return effects;
}

// ---------------------------------------------------------------------------
// Item normalisation
// ---------------------------------------------------------------------------

/** Normalises one authored item entry, or `null` when it has no id. */
export function normalizeItem(raw: unknown): ItemDefinition | null {
    const record = asRecord(raw);
    if (!record) return null;

    const id = readString(record.id, '');
    if (!id) return null;

    const category = normalizeCategory(record.category);
    const target = normalizeTarget(record.target, 'self');
    const defaults = categoryDefaults(category);

    return {
        id,
        name: readString(record.name, id),
        description: readString(record.description, ''),
        category,
        target,
        effects: normalizeEffects(record.effects, target),
        usable_in_combat: readBoolean(record.usable_in_combat, defaults.usableInCombat),
        usable_outside_combat: readBoolean(record.usable_outside_combat, defaults.usableOutsideCombat),
        consumed_on_use: readBoolean(record.consumed_on_use, defaults.consumedOnUse),
        max_stack: readMaxStack(record.max_stack),
        item_type: readString(record.item_type, '') || null,
    };
}
