import type { DialogueIssue } from '../../types/DialogueType';
import type { WorldState } from '../../types/WorldStateType';
import { clamp, createDialogueError, createDialogueIssue } from '../../utils/dialogueUtils';
import type { StateWriteResult } from './worldStateService';
import { relationshipStatePath } from './worldStateService';

/**
 * Affinity towards characters, per kind of relationship.
 *
 * Affinity is addressed as `relationship.<character>.<kind>`, so a character has
 * one counter per kind and the caller must say which it means. Every change is
 * clamped so a long conversation cannot push a relationship out of the range the
 * rest of the game assumes.
 */

/** Lowest affinity a character can reach. */
export const RELATIONSHIP_MIN = -100;

/** Highest affinity a character can reach. */
export const RELATIONSHIP_MAX = 100;

/** A relationship change plus anything the caller should surface. */
export interface RelationshipAdjustment {
    result: StateWriteResult;
    /** Set when the character is not in the catalogue. Never fatal. */
    warning: DialogueIssue | null;
}

/**
 * Adds `delta` to one affinity towards a character.
 *
 * The catalogue check is injected rather than imported so this service stays
 * independent of how characters are stored. An unknown character is reported
 * as a warning and the change still applies, because a dialogue that mentions
 * a character the game has not authored yet must not break mid-conversation.
 *
 * `delta` on the recorded change is the delta actually applied, which is
 * smaller than the requested one when the value hits a bound.
 */
export function adjustRelationship(
    state: WorldState,
    characterId: string,
    relationshipKind: string,
    delta: number,
    source: string,
    isKnownCharacter: (id: string) => boolean,
): RelationshipAdjustment {
    if (!characterId || !relationshipKind) {
        return {
            result: {
                change: null,
                error: createDialogueError(
                    'invalid_effect',
                    'A relationship effect must name both the character and which relationship it changes.',
                    { character_id: characterId, relationship_kind: relationshipKind },
                ),
            },
            warning: null,
        };
    }

    const path = relationshipStatePath(characterId, relationshipKind);
    const warning = isKnownCharacter(characterId)
        ? null
        : createDialogueIssue(
            'warning',
            'unknown_character',
            `Relationship effect references unknown character "${characterId}".`,
            path,
        );

    if (!Number.isFinite(delta)) {
        return {
            result: {
                change: null,
                error: createDialogueError(
                    'invalid_effect',
                    `Relationship delta for "${characterId}" must be a finite number.`,
                    { character_id: characterId, relationship_kind: relationshipKind, delta },
                ),
            },
            warning,
        };
    }

    const previous = state.relationship[characterId]?.[relationshipKind] ?? 0;
    const next = clamp(previous + delta, RELATIONSHIP_MIN, RELATIONSHIP_MAX);

    if (next === previous) {
        // Nothing to record, and nothing to create: a character with no
        // affinities yet stays absent rather than gaining an empty bucket.
        return { result: { change: null, error: null }, warning };
    }

    if (!state.relationship[characterId]) {
        state.relationship[characterId] = {};
    }

    state.relationship[characterId][relationshipKind] = next;

    return {
        result: {
            change: {
                kind: 'relationship_changed',
                target: path,
                previous,
                next,
                delta: next - previous,
                source,
            },
            error: null,
        },
        warning,
    };
}

/** Current affinity of one kind towards a character, defaulting to zero. */
export function getRelationship(
    state: WorldState,
    characterId: string,
    relationshipKind: string,
): number {
    return state.relationship[characterId]?.[relationshipKind] ?? 0;
}
