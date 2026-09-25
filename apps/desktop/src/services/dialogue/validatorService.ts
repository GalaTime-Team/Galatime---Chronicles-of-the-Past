import type {
    ConditionNode,
    ConditionalBranch,
    DialogueDefinition,
    DialogueEffect,
    DialogueIssue,
    DialogueNode,
    DialogueNodeType,
    DialogueSegment,
    DialogueValidationReport,
} from '../../types/DialogueType';
import { DIALOGUE_DEFAULT_RELATIONSHIP_KIND } from '../../constants/DialogueVocabulary';
import { createDialogueIssue, normalizeSegments } from '../../utils/dialogueUtils';
import {
    isRelationshipPathMissingKind,
    MAX_STATE_PATH_SEGMENTS,
    parseStatePath,
    relationshipStatePath,
} from '../state/worldStateService';
import { isComparisonOperator, isConditionLeaf } from './conditionService';
import { describeEffectProblem } from './effectService';
import { collectEffects, collectOutgoingNodeIds } from './dialogueTraversal';

/**
 * Validates a dialogue file before anyone tries to play it.
 *
 * Errors block the conversation; warnings describe something suspicious that
 * still works. Unknown characters are warnings on purpose: a writer may author
 * a conversation before the character exists, and the engine already tolerates
 * that at runtime.
 */

/** Node kinds the engine can resolve. */
export const DIALOGUE_NODE_TYPES: readonly DialogueNodeType[] = [
    'line',
    'choice',
    'character_enter',
    'character_exit',
    'conditional',
    'end',
];

/**
 * Node kinds an earlier version of the format handled, before staging moved out
 * of the dialogue.
 *
 * Still recognised so an existing file gets an explanation instead of a bare
 * "unsupported type": the conversation still plays, the node is just skipped.
 * Only `scene` is in here — the dialogue keeps its own cast, but it no longer
 * owns a scene.
 */
const REMOVED_NODE_TYPES: readonly string[] = ['scene'];

/** Whether a node type belongs to the removed scene feature. */
function isRemovedNodeType(value: unknown): boolean {
    return typeof value === 'string' && REMOVED_NODE_TYPES.includes(value);
}

/** Everything validation needs that is not in the file itself. */
export interface ValidationContext {
    /** Catalogue check for character ids. */
    isKnownCharacter: (characterId: string) => boolean;
    /** Whether a referenced dialogue file exists. */
    dialogueExists: (dialogueId: string) => boolean;
}

/** Narrows an arbitrary value to a node type the engine understands. */
export function isDialogueNodeType(value: unknown): value is DialogueNodeType {
    return typeof value === 'string' && (DIALOGUE_NODE_TYPES as readonly string[]).includes(value);
}

/** Findings gathered while validating. */
interface IssueCollector {
    errors: DialogueIssue[];
    warnings: DialogueIssue[];
}

/** Validates a parsed dialogue and reports everything it found. */
export function validateDialogue(
    definition: DialogueDefinition,
    context: ValidationContext,
): DialogueValidationReport {
    const collector: IssueCollector = { errors: [], warnings: [] };

    if (!definition || typeof definition !== 'object') {
        addError(collector, 'dialogue_invalid', 'Dialogue file is empty or is not a mapping.');
        return { dialogue_id: '', errors: collector.errors, warnings: collector.warnings };
    }

    const dialogueId = typeof definition.dialogue_id === 'string' ? definition.dialogue_id : '';

    if (!dialogueId) {
        addError(collector, 'missing_dialogue_id', 'Dialogue is missing "dialogue_id".', 'dialogue_id');
    }

    const nodes: Record<string, DialogueNode> =
        definition.nodes && typeof definition.nodes === 'object' ? definition.nodes : {};

    if (Object.keys(nodes).length === 0) {
        addError(collector, 'missing_nodes', 'Dialogue declares no nodes.', 'nodes');
    }

    validateConditionNode(definition.entry_conditions, 'entry_conditions', collector);

    const legacyScenes = (definition as { scenes?: Record<string, unknown> }).scenes;

    if (legacyScenes && typeof legacyScenes === 'object' && Object.keys(legacyScenes).length > 0) {
        addWarning(
            collector,
            'ignored_scene_definitions',
            `Dialogue declares ${Object.keys(legacyScenes).length} scene definition(s) under "scenes". `
            + 'Scenes are no longer handled by the dialogue, so these are ignored.',
            'scenes',
        );
    }

    if (!definition.start_node) {
        addError(collector, 'missing_start_node', 'Dialogue is missing "start_node".', 'start_node');
    } else if (!nodes[definition.start_node]) {
        addError(
            collector,
            'unknown_start_node',
            `Start node "${definition.start_node}" does not exist.`,
            'start_node',
        );
    }

    for (const { effect, path } of collectEffects(definition)) {
        validateEffect(effect, path, context, collector);
    }

    for (const [nodeId, node] of Object.entries(nodes)) {
        validateNode(nodeId, node, nodes, context, collector);
    }

    if (definition.start_node && nodes[definition.start_node]) {
        validateReachability(definition, nodes, collector);
    }

    return {
        dialogue_id: dialogueId,
        errors: collector.errors,
        warnings: collector.warnings,
    };
}

