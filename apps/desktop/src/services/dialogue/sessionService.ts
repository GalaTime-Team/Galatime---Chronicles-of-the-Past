import type {
    AdvanceResult,
    DialogueDefinition,
    DialogueEndResult,
    DialogueError,
    DialogueErrorCode,
    DialogueNodeType,
    DialogueResponse,
    DialogueResult,
    DialogueValidationReport,
} from '../../types/DialogueType';
import type { StateChange, WorldState, WorldStateInput } from '../../types/WorldStateType';
import { createDialogueError, createDialogueIssue } from '../../utils/dialogueUtils';
import { cloneWorldState, createWorldState } from '../state/worldStateService';
import { isKnownCharacter, primeCharacterRegistry } from './characterRegistryService';
import { evaluateCondition } from './conditionService';
import { collectReferencedCharacterIds } from './dialogueTraversal';
import { emitDialogueEvent } from './eventService';
import { listDialogueIds, loadDialogue } from './loaderService';
import { advanceToNode, continueFromNode, followInteraction, selectChoice } from './nodeService';
import type { NodeContext } from './nodeService';
import { createInMemoryPersistence } from './persistenceService';
import type { DialoguePersistence } from './persistenceService';
import { cloneCastState, createCastState, toCastView } from './castStateService';
import type { CastState } from './castStateService';
import { markDialogueSeen } from '../state/unlockService';
import { validateDialogue } from './validatorService';

/**
 * Drives a conversation from start to finish.
 *
 * This service coordinates; it does not implement node interpretation or effect
 * application. Its own responsibilities are the session lifecycle, action
 * idempotency, and making every step atomic.
 *
 * **Atomicity** is the important part: each step runs against cloned state and
 * only replaces the session's state once the walk succeeded. A step that fails
 * — a missing node, an effect the player cannot afford — therefore leaves the
 * conversation exactly where it was, and the player can retry or pick another
 * option without the world having shifted underneath them.
 */

/** How long an untouched session stays resumable. */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** How many recent action ids are remembered for duplicate detection. */
export const MAX_TRACKED_ACTION_IDS = 64;

/** A conversation in progress. */
export interface DialogueSession {
    session_id: string;
    dialogue_id: string;
    definition: DialogueDefinition;
    state: WorldState;
    /** Who is in the conversation. The enter/exit nodes maintain it. */
    castState: CastState;
    currentNodeId: string | null;
    nodeType: DialogueNodeType | null;
    completed: boolean;
    result: string | null;
    startedAt: number;
    /** Action ids already processed, newest last, bounded in size. */
    processedActionIds: Set<string>;
}

const sessions = new Map<string, DialogueSession>();

let persistence: DialoguePersistence = createInMemoryPersistence();
let sessionCounter = 0;

/**
 * Swaps the persistence implementation.
 *
 * Used to move from the in-memory default to a Tauri-backed store, and by tests
 * that want a clean slate.
 */
export function setDialoguePersistence(implementation: DialoguePersistence): void {
    persistence = implementation;
}

/** Drops every session. Intended for tests and for tearing down a play session. */
export function clearDialogueSessions(): void {
    sessions.clear();
}

/**
 * Starts a conversation.
 *
 * The dialogue is loaded, validated and primed before any state is touched, so
 * a broken or unknown dialogue fails without side effects.
 */
export async function startSession(
    dialogueId: string,
    worldStateInput: WorldStateInput = {},
): Promise<DialogueResult<DialogueResponse>> {
    const prepared = await prepareDialogue(dialogueId);

    if (!prepared.ok) {
        return prepared;
    }

    const { definition, report } = prepared.data;

    if (report.errors.length > 0) {
        return failure(
            'dialogue_invalid',
            `Dialogue "${dialogueId}" has ${report.errors.length} validation error(s) and cannot be started.`,
            {
                dialogue_id: dialogueId,
                errors: report.errors.map((issue) => issue.message),
            },
        );
    }

    const state = createWorldState(worldStateInput);

    if (!evaluateCondition(definition.entry_conditions, state)) {
        return failure(
            'incompatible_state',
            `The current game state does not satisfy the entry conditions of "${dialogueId}".`,
            { dialogue_id: dialogueId },
        );
    }

    const session: DialogueSession = {
        session_id: createSessionId(),
        dialogue_id: dialogueId,
        definition,
        state,
        castState: createCastState(),
        currentNodeId: null,
        nodeType: null,
        completed: false,
        result: null,
        startedAt: Date.now(),
        processedActionIds: new Set(),
    };

    sessions.set(session.session_id, session);

    const step = runStep(session, (context) => advanceToNode(context, definition.start_node));

    if (!step.ok) {
        // The conversation never started, so leave nothing behind.
        sessions.delete(session.session_id);
        return step;
    }

    return step;
}

