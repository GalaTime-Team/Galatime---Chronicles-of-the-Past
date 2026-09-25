/**
 * Types describing the dialogue file format and the runtime contract between
 * the dialogue backend and its presentation layer.
 *
 * The file format carries only conversation-local information: who speaks,
 * what is said, how the conversation branches and what it changes. Permanent
 * character data (display name, sprites, voice) and translations live outside
 * the dialogue and are resolved through the character registry.
 *
 * These types mirror the YAML one-to-one, so field names stay in `snake_case`.
 */

import type { FlagValue, StateChange, WorldState } from './WorldStateType';

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/**
 * Comparison applied by a single condition leaf.
 *
 * Item presence, relationships, flags, objective state and seen dialogues are
 * all expressed as state paths combined with these operators, so the evaluator
 * needs no per-domain operator of its own.
 */
export type ComparisonOperator =
    | 'equals'
    | 'not_equals'
    | 'greater_than'
    | 'greater_or_equal'
    | 'less_than'
    | 'less_or_equal';

/** A single comparison against a dotted state path. */
export interface ConditionLeaf {
    condition: ComparisonOperator;
    /**
     * Dotted state path, e.g. `flags.met_pacci` or
     * `relationship.pacci.friendship`. Only `relationship` has three segments:
     * the character, then which affinity towards them.
     */
    left: string;
    /** Literal to compare against. */
    right: FlagValue | null;
}

/**
 * Boolean composition of conditions.
 *
 * Every key present must pass, so `all` + `not` reads as "all of these, and
 * none of that".
 */
export interface ConditionGroup {
    all?: ConditionNode[];
    any?: ConditionNode[];
    not?: ConditionNode;
}

/** A leaf comparison or a nested group. */
export type ConditionNode = ConditionLeaf | ConditionGroup;

// ---------------------------------------------------------------------------
// Text segments
// ---------------------------------------------------------------------------

/** Presentation hints for a styled text segment. */
export interface DialogueTextStyle {
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** Shake intensity. `off` lets the accessibility setting win. */
    shake?: 'off' | 'light' | 'normal' | 'strong';
    /**
     * Vertical wave intensity: each character bobs up and down on its own phase
     * offset, so neighbours are visibly out of step. `off` defers to the player,
     * exactly like `shake`. Only one character of a word is ever a whole level
     * away, which is what keeps the line readable while it moves.
     */
    wave?: 'off' | 'light' | 'normal' | 'strong';
    /**
     * Jitter intensity: a small, fast, irregular tremble of the whole segment,
     * horizontally and vertically at once. Written for a character on the edge of
     * crying — it reads as barely holding still rather than as being shaken.
     *
     * **Layered, not exclusive.** `shake`, `wave` and `jitter` each move the text
     * on their own axis, and a segment may ask for all three; the shake moves the
     * whole segment, the jitter trembles inside that, and the wave runs per
     * character inside both. `off` defers to the player, exactly like the others.
     */
    jitter?: 'off' | 'light' | 'normal' | 'strong';
    /**
     * Tempo of each movement style, as a multiplier: `1` is the default, below 1
     * is slower and above 1 is faster — the same convention as `speed_multiplier`.
     *
     * Orthogonal to the level, which sets how *far* the text travels, so
     * `wave: 'light'` with `wave_speed: 2` is a small, quick ripple. Kept per
     * style rather than shared, so a line can drift slowly while it trembles
     * quickly. Absent means the default tempo.
     */
    shake_speed?: number;
    wave_speed?: number;
    jitter_speed?: number;
    /** Multiplies the configured text speed; below 1 is slower. */
    speed_multiplier?: number;
    /** Explicit hold after this segment, independent of punctuation. */
    pause_after_ms?: number;
}

/** Plain dialogue text. */
export interface DialogueTextSegment {
    type: 'text';
    value: string;
}

/** Dialogue text with inline styling. */
export interface DialogueStyledTextSegment {
    type: 'styled_text';
    value: string;
    style?: DialogueTextStyle;
}

/** A hold in the middle of a line, used for dramatic timing. */
export interface DialoguePauseSegment {
    type: 'pause';
    duration_ms: number;
}

/**
 * Text the player can click to take an alternative route.
 *
 * `optional` means the line can still be advanced normally without clicking,
 * so the interaction is an offer rather than a gate.
 */
