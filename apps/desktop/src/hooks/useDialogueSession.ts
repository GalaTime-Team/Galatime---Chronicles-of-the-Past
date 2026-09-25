import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    chooseDialogueOption,
    continueDialogue,
    endDialogue,
    startDialogue,
    triggerDialogueInteraction,
} from '../controllers/dialogueController';
import { resolveCharacter } from '../services/dialogue/characterRegistryService';
import type {
    DialogueCastMemberView,
    DialogueChoiceView,
    DialogueEndResult,
    DialogueError,
    DialogueResponse,
    DialogueSegment,
} from '../types/DialogueType';
import type { WorldStateInput } from '../types/WorldStateType';

/**
 * Drives one conversation and exposes it as a state machine.
 *
 * The states are explicit so that nothing can happen twice: a second key press
 * during `processing_action` is dropped, and a click while `typing` finishes the
 * page instead of skipping the line.
 *
 * Every mutation goes through `dialogueController`. This hook never touches the
 * world state itself — the state the conversation produced comes back from
 * `finish()`, and it is the caller's to keep.
 */

/**
 * What the surface is doing right now.
 *
 * `transitioning` and `playing_animation` from the development plan are not
 * modelled separately: both are `processing_action`, because in every case the
 * rule is the same — the player cannot act until the surface comes back.
 */
export type DialogueStatus =
    /** No conversation. */
    | 'idle'
    /** The session is being started. */
    | 'loading'
    /** A page is still appearing. */
    | 'typing'
    /** The page is complete and the player can advance. */
    | 'waiting_for_input'
    /** The node is a choice and the player is picking an option. */
    | 'showing_choices'
    /** A step is in flight; input is ignored. */
    | 'processing_action'
    /** The conversation reached an `end` node. */
    | 'completed'
    /** The last step failed; `error` says why. */
    | 'error';

/** Everything the caller may want to know about the running conversation. */
export interface DialogueSessionSnapshot {
    status: DialogueStatus;
    sessionId: string | null;
    response: DialogueResponse | null;
    error: DialogueError | null;
}

export interface DialogueSessionState extends DialogueSessionSnapshot {
    /** Display name of the speaker, resolved through the character registry. */
    speakerName: string;
    /** The current node's text. Empty when there is no node to show. */
    segments: DialogueSegment[];
    /**
     * The current node's emotion, which overrides the speaker's own expression.
     *
     * A line and a choice question carry one the same way, so the sprite reacts
     * to both without the view having to know which kind of node it is showing.
     */
    emotion: string | null;
    /** Everyone the dialogue has in the conversation, speaker included. */
    castCharacters: DialogueCastMemberView[];
    /** Options to render; only ever non-empty on a `choice` node. */
    choices: DialogueChoiceView[];
    /** Outcome label, once the conversation has ended. */
    result: string | null;
    /** Starts a conversation, replacing any that is running. */
    start: (dialogueId: string, worldState?: WorldStateInput) => Promise<void>;
    /** Advances past a finished line. */
    advance: () => void;
    /** Applies the chosen option. */
    choose: (choiceId: string) => void;
    /** Follows a clickable phrase inside the current line. */
    interact: (interactionId: string) => void;
    /**
     * Reports whether a page is still typing.
     *
     * The box owns the typewriter, so this is how the state machine learns that a
     * line has finished appearing without duplicating the pacing rules.
     */
    reportTyping: (isTyping: boolean) => void;
    /** Closes the session and hands back the world state to keep. */
    finish: () => DialogueEndResult | null;
    /** Drops the session without reporting anything. */
    reset: () => void;
}

/** Stable stand-ins, so a re-render with no node does not churn identities. */
const NO_SEGMENTS: DialogueSegment[] = [];
const NO_CAST: DialogueCastMemberView[] = [];
const NO_CHOICES: DialogueChoiceView[] = [];