/** Validates a dialogue file without starting it. */
export async function validateDialogueFile(
    dialogueId: string,
): Promise<DialogueResult<DialogueValidationReport>> {
    const prepared = await prepareDialogue(dialogueId);

    if (!prepared.ok) {
        return prepared;
    }

    return { ok: true, data: prepared.data.report };
}

/** Advances past the line the player has finished reading. */
export function continueSession(
    sessionId: string,
    actionId?: string,
): DialogueResult<DialogueResponse> {
    return stepSession(sessionId, actionId, (context, session) => {
        if (session.currentNodeId === null) {
            return guardFailure('session_completed', `Session "${sessionId}" has no current node.`);
        }

        return continueFromNode(context, session.currentNodeId);
    });
}

/** Applies a choice the player selected. */
export function selectSessionChoice(
    sessionId: string,
    choiceId: string,
    actionId?: string,
): DialogueResult<DialogueResponse> {
    return stepSession(sessionId, actionId, (context, session) => {
        if (session.currentNodeId === null) {
            return guardFailure('session_completed', `Session "${sessionId}" has no current node.`);
        }

        return selectChoice(context, session.currentNodeId, choiceId);
    });
}

/** Follows an interactive text segment the player clicked. */
export function followSessionInteraction(
    sessionId: string,
    interactionId: string,
    actionId?: string,
): DialogueResult<DialogueResponse> {
    return stepSession(sessionId, actionId, (context, session) => {
        if (session.currentNodeId === null) {
            return guardFailure('session_completed', `Session "${sessionId}" has no current node.`);
        }

        return followInteraction(context, session.currentNodeId, interactionId);
    });
}

/**
 * Closes a session and hands the updated world state back to the game.
 *
 * Safe to call on a conversation that already finished: the state is returned
 * either way.
 */
export function endSession(sessionId: string): DialogueResult<DialogueEndResult> {
    const found = requireSession(sessionId);

    if (!found.ok) {
        return found;
    }

    const session = found.data;
    const result = session.result;

    sessions.delete(sessionId);
    persistence.clearCheckpoint(sessionId);

    return {
        ok: true,
        data: {
            session_id: sessionId,
            result,
            world_state: cloneWorldState(session.state),
        },
    };
}

/** A read-only snapshot of a session, for debugging and tooling. */
export function getSession(sessionId: string): DialogueResult<DialogueSession> {
    return requireSession(sessionId);
}

/** Loads, primes and validates a dialogue in one place. */
async function prepareDialogue(
    dialogueId: string,
): Promise<DialogueResult<{ definition: DialogueDefinition; report: DialogueValidationReport }>> {
    const definition = await loadDialogue(dialogueId);

    if (!definition) {
        return failure('dialogue_not_found', `Dialogue "${dialogueId}" was not found.`, {
            dialogue_id: dialogueId,
        });
    }

    // Prime first so the validator's catalogue checks answer from the cache
    // instead of hitting the filesystem per character.
    await primeCharacterRegistry(collectReferencedCharacterIds(definition));

    const knownDialogueIds = new Set(await listDialogueIds());

    const report = validateDialogue(definition, {
        isKnownCharacter,
        dialogueExists: (id) => knownDialogueIds.has(id),
    });

    // The file name is the identity every other dialogue references, so a
    // mismatch means `unlock_dialogue` would look for a file that is not there.
    if (report.dialogue_id && report.dialogue_id !== dialogueId) {
        report.warnings.push(createDialogueIssue(
            'warning',
            'dialogue_id_mismatch',
            `File "${dialogueId}.yaml" declares dialogue_id "${report.dialogue_id}"; the file name is what other dialogues reference.`,
            'dialogue_id',
        ));
    }

    return { ok: true, data: { definition, report } };
}

/**
 * Runs one action against a session.
 *
 * Encapsulates everything every action has in common: session lookup, the
 * completed guard, duplicate detection, and committing the step.
 */
function stepSession(
    sessionId: string,
    actionId: string | undefined,
    walk: (context: NodeContext, session: DialogueSession) => AdvanceResult,
): DialogueResult<DialogueResponse> {
    const found = requireSession(sessionId);

    if (!found.ok) {
        return found;
    }

    const session = found.data;

    if (session.completed) {
        return failure('session_completed', `Dialogue "${session.dialogue_id}" has already finished.`, {
            session_id: sessionId,
        });
    }

    if (actionId !== undefined && session.processedActionIds.has(actionId)) {
        return failure('duplicate_action', `Action "${actionId}" was already processed.`, {
            session_id: sessionId,
            action_id: actionId,
        });
    }

    const step = runStep(session, (context) => walk(context, session));

    // Only a step that actually happened consumes the action id, so retrying a
    // refused action with the same id still works.
    if (step.ok && actionId !== undefined) {
        recordActionId(session, actionId);
    }

    return step;
}

/** Wraps a pre-walk guard failure as a failed walk. */
function guardFailure(
    code: DialogueErrorCode,
    message: string,
    details?: Record<string, unknown>,
): AdvanceResult {
    return advanceFailure(createDialogueError(code, message, details));
}