export interface DialogueInteractiveTextSegment {
    type: 'interactive_text';
    interaction_id: string;
    value: string;
    optional?: boolean;
    on_click: {
        next: string;
    };
}

/** One piece of a spoken line. */
export type DialogueSegment =
    | DialogueTextSegment
    | DialogueStyledTextSegment
    | DialoguePauseSegment
    | DialogueInteractiveTextSegment;

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Set a narrative flag to a literal value. */
export interface SetFlagEffect {
    type: 'set_flag';
    flag: string;
    value: FlagValue;
}

/**
 * Add to (or subtract from) one affinity towards a character.
 *
 * `relationship_kind` is required rather than defaulted so the file always says
 * which affinity it means; adding a second kind later is then only a matter of
 * authoring it.
 */
export interface AddRelationshipEffect {
    type: 'add_relationship';
    character_id: string;
    relationship_kind: string;
    value: number;
}

/** Add to a numeric state path, e.g. `stats.suspicion`. */
export interface AddStateEffect {
    type: 'add';
    target: string;
    value: number;
}

/** Give the player an item. */
export interface AddItemEffect {
    type: 'add_item';
    item_id: string;
    quantity?: number;
}

/** Take an item from the player. */
export interface RemoveItemEffect {
    type: 'remove_item';
    item_id: string;
    quantity?: number;
}

/** Make an objective available without activating it. */
export interface UnlockObjectiveEffect {
    type: 'unlock_objective';
    objective_id: string;
}

/** Mark an objective as completed. */
export interface CompleteObjectiveEffect {
    type: 'complete_objective';
    objective_id: string;
}

/** Make another dialogue available to start. */
export interface UnlockDialogueEffect {
    type: 'unlock_dialogue';
    dialogue_id: string;
}

/** Unlock a narrative path. */
export interface UnlockPathEffect {
    type: 'unlock_path';
    path_id: string;
}

/** Ask the presentation layer to change the background music. */
export interface PlayMusicEffect {
    type: 'play_music';
    music_id: string;
    loop?: boolean;
}

/** Any mutation a dialogue can request. */
export type DialogueEffect =
    | SetFlagEffect
    | AddRelationshipEffect
    | AddStateEffect
    | AddItemEffect
    | RemoveItemEffect
    | UnlockObjectiveEffect
    | CompleteObjectiveEffect
    | UnlockDialogueEffect
    | UnlockPathEffect
    | PlayMusicEffect;

/** Effect type names the backend knows how to dispatch. */
export type DialogueEffectType = DialogueEffect['type'];

/**
 * A music change an effect asked for.
 *
 * Recorded rather than applied immediately so a step that later fails leaves
 * no audible trace, and so the engine never depends on the audio layer.
 */
