import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DialogueCastEvent, DialogueEndResult } from '../../../types/DialogueType';
import type { StateChange, WorldStateInput } from '../../../types/WorldStateType';
import { useControlListener, useGame } from '../../../context/GameContext';
import { playSfx } from '../../../controllers/audioController';
import {
    useDialogueSession,
    type DialogueSessionSnapshot,
} from '../../../hooks/useDialogueSession';
import { useElementWidth } from '../../../hooks/useElementWidth';
import { resolveVisibleCharacterCap } from '../../../services/dialogueCastService';
import { DIALOGUE_AUTO_CLOSE_HOLD_MS, DIALOGUE_DEFAULT_TEXT_SPEED } from '../../../constants/DialogueConstants';
import GameDialogue, { type GameDialogueHandle } from './GameDialogue';
import { DialogueChoiceList } from './DialogueChoiceList';
import { DialogueCastStage } from './DialogueCastStage';
import {
    DialogueErrorPanel,
    DialogueLoadingPanel,
    DialogueResultPanel,
} from './DialogueStatusPanels';

/**
 * The dialogue surface: the stage, the cast, the options and the box.
 *
 * It is the only part of the frontend that decides what an input means, because
 * the meaning changes with the state — one press finishes a page, turns a page,
 * confirms a choice, or closes the conversation. Everything below it draws; this
 * is where the routing happens.
 *
 * It is also the only part that talks to `dialogueController`, through
 * `useDialogueSession`. Nothing here writes narrative state: the state the
 * conversation produced is handed to `onFinished`.
 */

export interface DialogueViewProps {
    /** Dialogue to run. `null` leaves the surface idle. */
    dialogueId: string | null;
    /**
     * What the conversation may read.
     *
     * Read when a conversation starts, never on render — passing an inline object
     * must not restart the dialogue. Use `sessionKey` to restart deliberately.
     */
    worldState?: WorldStateInput;
    /** Changing this starts the conversation again, even for the same id. */
    sessionKey?: string | number;
    textSpeed?: number;
    /** Reveals text instantly and skips entrance travel. */
    reduceMotion?: boolean;
    /** Reports the session state so tooling can render its own readout. */
    onSessionChange?: (snapshot: DialogueSessionSnapshot) => void;
    /** The conversation ended and was closed; the caller gets the state to keep. */
    onFinished?: (result: DialogueEndResult) => void;
    /** The conversation was dismissed before it ended. */
    onExit?: () => void;
    /** Shown on the stage while there is no conversation. */
    idleContent?: ReactNode;
    className?: string;
    stageClassName?: string;
}

const NO_EVENTS: DialogueCastEvent[] = [];
const NO_CHANGES: StateChange[] = [];

