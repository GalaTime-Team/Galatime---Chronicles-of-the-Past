import type {
    DialogueEffect,
    DialogueEffectType,
    DialogueErrorCode,
    EffectOutcome,
} from '../../types/DialogueType';
import type { WorldState } from '../../types/WorldStateType';
import { createDialogueError } from '../../utils/dialogueUtils';
import { addItem, removeItem, DEFAULT_ITEM_QUANTITY } from '../state/inventoryService';
import { completeObjective, unlockObjective } from '../state/objectiveService';
import { adjustRelationship } from '../state/relationshipService';
import { markDialogueSeen, unlockDialogue, unlockPath } from '../state/unlockService';
import { addToStat, parseStatePath, setFlag } from '../state/worldStateService';
import type { StateWriteResult } from '../state/worldStateService';

/**
 * Routes dialogue effects to the service that owns each domain.
 *
 * This is a dispatcher, not an implementation: it contains no inventory,
 * relationship or objective rules. That is what keeps each domain testable on
 * its own and lets the file format gain new effects without touching the
 * services that already exist.
 */

/** Effect types this dispatcher knows how to route. */
export const SUPPORTED_EFFECT_TYPES: readonly DialogueEffectType[] = [
    'set_flag',
    'add_relationship',
    'add',
    'add_item',
    'remove_item',
    'add_item_to_entity',
    'remove_item_from_entity',
    'unlock_objective',
    'complete_objective',
    'unlock_dialogue',
    'unlock_path',
    'play_music',
];

/** String fields each effect type must declare. */
const REQUIRED_STRING_FIELDS: Record<DialogueEffectType, readonly string[]> = {
    set_flag: ['flag'],
    add_relationship: ['character_id', 'relationship_kind'],
    add: ['target'],
    add_item: ['item_id'],
    remove_item: ['item_id'],
    add_item_to_entity: ['entity_id', 'item_id'],
    remove_item_from_entity: ['entity_id', 'item_id'],
    unlock_objective: ['objective_id'],
    complete_objective: ['objective_id'],
    unlock_dialogue: ['dialogue_id'],
    unlock_path: ['path_id'],
    play_music: ['music_id'],
};

/** Numeric fields each effect type must declare. */
const REQUIRED_NUMBER_FIELDS: Record<DialogueEffectType, readonly string[]> = {
    set_flag: [],
    add_relationship: ['value'],
    add: ['value'],
    add_item: [],
    remove_item: [],
    add_item_to_entity: [],
    remove_item_from_entity: [],
    unlock_objective: [],
    complete_objective: [],
    unlock_dialogue: [],
    unlock_path: [],
    play_music: [],
};

/** What the dispatcher needs to apply a batch of effects. */
export interface EffectContext {
    state: WorldState;
    /** Catalogue check used by relationship effects. */
    isKnownCharacter: (characterId: string) => boolean;
    /** Where the effects came from, e.g. `nodes.lara_entry.effects_after`. */
    source: string;
}

/** Narrows an arbitrary value to a supported effect type. */
export function isSupportedEffectType(value: unknown): value is DialogueEffectType {
    return typeof value === 'string' && (SUPPORTED_EFFECT_TYPES as readonly string[]).includes(value);
}

/**
 * Checks an effect's required fields.
 *
 * Returns a human-readable problem, or `null` when the effect is well formed.
 * Shared with the validator so authoring mistakes are reported before a
 * conversation runs rather than in the middle of one.
 */
export function describeEffectProblem(effect: Record<string, unknown>): string | null {
    const type = effect.type;

    if (!isSupportedEffectType(type)) {
        return `Unsupported effect type "${String(type)}".`;
    }

    for (const field of REQUIRED_STRING_FIELDS[type]) {
        const value = effect[field];
        if (typeof value !== 'string' || value.length === 0) {
            return `Effect "${type}" requires a non-empty "${field}".`;
        }
    }

    for (const field of REQUIRED_NUMBER_FIELDS[type]) {
        const value = effect[field];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return `Effect "${type}" requires a numeric "${field}".`;
        }
    }

    if (type === 'set_flag' && !isFlagValue(effect.value)) {
        return 'Effect "set_flag" requires a boolean, string or number "value".';
    }

    if ((type === 'add_item' || type === 'remove_item') && effect.quantity !== undefined) {
        const quantity = effect.quantity;
        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
            return `Effect "${type}" requires a positive whole-number "quantity" when present.`;
        }
    }

    return null;
}

/** Flags are compared, never interpreted, so any scalar is acceptable. */
function isFlagValue(value: unknown): boolean {
    return typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number';
}

/**
 * Applies a list of effects in order.
 *
 * Failures are collected rather than thrown so one unusable effect does not
 * abandon the rest of the batch, and the caller can still show the player the
 * changes that did happen.
 */
export function applyEffects(
    effects: DialogueEffect[] | undefined,
    context: EffectContext,
): EffectOutcome {
    const outcome: EffectOutcome = { changes: [], warnings: [], errors: [], music_requests: [] };

    for (const effect of effects ?? []) {
        applyEffect(effect, context, outcome);
    }

    return outcome;
}