/** Wraps a guard failure as a failed walk so `runStep` handles it uniformly. */
function advanceFailure(error: DialogueError): AdvanceResult {
    return {
        nodeId: null,
        nodeType: null,
        view: null,
        choices: [],
        interactions: new Map(),
        completed: false,
        result: null,
        outcome: { changes: [], warnings: [], errors: [], music_requests: [] },
        castEvents: [],
        error,
    };
}

/**
 * Runs a walk against cloned state and commits it only if the walk succeeded.
 *
 * This is what makes a step atomic: the session's state and cast are replaced by
 * the drafts after the fact, never mutated in place.
 */
function runStep(
    session: DialogueSession,
    walk: (context: NodeContext) => AdvanceResult,
): DialogueResult<DialogueResponse> {
    const draftState = cloneWorldState(session.state);
    const draftCastState = cloneCastState(session.castState);

    const advanced = walk({
        definition: session.definition,
        state: draftState,
        castState: draftCastState,
        isKnownCharacter,
    });

    if (advanced.error) {
        return { ok: false, error: advanced.error };
    }

    if (advanced.outcome.errors.length > 0) {
        const [first, ...rest] = advanced.outcome.errors;

        return {
            ok: false,
            error: {
                ...first,
                details: {
                    ...(first.details ?? {}),
                    additional_errors: rest.map((error) => error.message),
                },
            },
        };
    }

    // The step succeeded, so the drafts become the session's state.
    session.state = draftState;
    session.castState = draftCastState;
    session.currentNodeId = advanced.nodeId;
    session.nodeType = advanced.nodeType;

    const changes: StateChange[] = [...advanced.outcome.changes];

    if (advanced.completed) {
        session.completed = true;
        session.result = advanced.result;
        persistence.clearCheckpoint(session.session_id);

        const seen = markDialogueSeen(session.state, session.dialogue_id, 'dialogue_completed');
        if (seen.change) {
            changes.push(seen.change);
        }

        emitDialogueEvent({
            type: 'dialogue_completed',
            session_id: session.session_id,
            dialogue_id: session.dialogue_id,
            result: advanced.result,
        });
    } else {
        saveCheckpoint(session);
    }

    for (const request of advanced.outcome.music_requests) {
        emitDialogueEvent({ type: 'music_requested', ...request });
    }

    return { ok: true, data: buildResponse(session, advanced, changes) };
}

/** Records where the player is, so a crashed session can be resumed. */
function saveCheckpoint(session: DialogueSession): void {
    if (session.currentNodeId === null) {
        return;
    }

    persistence.saveCheckpoint({
        session_id: session.session_id,
        dialogue_id: session.dialogue_id,
        node_id: session.currentNodeId,
        world_state: session.state,
        created_at: new Date().toISOString(),
    });
}

/** Remembers an action id, keeping the set bounded. */
function recordActionId(session: DialogueSession, actionId: string): void {
    session.processedActionIds.add(actionId);

    if (session.processedActionIds.size <= MAX_TRACKED_ACTION_IDS) {
        return;
    }

    const [oldest] = session.processedActionIds;

    if (oldest !== undefined) {
        session.processedActionIds.delete(oldest);
    }
}

/** Looks up a live session, enforcing the idle timeout. */
function requireSession(sessionId: string): DialogueResult<DialogueSession> {
    const session = sessions.get(sessionId);

    if (!session) {
        return failure('session_not_found', `Session "${sessionId}" does not exist.`, {
            session_id: sessionId,
        });
    }

    if (Date.now() - session.startedAt > SESSION_TTL_MS) {
        sessions.delete(sessionId);
        persistence.clearCheckpoint(sessionId);

        return failure('session_expired', `Session "${sessionId}" expired.`, {
            session_id: sessionId,
        });
    }

    return { ok: true, data: session };
}

/** Builds the presentation contract for one step. */
function buildResponse(
    session: DialogueSession,
    advanced: AdvanceResult,
    changes: StateChange[],
): DialogueResponse {
    return {
        session_id: session.session_id,
        status: session.completed ? 'completed' : 'active',
        current_node: advanced.view,
        cast_state: toCastView(session.castState),
        cast_events: advanced.castEvents,
        available_choices: advanced.choices,
        state_changes: changes,
        result: advanced.result,
        warnings: advanced.outcome.warnings,
    };
}

/** Session ids are unique within a process, which is all the caller needs. */
function createSessionId(): string {
    sessionCounter += 1;
    return `dialogue_session_${Date.now().toString(36)}_${sessionCounter}`;
}

/** Builds a failure value. */
function failure<T>(
    code: DialogueErrorCode,
    message: string,
    details?: Record<string, unknown>,
): DialogueResult<T> {
    return { ok: false, error: createDialogueError(code, message, details) };
}
