import type {
    AdvanceResult,
    ChoiceNode,
    ChoiceOption,
    ConditionalBranch,
    ConditionalNode,
    DialogueChoiceView,
    DialogueDefinition,
    DialogueEffect,
    DialogueError,
    DialogueCastEvent,
    DialogueDelivery,
    DialogueNode,
    DialogueNodeView,
    DialogueSegment,
    EffectOutcome,
    LineNode,
    PlayerInputNode,
} from '../../types/DialogueType';
import type { WorldState } from '../../types/WorldStateType';
import { createDialogueError, normalizeSegments } from '../../utils/dialogueUtils';
import { applyEffects } from './effectService';
import { evaluateCondition } from './conditionService';
import {
    changeCharacter,
    enterCharacter,
    exitCharacter,
    setCharacterEmotion,
    type CastState,
} from './castStateService';
import { resolveVariableSegments } from './variableService';

/**
 * Interprets individual nodes and walks the dialogue graph.
 *
 * The file format has two kinds of node. *Player-facing* nodes (line, choice,
 * end) stop the walk so the presentation layer can show something. *Automatic*
 * nodes (a `conditional`, a `character_enter`) have no visual of their own, so
 * they apply their side effects and hand over to the next node immediately.
 *
 * Walking is capped so a dialogue that loops without ever reaching an end is
 * reported as an authoring error instead of hanging the game.
 */

/** How many automatic nodes may be crossed before the walk is considered stuck. */
export const MAX_AUTO_NODE_STEPS = 256;

/** Everything a node needs in order to be interpreted. */
export interface NodeContext {
    definition: DialogueDefinition;
    /** The dialogue's id, which is the name of the file it came from. */
    dialogueId: string;
    state: WorldState;
    /** Who is in the conversation; the enter/exit nodes maintain it. */
    castState: CastState;
    /** Catalogue check passed through to relationship effects. */
    isKnownCharacter: (characterId: string) => boolean;
}

/** Result of a choice selection: the chosen option, or why it was refused. */
export interface ChoiceSelectionResult extends AdvanceResult {
    choice: ChoiceOption | null;
}

/** An empty outcome, for callers that need to start accumulating changes. */
export function emptyOutcome(): EffectOutcome {
    return { changes: [], warnings: [], errors: [], music_requests: [] };
}

/**
 * Walks from `startNodeId` until a player-facing node is reached.
 *
 * Effects attached to automatic nodes are applied on the way through. A `line`
 * node's `effects_after` is deliberately left alone: it belongs to the moment
 * the player advances past the line.
 */