export function useDialogueSession(): DialogueSessionState {
    const [status, setStatus] = useState<DialogueStatus>('idle');
    const [response, setResponse] = useState<DialogueResponse | null>(null);
    const [error, setError] = useState<DialogueError | null>(null);

    const sessionId = response?.session_id ?? null;

    /**
     * A session nobody can reach is dead weight in the backend's map.
     *
     * The surface can be unmounted mid-conversation — the host navigates away, the
     * tool switches tab — and nothing would ever call `finish()`. Closing it here
     * means the engine only ever holds conversations that are still on screen; the
     * idle timeout is then a backstop rather than the mechanism.
     */
    const sessionIdRef = useRef<string | null>(null);
    sessionIdRef.current = sessionId;

    useEffect(() => () => {
        const id = sessionIdRef.current;

        if (id) {
            endDialogue(id);
        }
    }, []);

    /**
     * Moves to the state a freshly received response implies.
     *
     * A choice node is the only node that waits for something other than the
     * advance control, so everything else starts by typing — including a line with
     * no text, which the box reports as finished immediately.
     */
    const applyResponse = useCallback((next: DialogueResponse) => {
        setResponse(next);
        setError(null);

        if (next.status === 'completed') {
            setStatus('completed');
            return;
        }

        setStatus(next.current_node?.next_action === 'choose' ? 'showing_choices' : 'typing');
    }, []);

    const start = useCallback(async (dialogueId: string, worldState: WorldStateInput = {}) => {
        setStatus('loading');
        setResponse(null);
        setError(null);

        const outcome = await startDialogue(dialogueId, worldState);

        if (!outcome.ok) {
            setError(outcome.error);
            setStatus('error');
            return;
        }

        applyResponse(outcome.data);
    }, [applyResponse]);

    const advance = useCallback(() => {
        if (!response || !sessionId) {
            return;
        }

        // Only a finished line may be advanced. A click while typing is the box's
        // to interpret, and a choice node has its own path.
        if (response.current_node?.next_action !== 'continue') {
            return;
        }

        setStatus('processing_action');

        const outcome = continueDialogue(sessionId);

        if (!outcome.ok) {
            setError(outcome.error);
            setStatus('error');
            return;
        }

        applyResponse(outcome.data);
    }, [response, sessionId, applyResponse]);

    const choose = useCallback((choiceId: string) => {
        if (!sessionId) {
            return;
        }

        setStatus('processing_action');

        const outcome = chooseDialogueOption(sessionId, choiceId);

        if (!outcome.ok) {
            setError(outcome.error);
            setStatus('error');
            return;
        }

        applyResponse(outcome.data);
    }, [sessionId, applyResponse]);

    const interact = useCallback((interactionId: string) => {
        if (!sessionId) {
            return;
        }

        setStatus('processing_action');

        const outcome = triggerDialogueInteraction(sessionId, interactionId);

        if (!outcome.ok) {
            setError(outcome.error);
            setStatus('error');
            return;
        }

        applyResponse(outcome.data);
    }, [sessionId, applyResponse]);

    const reportTyping = useCallback((isTyping: boolean) => {
        // Guarded so a late report from a page that is being replaced cannot pull
        // the surface back out of `processing_action` or a choice.
        setStatus((previous) => {
            if (previous !== 'typing' && previous !== 'waiting_for_input') {
                return previous;
            }

            return isTyping ? 'typing' : 'waiting_for_input';
        });
    }, []);

    const finish = useCallback((): DialogueEndResult | null => {
        if (!sessionId) {
            setResponse(null);
            setStatus('idle');
            return null;
        }

        const outcome = endDialogue(sessionId);

        setResponse(null);
        setError(null);
        setStatus('idle');

        return outcome.ok ? outcome.data : null;
    }, [sessionId]);

    const reset = useCallback(() => {
        setResponse(null);
        setError(null);
        setStatus('idle');
    }, []);

    const speakerName = useMemo(() => {
        const speakerId = response?.current_node?.speaker_id;

        if (!speakerId) {
            return '';
        }

        // The dialogue file only stores the id; the name belongs to the character
        // catalogue. An id that resolves to nothing is shown as-is rather than
        // hidden, so an unauthored character is visible in the scene.
        return resolveCharacter(speakerId)?.display_name ?? speakerId;
    }, [response]);

    return {
        status,
        sessionId,
        response,
        error,
        speakerName,
        segments: response?.current_node?.text ?? NO_SEGMENTS,
        emotion: response?.current_node?.emotion ?? null,
        castCharacters: response?.cast_state.characters ?? NO_CAST,
        choices: response?.available_choices ?? NO_CHOICES,
        result: response?.result ?? null,
        start,
        advance,
        choose,
        interact,
        reportTyping,
        finish,
        reset,
    };
}