/** Checks one node's required fields and its outgoing references. */
function validateNode(
    nodeId: string,
    node: DialogueNode,
    nodes: Record<string, DialogueNode>,
    context: ValidationContext,
    collector: IssueCollector,
): void {
    const path = `nodes.${nodeId}`;

    if (!node || typeof node !== 'object') {
        addError(collector, 'invalid_node', `Node "${nodeId}" is not a mapping.`, path);
        return;
    }

    if (isRemovedNodeType(node.type)) {
        addWarning(
            collector,
            'removed_node_type',
            `Node "${nodeId}" uses "${String(node.type)}", a scene node kind the dialogue no longer handles. `
            + 'It is skipped; staging belongs to the scene system now.',
            `${path}.type`,
        );
        return;
    }

    if (!isDialogueNodeType(node.type)) {
        addError(
            collector,
            'unknown_node_type',
            `Node "${nodeId}" has unsupported type "${String(node.type)}".`,
            `${path}.type`,
        );
        return;
    }

    switch (node.type) {
        case 'line':
            validateLineNode(nodeId, node, nodes, context, collector);
            break;

        case 'choice':
            validateChoiceNode(nodeId, node, nodes, context, collector);
            break;

        case 'character_enter':
        case 'character_exit':
            validateCharacterNode(nodeId, node, context, collector);
            break;

        case 'conditional':
            validateConditionalNode(nodeId, node, nodes, collector);
            break;

        case 'end':
            break;

        default:
            break;
    }

    if ('next' in node && node.next && !nodes[node.next]) {
        addError(
            collector,
            'unknown_next_node',
            `Node "${nodeId}" points to missing node "${node.next}".`,
            `${path}.next`,
        );
    }
}

/** A line needs a speaker and text; its interactive segments need destinations. */
function validateLineNode(
    nodeId: string,
    node: Extract<DialogueNode, { type: 'line' }>,
    nodes: Record<string, DialogueNode>,
    context: ValidationContext,
    collector: IssueCollector,
): void {
    const path = `nodes.${nodeId}`;

    if (!node.speaker_id) {
        addError(collector, 'missing_speaker_id', `Line "${nodeId}" declares no "speaker_id".`, `${path}.speaker_id`);
    } else if (!context.isKnownCharacter(node.speaker_id)) {
        addWarning(
            collector,
            'unknown_character',
            `Line "${nodeId}" is spoken by unknown character "${node.speaker_id}".`,
            `${path}.speaker_id`,
        );
    }

    // The flag decides whether the player is asked to advance at all, so a value
    // that is not a boolean would silently mean "no". Report it rather than
    // letting `=== true` quietly turn a typo into the default behaviour.
    const autoAdvance: unknown = node.auto_advance;

    if (autoAdvance !== undefined && typeof autoAdvance !== 'boolean') {
        addError(
            collector,
            'invalid_auto_advance',
            `Line "${nodeId}" has an "auto_advance" that is not true/false.`,
            `${path}.auto_advance`,
        );
    }

    if (!Array.isArray(node.text) || node.text.length === 0) {
        addError(collector, 'missing_text', `Line "${nodeId}" declares no text.`, `${path}.text`);
        return;
    }

    validateSegments(nodeId, node.text, nodes, collector);
}
/**
 * A choice node needs a well-formed question and unique, reachable options.
 *
 * The question is validated as a line would be, because that is what it is: a
 * spoken line that is answered by a list.
 */