export function advanceToNode(context: NodeContext, startNodeId: string): AdvanceResult {
    const outcome = emptyOutcome();
    const castEvents: DialogueCastEvent[] = [];

    let currentId: string | null = startNodeId;
    let steps = 0;

    while (currentId !== null) {
        if (steps >= MAX_AUTO_NODE_STEPS) {
            return errorResult(
                createDialogueError(
                    'dialogue_invalid',
                    `Dialogue "${context.dialogueId}" did not reach a player-facing node within `
                    + `${MAX_AUTO_NODE_STEPS} steps. Check for a cycle without an exit.`,
                    { node_id: currentId },
                ),
                outcome,
                castEvents,
            );
        }

        steps += 1;

        const nodeId: string = currentId;

        // Annotated on purpose: `currentId` is reassigned from `node.next`
        // below, so leaving `node` inferred makes its type depend on itself.
        const node: DialogueNode | undefined = context.definition.nodes[nodeId];

        if (!node) {
            return errorResult(
                createDialogueError(
                    'node_not_found',
                    `Node "${nodeId}" does not exist in dialogue "${context.dialogueId}".`,
                    { node_id: nodeId },
                ),
                outcome,
                castEvents,
            );
        }

        markNodeSeen(context.state, nodeId);

        switch (node.type) {
            case 'line':
                // A line's emotion is the face the speaker keeps, not a costume
                // for one line, so the cast records it before the view is built.
                setCharacterEmotion(context.castState, node.speaker_id, node.emotion);

                return {
                    nodeId,
                    nodeType: 'line',
                    view: buildLineView(nodeId, node, context.state),
                    choices: [],
                    interactions: collectInteractions(node.text),
                    completed: false,
                    result: null,
                    outcome,
                    castEvents,
                    error: null,
                };

            case 'choice':
                // A question is a spoken line, so its prompt dresses the speaker
                // exactly the way a `line` node does.
                setCharacterEmotion(context.castState, node.prompt?.speaker_id, node.prompt?.emotion);

                return {
                    nodeId,
                    nodeType: 'choice',
                    view: buildChoiceView(nodeId, node, context.state),
                    choices: buildChoiceViews(node, context.state),
                    interactions: new Map(),
                    completed: false,
                    result: null,
                    outcome,
                    castEvents,
                    error: null,
                };

            case 'player_input':
                // The conversation stops and waits: the player has to answer
                // before the dialogue can go on.
                return {
                    nodeId,
                    nodeType: 'player_input',
                    view: buildPlayerInputView(nodeId, node),
                    choices: [],
                    interactions: new Map(),
                    completed: false,
                    result: null,
                    outcome,
                    castEvents,
                    error: null,
                };

            case 'end': {
                mergeOutcome(outcome, applyEffects(node.effects, {
                    state: context.state,
                    isKnownCharacter: context.isKnownCharacter,
                    source: `nodes.${nodeId}.effects`,
                }));

                return {
                    nodeId: null,
                    nodeType: 'end',
                    view: null,
                    choices: [],
                    interactions: new Map(),
                    completed: true,
                    result: node.result ?? null,
                    outcome,
                    castEvents,
                    error: null,
                };
            }

            case 'character_enter': {
                castEvents.push(enterCharacter(context.castState, {
                    character_id: node.character_id,
                    position: node.position,
                    pose: node.pose,
                    depth: node.depth,
                    depth_of: node.depth_of,
                    animation_id: node.animation_id,
                    emotion: node.emotion,
                }));

                mergeOutcome(outcome, applyEffects(node.effects_after, {
                    state: context.state,
                    isKnownCharacter: context.isKnownCharacter,
                    source: `nodes.${nodeId}.effects_after`,
                }));

                currentId = node.next ?? null;
                break;
            }

            case 'character_exit': {
                const event = exitCharacter(context.castState, node.character_id, {
                    animation_id: node.animation_id,
                    direction: node.direction,
                });

                if (event) {
                    castEvents.push(event);
                }

                mergeOutcome(outcome, applyEffects(node.effects_after, {
                    state: context.state,
                    isKnownCharacter: context.isKnownCharacter,
                    source: `nodes.${nodeId}.effects_after`,
                }));

                currentId = node.next ?? null;
                break;
            }

            case 'character_action': {
                // Someone already on stage moves, sits down or changes layers.
                // There is no entrance animation here: they never left.
                const event = changeCharacter(context.castState, {
                    character_id: node.character_id,
                    position: node.position,
                    pose: node.pose,
                    depth: node.depth,
                    depth_of: node.depth_of,
                    emotion: node.emotion,
                    animation_id: node.animation_id,
                });

                if (event) {
                    castEvents.push(event);
                }

                mergeOutcome(outcome, applyEffects(node.effects_after, {
                    state: context.state,
                    isKnownCharacter: context.isKnownCharacter,
                    source: `nodes.${nodeId}.effects_after`,
                }));

                currentId = node.next ?? null;
                break;
            }

            case 'conditional': {
                const branch = pickBranch(node, context.state);

                if (!branch) {
                    return errorResult(
                        createDialogueError(
                            'dialogue_invalid',
                            `Conditional node "${nodeId}" matched no branch and has no default.`,
                            { node_id: nodeId },
                        ),
                        outcome,
                        castEvents,
                    );
                }

                currentId = branch.next;
                break;
            }

            default: {
                // The `scene` node: a kind the format no longer has. It is skipped
                // rather than rejected, so a file authored before staging moved out
                // still plays; the validator has already warned about it.
                const loose = node as unknown as { next?: string };

                if (!loose.next) {
                    return errorResult(
                        createDialogueError(
                            'dialogue_invalid',
                            `Node "${nodeId}" has an unsupported type and no "next" node to continue to.`,
                            { node_id: nodeId },
                        ),
                        outcome,
                        castEvents,
                    );
                }

                currentId = loose.next;
                break;
            }
        }
    }

    // A node without `next` cannot lead anywhere, and only `end` is terminal.
    return errorResult(
        createDialogueError(
            'dialogue_invalid',
            `Dialogue "${context.dialogueId}" ran out of nodes without reaching an "end" node.`,
            {},
        ),
        outcome,
        castEvents,
    );
}

/**
 * Advances past a line the player has finished reading.
 *
 * This is the only place a `line` node's `effects_after` is applied, so the
 * effects are tied to the player actually leaving the line.
 */