export interface MusicRequest {
    music_id: string;
    loop: boolean;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * Every node kind the engine can resolve.
 *
 * `character_enter` and `character_exit` are *automatic* nodes: they have no
 * visual of their own, they change who is in the conversation and hand over to
 * the next node. They are how a dialogue stages itself without owning a scene.
 */
export type DialogueNodeType =
    | 'line'
    | 'choice'
    | 'character_enter'
    | 'character_exit'
    | 'conditional'
    | 'end';

/** A spoken line. */
export interface LineNode {
    type: 'line';
    speaker_id: string;
    emotion?: string;
    /** Idle animation played while the line is on screen. */
    animation_id?: string;
    /**
     * Whether the line moves on by itself once a page has finished appearing.
     *
     * Absent (or `false`) is the normal case: a line waits for the player, one
     * page at a time. `true` turns the box into a cutscene — it flips its own
     * pages and `continue`s on its own after a short hold — which is what makes
     * a line of narration or an off-screen voice play without being clicked
     * through. The hold keeps the line readable; it is not an instant skip.
     */
    auto_advance?: boolean;
    text: DialogueSegment[];
    next?: string;
    /** Applied when the line is finished (on `continue`). */
    effects_after?: DialogueEffect[];
}

/** One selectable option inside a choice node. */
export interface ChoiceOption {
    choice_id: string;
    text: string;
    /** Hidden entirely when this fails. */
    visible_if?: ConditionNode;
    /** Shown but not selectable when this fails. */
    enabled_if?: ConditionNode;
    /** Optional player-facing explanation for a disabled option. */
    disabled_reason?: string;
    /** Applied before moving to `next`. */
    effects_before?: DialogueEffect[];
    next?: string;
}

/**
 * The question a choice node asks.
 *
 * Deliberately shaped like a line, so the presentation layer renders it exactly
 * like one — same name plate, same inline styling, same sprite expression. A
 * choice node is a spoken line that happens to be answered by a list instead of
 * by advancing.
 *
 * `text` accepts a bare string for the common case; the engine normalises it to
 * a single unstyled segment before anything reads it.
 */
export interface ChoicePrompt {
    speaker_id: string;
    emotion?: string;
    text: string | DialogueSegment[];
}

/** A branch point where the player picks an option. */
export interface ChoiceNode {
    type: 'choice';
    prompt?: ChoicePrompt;
    choices: ChoiceOption[];
}

/**
 * Bring a character into the conversation.
 *
 * Everything here is a hint for the presentation layer: `emotion` decides the
 * sprite, `position` only decides the left-to-right order, and `animation_id`
 * flavours how they arrive. None of it is required.
 */
export interface CharacterEnterNode {
    type: 'character_enter';
    character_id: string;
    position?: string;
    animation_id?: string;
    emotion?: string;
    next?: string;
    effects_after?: DialogueEffect[];
}

/** Take a character out of the conversation. */
export interface CharacterExitNode {
    type: 'character_exit';
    character_id: string;
    animation_id?: string;
    /** Direction the character walks off in. */
    direction?: string;
    next?: string;
    effects_after?: DialogueEffect[];
}

/** One branch of a conditional node. A branch without `if` is the default. */
export interface ConditionalBranch {
    branch_id: string;
    if?: ConditionNode;
    next: string;
}

/** An automatic branch resolved without player input. */
export interface ConditionalNode {
    type: 'conditional';
    branches: ConditionalBranch[];
}

/** Terminal node. */
export interface EndNode {
    type: 'end';
    /** Outcome label (`good`, `neutral`, `bad`, …). */
    result?: string;
    effects?: DialogueEffect[];
}

/** Any node in a dialogue. */
export type DialogueNode =
    | LineNode
    | ChoiceNode
    | CharacterEnterNode
    | CharacterExitNode
    | ConditionalNode
    | EndNode;

// ---------------------------------------------------------------------------
// Dialogue file
// ---------------------------------------------------------------------------

/** A parsed dialogue file. */
export interface DialogueDefinition {
    dialogue_id: string;
    start_node: string;
    /** Gate checked before the conversation is allowed to start. */
    entry_conditions?: ConditionNode;
    nodes: Record<string, DialogueNode>;
}

// ---------------------------------------------------------------------------
// Presentation contract
// ---------------------------------------------------------------------------

/**
 * What the player is expected to do with the current node.
 *
 * A spoken line is always `continue`, even when it contains interactive text:
 * clicking a segment is an alternative route, not a replacement for advancing.
 * The presentation layer discovers interactive segments by inspecting `text`.
 */
export type DialogueNextAction = 'continue' | 'choose' | 'end';

/** A choice as the presentation layer should render it. */
export interface DialogueChoiceView {
    choice_id: string;
    text: string;
    enabled: boolean;
    /** Set when `enabled` is false and the dialogue provided a reason. */
    disabled_reason: string | null;
}

/**
 * One character taking part in the conversation.
 *
 * `emotion` is what the sprite matcher reads. `layer` is the order they were
 * brought in, so someone who arrives later stands in front of someone who was
 * already there.
 */
export interface DialogueCastMemberView {
    character_id: string;
    position: string;
    emotion: string | null;
    layer: number;
}

/**
 * The cast as the presentation layer should draw it.
 *
 * A dialogue owns **who is in the conversation**, not where they are standing in
 * the world: backgrounds, props and authored composition belong to the scene
 * system. What is here is the group the conversation is happening between, and
 * it is what lets the stage dim everyone who is not speaking.
 */
export interface DialogueCastView {
    characters: DialogueCastMemberView[];
}

/** Kind of cast change, so the stage can animate the right thing. */
export type DialogueCastEventKind = 'enter' | 'exit';

/** A cast change produced while resolving nodes. */
export interface DialogueCastEvent {
    kind: DialogueCastEventKind;
    character_id: string;
    position?: string;
    animation_id?: string | null;
    /** Direction a character leaves in. */
    direction?: string | null;
}

/** The node the presentation layer should show right now. */
export interface DialogueNodeView {
    id: string;
    type: DialogueNodeType;
    speaker_id: string | null;
    emotion: string | null;
    animation_id: string | null;
    text: DialogueSegment[];
    prompt: ChoicePrompt | null;
    next_action: DialogueNextAction;
    /**
     * Whether the box should advance this node without waiting for the player.
     *
     * Only ever `true` on a `line`; a choice always needs a decision, so the
     * presentation layer can treat it as "this node does not need input".
     */
    auto_advance: boolean;
}

/** Lifecycle of a dialogue session. */
export type DialogueSessionStatus = 'active' | 'completed';

/**
 * Everything the presentation layer needs for one step of a conversation.
 *
 * Visual character data is intentionally absent: the view resolves
 * `speaker_id` through the character registry.
 */
export interface DialogueResponse {
    session_id: string;
    status: DialogueSessionStatus;
    current_node: DialogueNodeView | null;
    cast_state: DialogueCastView;
    cast_events: DialogueCastEvent[];
    available_choices: DialogueChoiceView[];
    /** Deltas applied by this step, for player-facing feedback. */
    state_changes: StateChange[];
    /** Outcome label, present once `status` is `completed`. */
    result: string | null;
    /** Non-fatal problems (unknown character, unknown dialogue, …). */
    warnings: DialogueIssue[];
}

/** Result of closing a session, including the state the game should keep. */
export interface DialogueEndResult {
    session_id: string;
    result: string | null;
    world_state: WorldState;
}

/**
 * Result of walking the dialogue graph to the next player-facing node.
 *
 * The walk crosses automatic nodes (a `conditional`, a `character_enter`) on the
 * way, so this carries the effects and the cast changes they produced as well as
 * the node that stopped the walk.
 */
export interface AdvanceResult {
    /** The node the player is looking at, or `null` when the walk stopped. */
    nodeId: string | null;
    nodeType: DialogueNodeType | null;
    view: DialogueNodeView | null;
    choices: DialogueChoiceView[];
    /** Interactive segments of the current line, keyed by interaction id. */
    interactions: Map<string, string>;
    /** True when the walk reached an `end` node. */
    completed: boolean;
    /** Outcome label, set once `completed` is true. */
    result: string | null;
    /** Changes applied while crossing automatic nodes. */
    outcome: EffectOutcome;
    /** Cast changes produced while crossing nodes. */
    castEvents: DialogueCastEvent[];
    /** Set when the walk failed; the caller must not treat the step as valid. */
    error: DialogueError | null;
}

// ---------------------------------------------------------------------------
// Errors and validation
// ---------------------------------------------------------------------------

/** Stable error codes, safe to branch on in the presentation layer. */
export type DialogueErrorCode =
    | 'dialogue_not_found'
    | 'dialogue_invalid'
    | 'node_not_found'
    | 'choice_not_found'
    | 'choice_unavailable'
    | 'interaction_not_found'
    | 'unknown_character'
    | 'invalid_effect'
    | 'insufficient_item'
    | 'unknown_relationship'
    | 'unknown_objective'
    | 'session_not_found'
    | 'session_expired'
    | 'session_completed'
    | 'duplicate_action'
    | 'incompatible_state';

/** A failure the caller can act on. Technical detail stays in the logs. */
export interface DialogueError {
    code: DialogueErrorCode;
    message: string;
    details?: Record<string, unknown>;
}

/** Severity of a validation finding. */
export type DialogueIssueSeverity = 'error' | 'warning';

/** A single validation finding. */
export interface DialogueIssue {
    severity: DialogueIssueSeverity;
    code: string;
    message: string;
    /** Where the problem is, e.g. `nodes.arthur_answer.next`. */
    path?: string;
}

/** Outcome of validating a dialogue file. */
export interface DialogueValidationReport {
    dialogue_id: string;
    errors: DialogueIssue[];
    warnings: DialogueIssue[];
}

/** Discriminated result used instead of throwing across the API boundary. */
export type DialogueResult<T> = { ok: true; data: T } | { ok: false; error: DialogueError };

/** What a batch of effects did, and anything the caller should know about. */
export interface EffectOutcome {
    changes: StateChange[];
    warnings: DialogueIssue[];
    errors: DialogueError[];
    /** Music changes to apply once the step is committed. */
    music_requests: MusicRequest[];
}
