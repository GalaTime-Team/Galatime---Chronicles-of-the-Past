import type { WorldState } from '../../types/WorldStateType';
import { cloneWorldState } from '../state/worldStateService';

/**
 * Engine bookkeeping that outlives a single conversation.
 *
 * Note what is **not** here: which dialogues the player has seen. That lives in
 * `WorldState.dialogues.seen`, because it is game state the game owns and
 * persists. This service only holds things the dialogue engine needs for
 * itself, and is deliberately an interface so a Tauri-backed implementation can
 * replace the in-memory one without touching the session service.
 */

/** A resumable point inside a conversation. */
export interface DialogueCheckpoint {
    session_id: string;
    dialogue_id: string;
    /** Node the player was looking at when the checkpoint was taken. */
    node_id: string;
    /** Snapshot of the world state at that moment. */
    world_state: WorldState;
    created_at: string;
}

/** Storage the dialogue engine needs but does not own. */
export interface DialoguePersistence {
    /**
     * Whether a one-off effect has already paid out.
     *
     * The hook for effects that must not be granted twice across sessions;
     * nothing in the current file format marks an effect as unique yet.
     */
    hasAppliedUniqueEffect(key: string): boolean;
    markUniqueEffectApplied(key: string): void;

    saveCheckpoint(checkpoint: DialogueCheckpoint): void;
    loadCheckpoint(sessionId: string): DialogueCheckpoint | null;
    clearCheckpoint(sessionId: string): void;
}

/** Persistence that forgets everything when the process ends. */
export function createInMemoryPersistence(): DialoguePersistence {
    const appliedUniqueEffects = new Set<string>();
    const checkpoints = new Map<string, DialogueCheckpoint>();

    return {
        hasAppliedUniqueEffect(key: string): boolean {
            return appliedUniqueEffects.has(key);
        },

        markUniqueEffectApplied(key: string): void {
            appliedUniqueEffects.add(key);
        },

        saveCheckpoint(checkpoint: DialogueCheckpoint): void {
            checkpoints.set(checkpoint.session_id, {
                ...checkpoint,
                world_state: cloneWorldState(checkpoint.world_state),
            });
        },

        loadCheckpoint(sessionId: string): DialogueCheckpoint | null {
            return checkpoints.get(sessionId) ?? null;
        },

        clearCheckpoint(sessionId: string): void {
            checkpoints.delete(sessionId);
        },
    };
}
