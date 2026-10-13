/**
 * Item catalogue validation.
 *
 * Pure authoring checks over a catalogue of {@link ItemDefinition}s. It reports
 * every problem it finds in a single pass, so a caller can surface them together
 * instead of discovering them one fight at a time.
 *
 * Single Responsibility: this module only *reports* problems. It never loads,
 * normalises or fixes anything.
 */

import type { ItemDefinition, ItemEffect } from '../../types/InventoryType';

/** One problem found in the catalogue. */
export interface ItemValidationIssue {
    /** Id of the offending item (`'<catalogue>'` for a catalogue-wide problem). */
    itemId: string;
    /** Short machine-readable code. */
    code: string;
    message: string;
}

/** The outcome of a validation pass. */
export interface ItemValidationResult {
    ok: boolean;
    issues: ItemValidationIssue[];
}

/** Inputs the validator cannot derive from an item alone. */
export interface ItemValidationOptions {
    /** Element ids the catalogue may reference; element refs are skipped when omitted. */
    knownElementIds?: readonly string[];
}

function issue(itemId: string, code: string, message: string): ItemValidationIssue {
    return { itemId, code, message };
}

/** Validates one effect, returning every problem it found. */
function validateEffect(
    itemId: string,
    effect: ItemEffect,
    knownElements: Set<string> | null,
): ItemValidationIssue[] {
    const issues: ItemValidationIssue[] = [];
    const unknownElement = (element: string | null | undefined): boolean => (
        Boolean(element) && knownElements !== null && !knownElements.has(element as string)
    );

    switch (effect.type) {
        case 'restore':
            if (!(effect.amount > 0)) {
                issues.push(issue(itemId, 'invalid_amount', `restore amount must be positive (got ${effect.amount}).`));
            }
            if (effect.amountMax !== undefined && effect.amountMax < effect.amount) {
                issues.push(issue(itemId, 'invalid_amount', `restore amount_max (${effect.amountMax}) is below amount (${effect.amount}).`));
            }
            break;

        case 'restore_percent':
            if (!(effect.amountPercent > 0)) {
                issues.push(issue(itemId, 'invalid_amount', `restore_percent must be positive (got ${effect.amountPercent}).`));
            }
            break;

        case 'damage':
            if (!(effect.amount > 0)) {
                issues.push(issue(itemId, 'invalid_amount', `damage amount must be positive (got ${effect.amount}).`));
            }
            if (unknownElement(effect.element)) {
                issues.push(issue(itemId, 'unknown_element', `damage references unknown element "${effect.element}".`));
            }
            break;

        case 'status':
            if (!effect.statusEffect) {
                issues.push(issue(itemId, 'missing_status', 'status effect has no label.'));
            }
            if (effect.turns !== null && effect.turns <= 0) {
                issues.push(issue(itemId, 'invalid_turns', `status turns must be positive (got ${effect.turns}).`));
            }
            if (!effect.buff && !effect.debuff && !(effect.damagePerTurn && effect.damagePerTurn > 0)) {
                issues.push(issue(itemId, 'empty_status', 'status does nothing (no buff, debuff or damage per turn).'));
            }
            if (unknownElement(effect.element)) {
                issues.push(issue(itemId, 'unknown_element', `status references unknown element "${effect.element}".`));
            }
            break;

        case 'revive':
            if (!(effect.amountPercent > 0 && effect.amountPercent <= 100)) {
                issues.push(issue(itemId, 'invalid_amount', `revive percent must be within 1..100 (got ${effect.amountPercent}).`));
            }
            break;

        case 'cleanse':
            break;

        case 'drain':
            if (!(effect.amount > 0)) {
                issues.push(issue(itemId, 'invalid_amount', `drain amount must be positive (got ${effect.amount}).`));
            }
            if (effect.drainPercent !== undefined && !(effect.drainPercent >= 0)) {
                issues.push(issue(itemId, 'invalid_amount', `drain percent must not be negative (got ${effect.drainPercent}).`));
            }
            break;

        case 'mystery':
            if (effect.turns !== null && effect.turns <= 0) {
                issues.push(issue(itemId, 'invalid_turns', `mystery turns must be positive (got ${effect.turns}).`));
            }
            break;

        default:
            break;
    }

    return issues;
}

/**
 * Validates a whole catalogue.
 *
 * Reports duplicate ids, usable items with no effects, key items that claim a
 * use, invalid stack limits and malformed effects.
 */
export function validateItemCatalogue(
    items: readonly ItemDefinition[],
    options: ItemValidationOptions = {},
): ItemValidationResult {
    const issues: ItemValidationIssue[] = [];
    const knownElements = options.knownElementIds ? new Set(options.knownElementIds) : null;
    const seen = new Set<string>();

    for (const item of items) {
        if (!item.id) {
            issues.push(issue('<unknown>', 'missing_id', 'Item has no id.'));
            continue;
        }

        if (seen.has(item.id)) {
            issues.push(issue(item.id, 'duplicate_id', `Item id "${item.id}" is declared more than once.`));
        }
        seen.add(item.id);

        if (item.max_stack !== null && !(item.max_stack > 0)) {
            issues.push(issue(item.id, 'invalid_max_stack', `max_stack must be a positive number or null (got ${item.max_stack}).`));
        }

        const isKeyItem = item.category === 'key_item';
        const claimsUse = item.usable_in_combat || item.usable_outside_combat;

        // Ammunition is fed to a weapon, never used on its own, so an empty
        // effect list is expected whenever the item declares a type.
        if (item.effects.length === 0 && !isKeyItem && !item.item_type) {
            issues.push(issue(item.id, 'no_effects', `Non-key item "${item.id}" has no effects.`));
        }
        if (item.effects.length > 0 && !claimsUse) {
            issues.push(issue(item.id, 'unusable_with_effects', `Item "${item.id}" has effects but cannot be used.`));
        }

        for (const effect of item.effects) {
            issues.push(...validateEffect(item.id, effect, knownElements));
        }
    }

    return { ok: issues.length === 0, issues };
}