export function continueFromNode(context: NodeContext, nodeId: string): AdvanceResult {
    const node = context.definition.nodes[nodeId];

    if (!node) {
        return errorResult(
            createDialogueError(
                'node_not_found',
                `Node "${nodeId}" does not exist in dialogue "${context.dialogueId}".`,
                { node_id: nodeId },
            ),
        );
    }

    if (node.type === 'choice') {
        return errorResult(createDialogueError(
            'dialogue_invalid',
            `Node "${nodeId}" is a choice node and must be advanced by selecting a choice.`,
            { node_id: nodeId },
        ));
    }

    if (node.type === 'player_input') {
        return errorResult(createDialogueError(
            'dialogue_invalid',
            `Node "${nodeId}" asks the player a question and must be answered before it continues.`,
            { node_id: nodeId },
        ));
    }

    if (node.type === 'end') {
        return errorResult(createDialogueError(
            'session_completed',
            `Node "${nodeId}" ends the conversation and cannot be continued.`,
            { node_id: nodeId },
        ));
    }

    const next = nodeNext(node);

    if (next === null) {
        return errorResult(createDialogueError(
            'dialogue_invalid',
            `Node "${nodeId}" has no "next" node.`,
            { node_id: nodeId },
        ));
    }

    const outcome = applyEffects(nodeEffectsAfter(node), {
        state: context.state,
        isKnownCharacter: context.isKnownCharacter,
        source: `nodes.${nodeId}.effects_after`,
    });

    const advanced = advanceToNode(context, next);

    return {
        ...advanced,
        outcome: mergeOutcome(outcome, advanced.outcome),
    };
}

/**
 * Validates and applies a choice.
 *
 * Hidden choices are reported as missing rather than unavailable: from the
 * player's point of view a choice that fails `visible_if` is not part of the
 * node at all.
 */
export function selectChoice(
    context: NodeContext,
    nodeId: string,
    choiceId: string,
): ChoiceSelectionResult {
    const node = context.definition.nodes[nodeId];

    if (!node || node.type !== 'choice') {
        return {
            ...errorResult(createDialogueError(
                'node_not_found',
                `Node "${nodeId}" is not a choice node.`,
                { node_id: nodeId },
            )),
            choice: null,
        };
    }

    const choice = node.choices.find((candidate) => candidate.choice_id === choiceId);

    if (!choice || !evaluateCondition(choice.visible_if, context.state)) {
        return {
            ...errorResult(createDialogueError(
                'choice_not_found',
                `Choice "${choiceId}" is not available in node "${nodeId}".`,
                { node_id: nodeId, choice_id: choiceId },
            )),
            choice: null,
        };
    }

    if (!evaluateCondition(choice.enabled_if, context.state)) {
        return {
            ...errorResult(createDialogueError(
                'choice_unavailable',
                `Choice "${choiceId}" is currently disabled.`,
                { node_id: nodeId, choice_id: choiceId },
            )),
            choice: null,
        };
    }

    const outcome = applyEffects(choice.effects_before, {
        state: context.state,
        isKnownCharacter: context.isKnownCharacter,
        source: `nodes.${nodeId}.choices.${choiceId}.effects_before`,
    });

    const next = choice.next ?? null;

    if (next === null) {
        return {
            ...errorResult(
                createDialogueError(
                    'dialogue_invalid',
                    `Choice "${choiceId}" in node "${nodeId}" has no destination.`,
                    { node_id: nodeId, choice_id: choiceId },
                ),
                outcome,
            ),
            choice,
        };
    }

    const advanced = advanceToNode(context, next);

    return {
        ...advanced,
        outcome: mergeOutcome(outcome, advanced.outcome),
        choice,
    };
}

/**
 * Stores the player's answer and moves on.
 *
 * The answer lands in `input.<variable>`, which is where a later line reads it
 * from (`{input.<variable>}`) and where a condition compares against it. The
 * node's `effects_after` are applied on the way out, exactly as they are for a
 * line the player has finished reading.
 *
 * The answer is trimmed: what the player typed around the value is not part
 * of the value, and a stray space would make a comparison fail for no reason
 * a reader could see.
 */
