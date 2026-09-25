import type { WorldState } from '../../types/WorldStateType';
import { appendToStateList } from './worldStateService';
import type { StateWriteResult } from './worldStateService';

/**
 * Unlock bookkeeping for dialogues and narrative paths.
 *
 * Unlocks are stored as lists rather than flags so the game can ask "what did
 * this conversation open up?" without enumerating a flag namespace.
 */

/** Path of the list of dialogues the player has already finished. */
export const DIALOGUE_SEEN_PATH = 'dialogues.seen';

/** Path of the list of dialogues the player is allowed to start. */
export const DIALOGUE_UNLOCKED_PATH = 'dialogues.unlocked';

/** Path of the list of narrative paths opened by dialogues. */
export const PATH_UNLOCKED_PATH = 'paths.unlocked';

/** Records that a dialogue was played to completion. */
export function markDialogueSeen(
    state: WorldState,
    dialogueId: string,
    source: string,
): StateWriteResult {
    return appendToStateList(state, DIALOGUE_SEEN_PATH, dialogueId, source);
}

/** Makes another dialogue available to start. */
export function unlockDialogue(
    state: WorldState,
    dialogueId: string,
    source: string,
): StateWriteResult {
    return appendToStateList(state, DIALOGUE_UNLOCKED_PATH, dialogueId, source);
}

/** Opens a narrative path. */
export function unlockPath(state: WorldState, pathId: string, source: string): StateWriteResult {
    return appendToStateList(state, PATH_UNLOCKED_PATH, pathId, source);
}

/** Whether the player has already finished a dialogue. */
export function hasSeenDialogue(state: WorldState, dialogueId: string): boolean {
    return state.dialogues.seen.includes(dialogueId);
}

/** Whether the player is allowed to start a dialogue. */
export function isDialogueUnlocked(state: WorldState, dialogueId: string): boolean {
    return state.dialogues.unlocked.includes(dialogueId);
}

/** Whether a narrative path is open. */
export function isPathUnlocked(state: WorldState, pathId: string): boolean {
    return state.paths.unlocked.includes(pathId);
}