export function DialogueView({
    dialogueId,
    worldState,
    sessionKey,
    textSpeed = DIALOGUE_DEFAULT_TEXT_SPEED,
    reduceMotion = false,
    onSessionChange,
    onFinished,
    onExit,
    idleContent,
    className = '',
    stageClassName = '',
}: DialogueViewProps) {
    const { registerModalLayer } = useGame();
    const session = useDialogueSession();
    const dialogueRef = useRef<GameDialogueHandle>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    /**
     * The stage box, measured so the cast fits it.
     *
     * How many characters stand on the stage and how large each of them is are
     * the same decision — see `DIALOGUE_SPRITE_MIN_HEIGHT_PX` — so the stage
     * has to be measured rather than assumed. It is the whole window in the game
     * and one column in the playground, and the render scale shrinks both, so
     * there is no constant that would be right in every one of those cases.
     */
    const stageRef = useRef<HTMLDivElement>(null);
    const stageWidth = useElementWidth(stageRef);
    const maxVisibleCharacters = resolveVisibleCharacterCap(stageWidth);

    const {
        status,
        sessionId,
        response,
        error,
        speakerName,
        segments,
        emotion,
        castCharacters,
        choices,
        result,
        start,
        advance,
        choose,
        interact,
        reportTyping,
        finish,
    } = session;

    const node = response?.current_node ?? null;
    const showBox = node !== null;

    const worldStateRef = useRef(worldState);
    worldStateRef.current = worldState;

    /**
     * Whether the node the player last saw was self-advancing.
     *
     * Kept in a ref because it is needed exactly when there is no node left: a
     * self-advancing line walks into the `end` node in the same step, so the
     * response that reports `completed` carries `current_node: null` and the
     * decision "should this close itself?" has to be remembered from before.
     */
    const lastNodeAutoAdvance = useRef(false);

    useEffect(() => {
        if (node) {
            lastNodeAutoAdvance.current = node.auto_advance;
        }
    }, [node]);

    // Starting is keyed on the id and the caller's key, so a re-render never
    // restarts a conversation that is already running.
    useEffect(() => {
        if (!dialogueId) {
            return;
        }

        void start(dialogueId, worldStateRef.current);
    }, [dialogueId, sessionKey, start]);

    // While a conversation is running it owns the controls: the screen underneath
    // must not also answer the same press. That is what keeps Escape ending the
    // dialogue instead of leaving the screen that hosts it.
    const isActive = status !== 'idle';

    useEffect(() => {
        if (!isActive) {
            return undefined;
        }

        return registerModalLayer();
    }, [isActive, registerModalLayer]);

    useEffect(() => {
        onSessionChange?.({ status, sessionId, response, error });
    }, [onSessionChange, status, sessionId, response, error]);

    // A new set of options always starts on the first one.
    useEffect(() => {
        setSelectedIndex(0);
    }, [choices]);

    /**
     * One press means one action.
     *
     * A controller's south button is bound to both `confirm` and `advance`, and a
     * key shared by two controls fires both handlers, so a single press would
     * otherwise advance twice. The lock lifts on the next frame: it swallows the
     * duplicate produced by one press, not a genuine second one.
     */
    const inputLocked = useRef(false);

    const runOnce = useCallback((action: () => void) => {
        if (inputLocked.current) {
            return;
        }

        inputLocked.current = true;
        window.requestAnimationFrame(() => {
            inputLocked.current = false;
        });

        action();
    }, []);

    const closeSession = useCallback((reason: 'finished' | 'dismissed') => {
        const outcome = finish();

        if (reason === 'finished' && outcome) {
            onFinished?.(outcome);
            return;
        }

        onExit?.();
    }, [finish, onFinished, onExit]);

    const handleAdvance = useCallback(() => {
        runOnce(() => {
            switch (status) {
                case 'typing':
                    // The page is still appearing, so the press means "show me all
                    // of it" rather than "move on".
                    dialogueRef.current?.skipTyping();
                    return;

                case 'waiting_for_input':
                    advance();
                    return;

                case 'showing_choices': {
                    const choice = choices[selectedIndex];
                    if (choice) {
                        choose(choice.choice_id);
                    }
                    return;
                }

                case 'completed':
                    closeSession('finished');
                    return;

                default:
                    // `loading`, `processing_action`, `error` and `idle` all mean
                    // the surface is not taking input.
                    return;
            }
        });
    }, [runOnce, status, dialogueRef, advance, choices, selectedIndex, choose, closeSession]);

    const moveSelection = useCallback((step: number) => {
        runOnce(() => {
            if (status !== 'showing_choices' || choices.length === 0) {
                return;
            }

            // Wraps, so a short list never traps the highlight at one end.
            const next = (selectedIndex + step + choices.length) % choices.length;

            if (next === selectedIndex) {
                return;
            }

            void playSfx('hover');
            setSelectedIndex(next);
        });
    }, [runOnce, status, choices.length, selectedIndex]);

    useControlListener({
        advance: handleAdvance,
        confirm: handleAdvance,
        up: () => moveSelection(-1),
        down: () => moveSelection(1),
        deny: () => runOnce(() => closeSession('dismissed')),
    }, { ignoreRepeat: true });

    // A conversation that ran itself off the end of a self-advancing line is not
    // waiting for a click to dismiss the result panel either. Anything that
    // reached the ending from a line the player had to advance still waits.
    useEffect(() => {
        if (status !== 'completed' || !lastNodeAutoAdvance.current) {
            return undefined;
        }

        const timer = window.setTimeout(
            () => closeSession('finished'),
            DIALOGUE_AUTO_CLOSE_HOLD_MS,
        );

        return () => window.clearTimeout(timer);
    }, [status, closeSession]);

    return (
        <div className={`relative flex flex-col overflow-hidden bg-galatime-background ${className}`}>
            {/*
              Stage. The cast stands here, and the box overlays its lower edge.

              `z-0 isolate` makes the stage its own stacking context, so the layers
              the cast gives its characters stay inside it and can never outrank the
              box below. The clip is on the inner frame rather than on the stage, so
              the artwork is cut off at the stage's edges while the options — which
              grow upwards from the box and may be taller than the stage — are not.
            */}
            <div ref={stageRef} className={`relative isolate z-0 min-h-0 flex-1 ${stageClassName}`}>
                <div className="absolute inset-0 overflow-hidden">
                    {/*
                      No background artwork exists yet, so the stage is a gradient.
                      Backgrounds belong to the scene system; a conversation only draws
                      the characters taking part in it.
                    */}
                    <div className="absolute inset-0 bg-linear-to-b from-galatime-dark to-galatime-background" />

                    <DialogueCastStage
                        characters={castCharacters}
                        castEvents={response?.cast_events ?? NO_EVENTS}
                        speakerId={node?.speaker_id ?? null}
                        speakerEmotion={emotion}
                        reduceMotion={reduceMotion}
                        maxVisibleCharacters={maxVisibleCharacters}
                    />

                    {/* Only while idle: once a conversation starts, the panels below take over. */}
                    {status === 'idle' && idleContent}
                </div>

                {/*
                  The options float over the stage rather than sitting in the flow
                  above the box. In the flow they would shorten the stage to nothing
                  and take the cast with them, which is exactly the moment the player
                  wants to see who is talking to them. `z-20` puts them above every
                  character, whose layers live inside the isolated stage.
                */}
                {status === 'showing_choices' && (
                    <div className="absolute inset-x-0 bottom-0 z-20 flex justify-end px-4 pb-1">
                        <DialogueChoiceList
                            choices={choices}
                            selectedIndex={selectedIndex}
                            onHighlight={setSelectedIndex}
                            onSelect={(choice) => choose(choice.choice_id)}
                        />
                    </div>
                )}
            </div>

            {/* The box, and the panels that replace it. */}
            <div className="relative z-10 flex shrink-0 flex-col items-end px-4 pb-4">
                {showBox && (
                    <GameDialogue
                        ref={dialogueRef}
                        speakerName={speakerName}
                        segments={segments}
                        textSpeed={textSpeed}
                        // A choice node is answered by the list, not by the box.
                        showIndicator={node?.next_action === 'continue'}
                        // The line drives itself when the author said so; a choice
                        // node never does, which is why the backend reports false.
                        autoAdvance={node?.auto_advance ?? false}
                        disabled={status === 'processing_action' || status === 'loading'}
                        reduceMotion={reduceMotion}
                        onInteraction={interact}
                        onAdvance={advance}
                        onTypingChange={reportTyping}
                    />
                )}

                {!showBox && status === 'loading' && <DialogueLoadingPanel />}

                {!showBox && status === 'error' && error && (
                    <DialogueErrorPanel
                        error={error}
                        onDismiss={() => closeSession('dismissed')}
                    />
                )}

                {!showBox && status === 'completed' && (
                    <DialogueResultPanel
                        result={result}
                        changes={response?.state_changes ?? NO_CHANGES}
                        onClose={() => closeSession('finished')}
                    />
                )}
            </div>
        </div>
    );
}

export default DialogueView;