export function submitInput(
    context: NodeContext,
    nodeId: string,
    value: string,
): AdvanceResult {
    const node = context.definition.nodes[nodeId];

    if (!node || node.type !== 'player_input') {
        return errorResult(createDialogueError(
            'input_not_found',
            `Node "${nodeId}" does not ask the player anything.`,
            { node_id: nodeId },
        ));
    }

    if (!node.variable) {
        return errorResult(createDialogueError(
            'input_invalid',
            `Node "${nodeId}" does not say which variable holds the answer.`,
            { node_id: nodeId },
        ));
    }

    const answer = value.trim();

    if (node.input_type === 'choice' && (node.options ?? []).length > 0) {
        // A pick from a list can only be one of the options offered: anything
        // else would be an answer the player was never given the chance to
        // give.
        if (!(node.options ?? []).includes(answer)) {
            return errorResult(createDialogueError(
                'input_invalid',
                `"${answer}" is not one of the options offered by node "${nodeId}".`,
                { node_id: nodeId, value: answer },
            ));
        }
    }

    const previous = context.state.input[node.variable] ?? null;

    context.state.input[node.variable] = answer;

    const outcome = emptyOutcome();

    outcome.changes.push({
        kind: 'input_set',
        target: `input.${node.variable}`,
        previous,
        next: answer,
        source: `nodes.${nodeId}.input`,
    });

    mergeOutcome(outcome, applyEffects(node.effects_after, {
        state: context.state,
        isKnownCharacter: context.isKnownCharacter,
        source: `nodes.${nodeId}.effects_after`,
    }));

    const next = node.next ?? null;

    if (next === null) {
        return errorResult(
            createDialogueError(
                'dialogue_invalid',
                `Node "${nodeId}" asks the player something but has no destination.`,
                { node_id: nodeId },
            ),
            outcome,
        );
    }

    const advanced = advanceToNode(context, next);

    return {
        ...advanced,
        outcome: mergeOutcome(outcome, advanced.outcome),
    };
}

/**
 * Follows an interactive text segment.
 *
 * The source line's `effects_after` is intentionally **not** applied: clicking
 * interactive text is an alternative exit from the line, and only `continue`
 * represents the player leaving it the ordinary way.
 */
export function followInteraction(
    context: NodeContext,
    nodeId: string,
    interactionId: string,
): AdvanceResult {
    const node = context.definition.nodes[nodeId];

    if (!node || node.type !== 'line') {
        return errorResult(createDialogueError(
            'interaction_not_found',
            `Node "${nodeId}" has no interactive text.`,
            { node_id: nodeId, interaction_id: interactionId },
        ));
    }

    const destination = collectInteractions(node.text).get(interactionId);

    if (!destination) {
        return errorResult(createDialogueError(
            'interaction_not_found',
            `Interactive segment "${interactionId}" does not exist in node "${nodeId}".`,
            { node_id: nodeId, interaction_id: interactionId },
        ));
    }

    return advanceToNode(context, destination);
}

/** First branch whose condition passes; a branch without `if` always passes. */
function pickBranch(node: ConditionalNode, state: WorldState): ConditionalBranch | null {
    for (const branch of node.branches) {
        if (!branch.if || evaluateCondition(branch.if, state)) {
            return branch;
        }
    }

    return null;
}

/**
 * Records a visit so conditions on `dialogues.seen` can check it.
 *
 * Every node the walk crosses is marked, exactly like the forger's preview
 * runner marks the nodes it walks. Without this a choice gated on
 * `dialogues.seen` — "hide this option once `fala_47` has been shown" — could
 * never change during a conversation, because the list would only ever hold
 * dialogue ids recorded at completion. Quiet on purpose: a visit is not an
 * authored effect, so it produces no state change for the presentation to show.
 */
function markNodeSeen(state: WorldState, nodeId: string): void {
    if (!state.dialogues.seen.includes(nodeId)) {
        state.dialogues.seen.push(nodeId);
    }
}

/** Interactive segments of a line, keyed by interaction id. */
function collectInteractions(segments: DialogueSegment[]): Map<string, string> {
    const interactions = new Map<string, string>();

    for (const segment of segments) {
        if (segment.type === 'interactive_text') {
            interactions.set(segment.interaction_id, segment.on_click.next);
        }
    }

    return interactions;
}

/** Builds the presentation view of a spoken line. */
function buildLineView(nodeId: string, node: LineNode, state: WorldState): DialogueNodeView {
    const delivery = resolveDelivery(node.delivery);
    const text = resolveVariableSegments(node.text, state);

    // A line that is wholly a thought, a whisper or a shout carries the
    // delivery on the node; a line that is only partly one says so in its own
    // segments. The two are merged here so the box only has to look at one
    // place — the segments themselves say how each piece is delivered.
    const segments: DialogueSegment[] = delivery === 'spoken'
        ? text
        : text.map((segment) => (segment.type === 'text'
            ? { type: delivery, value: segment.value }
            : segment));

    return {
        id: nodeId,
        type: 'line',
        speaker_id: node.speaker_id,
        emotion: node.emotion ?? null,
        animation_id: node.animation_id ?? null,
        text: segments,
        prompt: null,
        next_action: 'continue',
        auto_advance: node.auto_advance === true,
        delivery,
        input_request: null,
    };
}

