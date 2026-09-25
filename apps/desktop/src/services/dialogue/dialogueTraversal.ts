import type { DialogueDefinition, DialogueEffect, DialogueNode } from '../../types/DialogueType';

/**
 * Pure traversals of a dialogue definition.
 *
 * The validator, the session service and the Forger all need to ask the same
 * structural questions ("which nodes can this one reach?", "which characters
 * does this mention?"). Keeping them here means the answers cannot drift apart.
 */

/** One effect together with the path it was authored at. */
export interface LocatedEffect {
    effect: DialogueEffect;
    path: string;
}

/** Every node id declared in the dialogue. */
export function collectAllNodeIds(definition: DialogueDefinition): string[] {
    return Object.keys(definition.nodes ?? {});
}

/**
 * Node ids a node can move to, including interactive text destinations.
 *
 * Interactive segments count as edges because clicking one is a real route
 * through the conversation; omitting them would make a reachable node look
 * unreachable.
 */
export function collectOutgoingNodeIds(node: DialogueNode): string[] {
    switch (node.type) {
        case 'character_enter':
        case 'character_exit': {
            return node.next ? [node.next] : [];
        }

        case 'line': {
            const direct = node.next ? [node.next] : [];

            return [...direct, ...collectSegmentDestinations(node)];
        }

        case 'choice':
            return node.choices
                .map((choice) => choice.next)
                .filter((next): next is string => typeof next === 'string' && next.length > 0);

        case 'conditional':
            return node.branches
                .map((branch) => branch.next)
                .filter((next): next is string => typeof next === 'string' && next.length > 0);

        case 'end':
            return [];

        default:
            return [];
    }
}

/** Destinations reached by clicking interactive text on a line. */
function collectSegmentDestinations(node: DialogueNode): string[] {
    if (node.type !== 'line' || !Array.isArray(node.text)) {
        return [];
    }

    return node.text
        .filter((segment) => segment.type === 'interactive_text')
        .map((segment) => segment.on_click?.next)
        .filter((next): next is string => typeof next === 'string' && next.length > 0);
}

/**
 * Every effect in the dialogue, with the path it was authored at.
 *
 * Covers node hooks, choice hooks and end-of-dialogue effects, so a caller never
 * has to remember where effects can hide.
 */
export function collectEffects(definition: DialogueDefinition): LocatedEffect[] {
    const located: LocatedEffect[] = [];

    for (const [nodeId, node] of Object.entries(definition.nodes ?? {})) {
        if ('effects_after' in node && node.effects_after) {
            node.effects_after.forEach((effect, index) => {
                located.push({ effect, path: `nodes.${nodeId}.effects_after[${index}]` });
            });
        }

        if (node.type === 'end' && node.effects) {
            node.effects.forEach((effect, index) => {
                located.push({ effect, path: `nodes.${nodeId}.effects[${index}]` });
            });
        }

        if (node.type === 'choice') {
            node.choices.forEach((choice) => {
                (choice.effects_before ?? []).forEach((effect, index) => {
                    located.push({
                        effect,
                        path: `nodes.${nodeId}.choices.${choice.choice_id}.effects_before[${index}]`,
                    });
                });
            });
        }
    }

    return located;
}

/**
 * Character ids the dialogue mentions.
 *
 * Used to prime the character registry before a conversation starts, so the
 * effect pipeline can stay synchronous, and by the validator to warn about ids
 * the catalogue does not know.
 */
export function collectReferencedCharacterIds(definition: DialogueDefinition): string[] {
    const ids = new Set<string>();

    for (const node of Object.values(definition.nodes ?? {})) {
        if (node.type === 'line') {
            ids.add(node.speaker_id);
        }

        if (node.type === 'choice' && node.prompt) {
            ids.add(node.prompt.speaker_id);
        }

        if (node.type === 'character_enter' || node.type === 'character_exit') {
            ids.add(node.character_id);
        }
    }

    for (const { effect } of collectEffects(definition)) {
        if (effect.type === 'add_relationship') {
            ids.add(effect.character_id);
        }
    }

    ids.delete('');
    return [...ids];
}

/** Dialogue ids the dialogue unlocks. */
export function collectReferencedDialogueIds(definition: DialogueDefinition): string[] {
    const ids = new Set<string>();

    for (const { effect } of collectEffects(definition)) {
        if (effect.type === 'unlock_dialogue') {
            ids.add(effect.dialogue_id);
        }
    }

    ids.delete('');
    return [...ids];
}