function validateChoiceNode(
    nodeId: string,
    node: Extract<DialogueNode, { type: 'choice' }>,
    nodes: Record<string, DialogueNode>,
    context: ValidationContext,
    collector: IssueCollector,
): void {
    const path = `nodes.${nodeId}`;

    if (node.prompt) {
        if (!node.prompt.speaker_id) {
            addError(collector, 'missing_speaker_id', `Prompt of "${nodeId}" declares no "speaker_id".`, `${path}.prompt.speaker_id`);
        } else if (!context.isKnownCharacter(node.prompt.speaker_id)) {
            addWarning(
                collector,
                'unknown_character',
                `Prompt of "${nodeId}" is spoken by unknown character "${node.prompt.speaker_id}".`,
                `${path}.prompt.speaker_id`,
            );
        }

        const promptText: unknown = node.prompt.text;

        if (typeof promptText === 'string' || Array.isArray(promptText)) {
            validateSegments(
                nodeId,
                normalizeSegments(promptText as string | DialogueSegment[]),
                nodes,
                collector,
                `${path}.prompt.text`,
            );
        } else {
            addError(collector, 'missing_text', `Prompt of "${nodeId}" declares no text.`, `${path}.prompt.text`);
        }
    }

    if (!Array.isArray(node.choices) || node.choices.length === 0) {
        addError(collector, 'missing_choices', `Choice node "${nodeId}" declares no choices.`, `${path}.choices`);
        return;
    }

    const seenChoiceIds = new Set<string>();

    node.choices.forEach((choice, index) => {
        const choicePath = `${path}.choices[${index}]`;

        if (!choice.choice_id) {
            addError(collector, 'missing_choice_id', `Choice ${index} of "${nodeId}" has no "choice_id".`, choicePath);
        } else if (seenChoiceIds.has(choice.choice_id)) {
            addError(
                collector,
                'duplicate_choice_id',
                `Choice id "${choice.choice_id}" is used more than once in node "${nodeId}".`,
                choicePath,
            );
        } else {
            seenChoiceIds.add(choice.choice_id);
        }

        if (!choice.text) {
            addWarning(collector, 'missing_choice_text', `Choice "${choice.choice_id ?? index}" of "${nodeId}" has no text.`, choicePath);
        }

        if (!choice.next) {
            addError(
                collector,
                'missing_choice_destination',
                `Choice "${choice.choice_id ?? index}" of "${nodeId}" has no destination.`,
                `${choicePath}.next`,
            );
        } else if (!nodes[choice.next]) {
            addError(
                collector,
                'unknown_next_node',
                `Choice "${choice.choice_id ?? index}" of "${nodeId}" points to missing node "${choice.next}".`,
                `${choicePath}.next`,
            );
        }

        validateConditionNode(choice.visible_if, `${choicePath}.visible_if`, collector);
        validateConditionNode(choice.enabled_if, `${choicePath}.enabled_if`, collector);
    });
}

/**
 * Enter/exit nodes need a character the catalogue knows about.
 *
 * An unknown id is a warning, not an error: the engine tolerates it, and the
 * sprite simply falls back to the placeholder.
 */
function validateCharacterNode(
    nodeId: string,
    node: Extract<DialogueNode, { type: 'character_enter' | 'character_exit' }>,
    context: ValidationContext,
    collector: IssueCollector,
): void {
    if (!node.character_id) {
        addError(collector, 'missing_character_id', `Node "${nodeId}" declares no "character_id".`, `nodes.${nodeId}.character_id`);
        return;
    }

    if (!context.isKnownCharacter(node.character_id)) {
        addWarning(
            collector,
            'unknown_character',
            `Node "${nodeId}" references unknown character "${node.character_id}".`,
            `nodes.${nodeId}.character_id`,
        );
    }
}

