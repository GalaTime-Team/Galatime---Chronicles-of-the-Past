import type {
    DialogueDefinition,
    DialogueEndResult,
    DialogueResponse,
    DialogueResult,
    DialogueValidationReport,
} from '../types/DialogueType';
import type { WorldStateInput } from '../types/WorldStateType';
import { subscribeToDialogueEvents } from '../services/dialogue/eventService';
import { loadDialogue } from '../services/dialogue/loaderService';
import {
    continueSession,
    endSession,
    followSessionInteraction,
    selectSessionChoice,
    startSession,
    validateDialogueFile,
} from '../services/dialogue/sessionService';
import { playMusic } from './audioController';

/**
 * The dialogue API the rest of the app talks to.
 *
 * A thin facade over the session service, matching the endpoints described in
 * the development plan (`start`, `continue`, `choice`, `interactive-text`,
 * `end`, `validate`) as plain functions instead of HTTP routes — the app runs
 * the backend in-process.
 *
 * Every function returns a `DialogueResult` rather than throwing, so callers
 * branch on a stable error code instead of catching exceptions.
 */

/**
 * Starts a conversation and returns its first node.
 *
 * `worldState` is whatever the game wants the dialogue to be able to read.
 * Everything is optional; slices the game omits start empty.
 */
export async function startDialogue(
    dialogueId: string,
    worldState: WorldStateInput = {},
): Promise<DialogueResult<DialogueResponse>> {
    return startSession(dialogueId, worldState);
}

/** Advances past the current line. */
export function continueDialogue(
    sessionId: string,
    actionId?: string,
): DialogueResult<DialogueResponse> {
    return continueSession(sessionId, actionId);
}

/** Applies the choice the player selected. */
export function chooseDialogueOption(
    sessionId: string,
    choiceId: string,
    actionId?: string,
): DialogueResult<DialogueResponse> {
    return selectSessionChoice(sessionId, choiceId, actionId);
}

/** Follows an interactive text segment the player clicked. */
export function triggerDialogueInteraction(
    sessionId: string,
    interactionId: string,
    actionId?: string,
): DialogueResult<DialogueResponse> {
    return followSessionInteraction(sessionId, interactionId, actionId);
}

/**
 * Closes a conversation.
 *
 * The returned world state is what the game should keep: the dialogue engine
 * never persists narrative state itself.
 */
export function endDialogue(sessionId: string): DialogueResult<DialogueEndResult> {
    return endSession(sessionId);
}

/** Validates a dialogue file without starting it. */
export async function validateDialogue(
    dialogueId: string,
): Promise<DialogueResult<DialogueValidationReport>> {
    return validateDialogueFile(dialogueId);
}

/**
 * Reads a dialogue definition as authored.
 *
 * For tooling and previews that need the raw graph rather than a session.
 * Returns `null` when the file does not exist.
 */
export async function fetchDialogue(dialogueId: string): Promise<DialogueDefinition | null> {
    return loadDialogue(dialogueId);
}

/**
 * Wires dialogue events to the audio layer.
 *
 * Called once by the app at startup rather than at module scope, so importing
 * this controller (in tests, or in tooling) has no side effects. Returns the
 * unsubscribe function.
 *
 * The authored `loop` flag is not forwarded: looping is already declared per
 * track in the music catalogue, which is the single source of truth for it.
 */
export function connectDialogueAudio(): () => void {
    return subscribeToDialogueEvents((event) => {
        if (event.type === 'music_requested') {
            void playMusic(event.music_id);
        }
    });
}