/**
 * Builds the presentation view of a choice node.
 *
 * A choice node is a spoken line that is answered by a list, so the question is
 * shaped exactly like one: the speaker becomes the name plate, the emotion
 * drives the sprite, and the text is what gets typed out. Only `next_action`
 * marks the difference.
 */
function buildChoiceView(nodeId: string, node: ChoiceNode, state: WorldState): DialogueNodeView {
    const prompt = node.prompt ?? null;

    return {
        id: nodeId,
        type: 'choice',
        speaker_id: prompt?.speaker_id ?? null,
        emotion: prompt?.emotion ?? null,
        animation_id: null,
        text: prompt ? resolveVariableSegments(normalizeSegments(prompt.text), state) : [],
        prompt,
        next_action: 'choose',
        // A question is answered by a decision, so it can never skip itself.
        auto_advance: false,
        delivery: 'spoken',
        input_request: null,
    };
}

/**
 * Builds the presentation view of a question the player is asked.
 *
 * The node has no speaker of its own: the question is asked by the game, not
 * by anybody on stage, so the box shows the question and waits for an answer.
 */
function buildPlayerInputView(nodeId: string, node: PlayerInputNode): DialogueNodeView {
    return {
        id: nodeId,
        type: 'player_input',
        speaker_id: null,
        emotion: null,
        animation_id: null,
        text: [],
        prompt: null,
        next_action: 'input',
        // The player has to answer, so the box can never move on by itself.
        auto_advance: false,
        delivery: 'spoken',
        input_request: {
            question: node.question ?? '',
            variable: node.variable ?? '',
            input_type: node.input_type === 'choice' ? 'choice' : 'text',
            placeholder: node.placeholder ?? '',
            options: [...(node.options ?? [])],
        },
    };
}

/**
 * The delivery a line declares, or the ordinary one.
 *
 * A line that names a delivery the format does not know is spoken: a typo
 * must not make the line unsayable.
 */
function resolveDelivery(delivery: string | undefined): DialogueDelivery {
    if (delivery === 'thought' || delivery === 'whisper' || delivery === 'shout') {
        return delivery;
    }

    return 'spoken';
}

/**
 * Builds the renderable choices.
 *
 * Choices failing `visible_if` are omitted entirely. Choices failing
 * `enabled_if` are returned disabled so the player can see the route they have
 * not earned yet.
 */
function buildChoiceViews(node: ChoiceNode, state: WorldState): DialogueChoiceView[] {
    const views: DialogueChoiceView[] = [];

    for (const choice of node.choices) {
        if (!evaluateCondition(choice.visible_if, state)) {
            continue;
        }

        const enabled = evaluateCondition(choice.enabled_if, state);

        views.push({
            choice_id: choice.choice_id,
            text: choice.text,
            enabled,
            disabled_reason: enabled ? null : choice.disabled_reason ?? null,
        });
    }

    return views;
}

/** `effects_after` for the node kinds that support it. */
function nodeEffectsAfter(node: DialogueNode): DialogueEffect[] | undefined {
    return 'effects_after' in node ? node.effects_after : undefined;
}

/** `next` for the node kinds that support it. */
function nodeNext(node: DialogueNode): string | null {
    return 'next' in node ? node.next ?? null : null;
}

/** Appends one outcome's findings to another and returns the target. */
function mergeOutcome(target: EffectOutcome, source: EffectOutcome): EffectOutcome {
    target.changes.push(...source.changes);
    target.warnings.push(...source.warnings);
    target.errors.push(...source.errors);
    target.music_requests.push(...source.music_requests);
    return target;
}

/** A failed walk, still carrying whatever the walk already applied. */
function errorResult(
    error: DialogueError,
    outcome: EffectOutcome = emptyOutcome(),
    castEvents: DialogueCastEvent[] = [],
): AdvanceResult {
    return {
        nodeId: null,
        nodeType: null,
        view: null,
        choices: [],
        interactions: new Map(),
        completed: false,
        result: null,
        outcome,
        castEvents,
        error,
    };
}