/** A conditional node needs unique branches and a default. */
function validateConditionalNode(
    nodeId: string,
    node: Extract<DialogueNode, { type: 'conditional' }>,
    nodes: Record<string, DialogueNode>,
    collector: IssueCollector,
): void {
    const path = `nodes.${nodeId}`;

    if (!Array.isArray(node.branches) || node.branches.length === 0) {
        addError(collector, 'missing_branches', `Conditional node "${nodeId}" declares no branches.`, `${path}.branches`);
        return;
    }

    const seenBranchIds = new Set<string>();
    let defaultBranchIndex = -1;

    node.branches.forEach((branch, index) => {
        const branchPath = `${path}.branches[${index}]`;

        if (!branch.branch_id) {
            addError(collector, 'missing_branch_id', `Branch ${index} of "${nodeId}" has no "branch_id".`, branchPath);
        } else if (seenBranchIds.has(branch.branch_id)) {
            addError(
                collector,
                'duplicate_branch_id',
                `Branch id "${branch.branch_id}" is used more than once in node "${nodeId}".`,
                branchPath,
            );
        } else {
            seenBranchIds.add(branch.branch_id);
        }

        if (!branch.next) {
            addError(
                collector,
                'missing_branch_destination',
                `Branch "${branch.branch_id ?? index}" of "${nodeId}" has no destination.`,
                `${branchPath}.next`,
            );
        } else if (!nodes[branch.next]) {
            addError(
                collector,
                'unknown_next_node',
                `Branch "${branch.branch_id ?? index}" of "${nodeId}" points to missing node "${branch.next}".`,
                `${branchPath}.next`,
            );
        }

        if (!branch.if) {
            if (defaultBranchIndex === -1) {
                defaultBranchIndex = index;
            }
        } else {
            validateConditionNode(branch.if, `${branchPath}.if`, collector);
        }
    });

    if (defaultBranchIndex === -1) {
        addWarning(
            collector,
            'no_default_branch',
            `Conditional node "${nodeId}" has no default branch, so it fails when nothing matches.`,
            `${path}.branches`,
        );
    } else if (defaultBranchIndex !== node.branches.length - 1) {
        addWarning(
            collector,
            'default_branch_not_last',
            `Conditional node "${nodeId}" has an unconditional branch that is not last, so later branches are unreachable.`,
            `${path}.branches[${defaultBranchIndex}]`,
        );
    }

    // Order decides the winner, so a branch that asks for nothing an earlier
    // branch has not already asked for can never be picked: the earlier one
    // matches first. This is how a "most specific case" is authored into
    // unreachability by accident, by putting the general case above it.
    const reasonedBranches: Array<{ branch: ConditionalBranch; index: number; keys: string[] }> = [];

    node.branches.forEach((branch, index) => {
        const keys = collectRequiredConditionKeys(branch.if);

        if (keys !== null) {
            reasonedBranches.push({ branch, index, keys });
        }
    });

    reasonedBranches.forEach((later, position) => {
        const shadowing = reasonedBranches
            .slice(0, position)
            .find((earlier) => isConditionSubset(earlier.keys, later.keys));

        if (shadowing) {
            addWarning(
                collector,
                'shadowed_branch',
                `Branch "${later.branch.branch_id || later.index}" of conditional node "${nodeId}" is unreachable: `
                + `branch "${shadowing.branch.branch_id || shadowing.index}" is evaluated first and matches at least as often.`,
                `${path}.branches[${later.index}]`,
            );
        }
    });
}

/**
 * The conditions a branch requires, or `null` when they cannot be reasoned about.
 *
 * Only `all` trees are described: whether one condition matches at least as
 * often as another cannot be proven across an `any` or a `not`, and a wrong
 * warning is worse than a missing one. Nested `all` groups are flattened, so a
 * leaf is identified by what it compares rather than by where it sits.
 */
function collectRequiredConditionKeys(node: ConditionNode | undefined): string[] | null {
    if (!node) {
        return null;
    }

    if (isConditionLeaf(node)) {
        return [`${node.condition}|${node.left}|${JSON.stringify(node.right ?? null)}`];
    }

    // A malformed `all` is already reported by the condition checks; there is
    // nothing to reason about here.
    if (node.any || node.not || (node.all !== undefined && !Array.isArray(node.all))) {
        return null;
    }

    const keys: string[] = [];

    for (const child of node.all ?? []) {
        const childKeys = collectRequiredConditionKeys(child);

        if (childKeys === null) {
            return null;
        }

        keys.push(...childKeys);
    }

    return keys;
}

/** Whether `earlier` matches whenever `later` does, so `later` can never be picked. */
function isConditionSubset(earlier: string[], later: string[]): boolean {
    return earlier.every((key) => later.includes(key));
}

/**
 * Checks a line's segments and the destinations of its interactive text.
 *
 * `pathPrefix` defaults to a line's own text so the common caller stays short;
 * a choice node passes its prompt path instead.
 */