/** Routes one effect and records what it did. */
function applyEffect(effect: DialogueEffect, context: EffectContext, outcome: EffectOutcome): void {
    const { state, source } = context;

    switch (effect.type) {
        case 'set_flag':
            outcome.changes.push(setFlag(state, effect.flag, effect.value, source));
            return;

        case 'add_relationship': {
            const adjustment = adjustRelationship(
                state,
                effect.character_id,
                effect.relationship_kind,
                effect.value,
                source,
                context.isKnownCharacter,
            );

            if (adjustment.warning) {
                outcome.warnings.push(adjustment.warning);
            }

            pushResult(adjustment.result, outcome);
            return;
        }

        case 'add': {
            const parts = parseStatePath(effect.target);

            if (!parts || parts.root !== 'stats') {
                outcome.errors.push(createDialogueError(
                    'invalid_effect',
                    `Effect "add" only supports "stats.<name>" targets, received "${effect.target}". `
                    + 'Use the dedicated item, relationship or flag effect for other domains.',
                    { target: effect.target },
                ));
                return;
            }

            outcome.changes.push(addToStat(state, parts.key, effect.value, source));
            return;
        }

        case 'add_item':
            pushResult(addItem(state, effect.item_id, effect.quantity ?? DEFAULT_ITEM_QUANTITY, source), outcome);
            return;

        case 'remove_item':
            pushResult(removeItem(state, effect.item_id, effect.quantity ?? DEFAULT_ITEM_QUANTITY, source), outcome);
            return;

        case 'add_item_to_entity': {
            const entityInventory = getEntityInventory(state, effect.entity_id);
            const result = addItemToEntityInventory(entityInventory, effect.item_id, effect.quantity ?? DEFAULT_ITEM_QUANTITY);
            if (result.ok) {
                outcome.changes.push({
                    kind: 'item_added',
                    target: `entity.${effect.entity_id}.inventory.${effect.item_id}`,
                    previous: result.data.previous,
                    next: result.data.next,
                    delta: effect.quantity ?? DEFAULT_ITEM_QUANTITY,
                    source,
                });
            } else {
                outcome.errors.push(createDialogueError(
                    result.error.code,
                    result.error.message,
                    { entity_id: effect.entity_id, item_id: effect.item_id },
                ));
            }
            return;
        }

        case 'remove_item_from_entity': {
            const entityInventory = getEntityInventory(state, effect.entity_id);
            const result = removeItemFromEntityInventory(entityInventory, effect.item_id, effect.quantity ?? DEFAULT_ITEM_QUANTITY);
            if (result.ok) {
                outcome.changes.push({
                    kind: 'item_removed',
                    target: `entity.${effect.entity_id}.inventory.${effect.item_id}`,
                    previous: result.data.previous,
                    next: result.data.next,
                    delta: -(effect.quantity ?? DEFAULT_ITEM_QUANTITY),
                    source,
                });
            } else {
                outcome.errors.push(createDialogueError(
                    result.error.code,
                    result.error.message,
                    { entity_id: effect.entity_id, item_id: effect.item_id },
                ));
            }
            return;
        }

        case 'unlock_objective':
            pushResult(unlockObjective(state, effect.objective_id, source), outcome);
            return;

        case 'complete_objective':
            pushResult(completeObjective(state, effect.objective_id, source), outcome);
            return;

        case 'unlock_dialogue':
            pushResult(unlockDialogue(state, effect.dialogue_id, source), outcome);
            return;

        case 'unlock_path':
            pushResult(unlockPath(state, effect.path_id, source), outcome);
            return;

        case 'play_music':
            // Audio is a presentation concern: record the request and let the
            // session publish it once the step is known to have succeeded.
            outcome.music_requests.push({
                music_id: effect.music_id,
                loop: effect.loop ?? true,
            });
            return;

        default:
            outcome.errors.push(createDialogueError('invalid_effect', 'Unsupported effect type.', {
                effect: effect as unknown as Record<string, unknown>,
            }));
            return;
    }
}

// ---------------------------------------------------------------------------
// Entity inventory helpers
// ---------------------------------------------------------------------------

/**
 * Gets or creates an entity's inventory from the world state.
 *
 * Entity inventories are stored in a separate map within the world state,
 * keyed by entity id. This allows dialogues to interact with specific
 * entities' inventories without affecting the player's inventory.
 */
function getEntityInventory(state: WorldState, entityId: string): Record<string, number> {
    if (!state.entityInventories) {
        state.entityInventories = {};
    }
    if (!state.entityInventories[entityId]) {
        state.entityInventories[entityId] = {};
    }
    return state.entityInventories[entityId];
}

/** Adds an item to an entity's inventory. */
function addItemToEntityInventory(
    inventory: Record<string, number>,
    itemId: string,
    quantity: number,
): { ok: true; data: { previous: number; next: number } } | { ok: false; error: { code: DialogueErrorCode; message: string } } {
    const previous = inventory[itemId] ?? 0;
    const next = previous + quantity;
    inventory[itemId] = next;
    return { ok: true, data: { previous, next } };
}

/** Removes an item from an entity's inventory. */
function removeItemFromEntityInventory(
    inventory: Record<string, number>,
    itemId: string,
    quantity: number,
): { ok: true; data: { previous: number; next: number } } | { ok: false; error: { code: DialogueErrorCode; message: string } } {
    const previous = inventory[itemId] ?? 0;
    if (previous < quantity) {
        return {
            ok: false,
            error: {
                code: 'insufficient_item',
                message: `Cannot remove ${quantity} of "${itemId}": only ${previous} available.`,
            },
        };
    }
    const next = previous - quantity;
    if (next === 0) {
        delete inventory[itemId];
    } else {
        inventory[itemId] = next;
    }
    return { ok: true, data: { previous, next } };
}

/** Records a domain result, ignoring the no-op case. */
function pushResult(result: StateWriteResult, outcome: EffectOutcome): void {
    if (result.change) {
        outcome.changes.push(result.change);
    }

    if (result.error) {
        outcome.errors.push(result.error);
    }
}

/**
 * Records that a dialogue was played to completion.
 *
 * Re-exported here so the session service has a single import for everything
 * that mutates state on its behalf.
 */
export { markDialogueSeen };
