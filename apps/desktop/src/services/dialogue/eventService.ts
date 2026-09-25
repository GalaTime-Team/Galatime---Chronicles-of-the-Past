/**
 * Domain events the dialogue engine emits.
 *
 * The engine never touches presentation concerns directly. Requests such as
 * "play this music" are published here and the controller decides what to do
 * with them, which keeps the backend free of UI dependencies and makes the
 * events trivial to assert in tests.
 */

/** Ask the presentation layer to change the background music. */
export interface MusicRequestedEvent {
    type: 'music_requested';
    music_id: string;
    loop: boolean;
}

/** A conversation finished. */
export interface DialogueCompletedEvent {
    type: 'dialogue_completed';
    session_id: string;
    dialogue_id: string;
    result: string | null;
}

/** Any event a dialogue can publish. */
export type DialogueEvent = MusicRequestedEvent | DialogueCompletedEvent;

const listeners: Set<(event: DialogueEvent) => void> = new Set();

/**
 * Registers a listener and returns its unsubscribe function.
 *
 * Mirrors the subscription style already used by the audio and image-rendering
 * services.
 */
export function subscribeToDialogueEvents(listener: (event: DialogueEvent) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Publishes an event.
 *
 * A failing listener is logged and skipped so one broken subscriber cannot
 * abort a conversation mid-step.
 */
export function emitDialogueEvent(event: DialogueEvent): void {
    for (const listener of listeners) {
        try {
            listener(event);
        } catch (error) {
            console.error('Dialogue event listener failed:', error);
        }
    }
}

/** Removes every listener. Intended for tests. */
export function clearDialogueEventListeners(): void {
    listeners.clear();
}