function validateSegments(
    nodeId: string,
    segments: DialogueSegment[],
    nodes: Record<string, DialogueNode>,
    collector: IssueCollector,
    pathPrefix: string = `nodes.${nodeId}.text`,
): void {
    const seenInteractionIds = new Set<string>();

    segments.forEach((segment, index) => {
        const path = `${pathPrefix}[${index}]`;

        if (!segment || typeof segment !== 'object') {
            addError(collector, 'invalid_segment', `Segment ${index} of "${nodeId}" is not a mapping.`, path);
            return;
        }

        switch (segment.type) {
            case 'text':
            case 'styled_text':
                if (typeof segment.value !== 'string') {
                    addError(collector, 'invalid_segment', `Segment ${index} of "${nodeId}" has no "value".`, path);
                }
                break;

            case 'pause':
                if (typeof segment.duration_ms !== 'number' || segment.duration_ms < 0) {
                    addError(
                        collector,
                        'invalid_segment',
                        `Pause segment ${index} of "${nodeId}" needs a non-negative "duration_ms".`,
                        path,
                    );
                }
                break;

            case 'interactive_text': {
                if (!segment.interaction_id) {
                    addError(collector, 'missing_interaction_id', `Interactive segment ${index} of "${nodeId}" has no "interaction_id".`, path);
                } else if (seenInteractionIds.has(segment.interaction_id)) {
                    addError(
                        collector,
                        'duplicate_interaction_id',
                        `Interaction id "${segment.interaction_id}" is used more than once in node "${nodeId}".`,
                        path,
                    );
                } else {
                    seenInteractionIds.add(segment.interaction_id);
                }

                const destination = segment.on_click?.next;

                if (!destination) {
                    addError(
                        collector,
                        'missing_interaction_destination',
                        `Interactive segment "${segment.interaction_id ?? index}" of "${nodeId}" has no "on_click.next".`,
                        path,
                    );
                } else if (!nodes[destination]) {
                    addError(
                        collector,
                        'unknown_next_node',
                        `Interactive segment "${segment.interaction_id ?? index}" of "${nodeId}" points to missing node "${destination}".`,
                        path,
                    );
                }
                break;
            }

            default:
                addError(collector, 'invalid_segment', `Segment ${index} of "${nodeId}" has an unsupported type.`, path);
                break;
        }
    });
}

/** Checks an effect's shape and the ids it references. */
function validateEffect(
    effect: DialogueEffect,
    path: string,
    context: ValidationContext,
    collector: IssueCollector,
): void {
    const problem = describeEffectProblem(effect as unknown as Record<string, unknown>);

    if (problem) {
        addError(collector, 'invalid_effect', problem, path);
        return;
    }

    if (effect.type === 'add_relationship' && !context.isKnownCharacter(effect.character_id)) {
        addWarning(
            collector,
            'unknown_character',
            `Effect references unknown character "${effect.character_id}".`,
            path,
        );
    }

    if (effect.type === 'add' && parseStatePath(effect.target)?.root !== 'stats') {
        addError(
            collector,
            'invalid_effect_target',
            `Effect "add" only supports "stats.<name>" targets, received "${effect.target}".`,
            path,
        );
    }

    if (effect.type === 'unlock_dialogue' && !context.dialogueExists(effect.dialogue_id)) {
        addWarning(
            collector,
            'unknown_dialogue',
            `Effect unlocks dialogue "${effect.dialogue_id}", which does not exist yet.`,
            path,
        );
    }
}

/**
 * Why a condition's state path is unusable, or `null` when it is fine.
 *
 * A relationship path is the interesting case: it needs a third segment saying
 * which affinity, and spelling that out is more use than "not a state path".
 */
function describeConditionPathProblem(left: unknown): { code: string; message: string } | null {
    if (typeof left === 'string' && parseStatePath(left)) {
        return null;
    }

    if (typeof left === 'string' && isRelationshipPathMissingKind(left)) {
        const characterId = left.split('.')[1] ?? '';

        return {
            code: 'missing_relationship_kind',
            message: `Condition path "${left}" must name the kind of relationship, as `
                + `"${relationshipStatePath(characterId, DIALOGUE_DEFAULT_RELATIONSHIP_KIND)}".`,
        };
    }

    return {
        code: 'invalid_condition_path',
        message: `Condition path "${String(left)}" is not a state path of at most `
            + `${MAX_STATE_PATH_SEGMENTS} segments.`,
    };
}

/** Checks a condition tree's operators, state paths and literals. */
function validateConditionNode(
    node: ConditionNode | undefined,
    path: string,
    collector: IssueCollector,
): void {
    if (!node) {
        return;
    }

    if (isConditionLeaf(node)) {
        if (!isComparisonOperator(node.condition)) {
            addError(
                collector,
                'invalid_condition',
                `Unsupported comparison "${String(node.condition)}" at "${path}".`,
                `${path}.condition`,
            );
        }

        const pathProblem = describeConditionPathProblem(node.left);

        if (pathProblem) {
            addError(collector, pathProblem.code, pathProblem.message, `${path}.left`);
        }

        if (!isComparableLiteral(node.right)) {
            addError(
                collector,
                'invalid_condition_value',
                'Condition "right" must be a boolean, string, number or null.',
                `${path}.right`,
            );
        }

        return;
    }

    for (const key of Object.keys(node)) {
        if (key !== 'all' && key !== 'any' && key !== 'not') {
            addError(
                collector,
                'invalid_condition',
                `Unsupported condition key "${key}"; expected "all", "any" or "not".`,
                `${path}.${key}`,
            );
        }
    }

    if (!node.all && !node.any && !node.not) {
        addWarning(
            collector,
            'empty_condition_group',
            'Condition group has no "all", "any" or "not", so it always passes.',
            path,
        );
    }

    if (node.all) {
        if (!Array.isArray(node.all)) {
            addError(collector, 'invalid_condition', '"all" must be a list of conditions.', `${path}.all`);
        } else {
            node.all.forEach((child, index) => validateConditionNode(child, `${path}.all[${index}]`, collector));
        }
    }

    if (node.any) {
        if (!Array.isArray(node.any)) {
            addError(collector, 'invalid_condition', '"any" must be a list of conditions.', `${path}.any`);
        } else {
            node.any.forEach((child, index) => validateConditionNode(child, `${path}.any[${index}]`, collector));
        }
    }

    if (node.not) {
        validateConditionNode(node.not, `${path}.not`, collector);
    }
}

/** Warns about nodes nothing can reach, and nodes that cannot finish. */
function validateReachability(
    definition: DialogueDefinition,
    nodes: Record<string, DialogueNode>,
    collector: IssueCollector,
): void {
    const reachable = collectReachableNodeIds(definition);
    const canExit = collectNodesThatCanReachEnd(definition);

    for (const nodeId of Object.keys(nodes)) {
        if (!reachable.has(nodeId)) {
            addWarning(
                collector,
                'unreachable_node',
                `Node "${nodeId}" cannot be reached from "${definition.start_node}".`,
                `nodes.${nodeId}`,
            );
            continue;
        }

        if (!canExit.has(nodeId)) {
            addWarning(
                collector,
                'path_without_exit',
                `Node "${nodeId}" cannot reach an "end" node.`,
                `nodes.${nodeId}`,
            );
        }
    }
}

/** Nodes reachable from the start node, following every kind of edge. */
export function collectReachableNodeIds(definition: DialogueDefinition): Set<string> {
    const reachable = new Set<string>();

    if (!definition.start_node) {
        return reachable;
    }

    const queue: string[] = [definition.start_node];

    while (queue.length > 0) {
        const nodeId = queue.pop();

        if (nodeId === undefined || reachable.has(nodeId)) {
            continue;
        }

        const node = definition.nodes?.[nodeId];

        if (!node) {
            continue;
        }

        reachable.add(nodeId);
        queue.push(...collectOutgoingNodeIds(node));
    }

    return reachable;
}

/** Nodes from which an `end` node can be reached. */
export function collectNodesThatCanReachEnd(definition: DialogueDefinition): Set<string> {
    const parents = new Map<string, string[]>();

    for (const [nodeId, node] of Object.entries(definition.nodes ?? {})) {
        for (const target of collectOutgoingNodeIds(node)) {
            const existing = parents.get(target) ?? [];
            existing.push(nodeId);
            parents.set(target, existing);
        }
    }

    const canExit = new Set<string>();
    const queue: string[] = Object.entries(definition.nodes ?? {})
        .filter(([, node]) => node.type === 'end')
        .map(([nodeId]) => nodeId);

    while (queue.length > 0) {
        const nodeId = queue.pop();

        if (nodeId === undefined || canExit.has(nodeId)) {
            continue;
        }

        canExit.add(nodeId);
        queue.push(...(parents.get(nodeId) ?? []));
    }

    return canExit;
}

/** Conditions compare against a scalar literal or an explicit null. */
function isComparableLiteral(value: unknown): boolean {
    return value === null
        || typeof value === 'boolean'
        || typeof value === 'string'
        || typeof value === 'number';
}

function addError(collector: IssueCollector, code: string, message: string, path?: string): void {
    collector.errors.push(createDialogueIssue('error', code, message, path));
}

function addWarning(collector: IssueCollector, code: string, message: string, path?: string): void {
    collector.warnings.push(createDialogueIssue('warning', code, message, path));
}
