import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TargetAndTransition, Transition } from 'framer-motion';
import type { DialogueCastEvent, DialogueCastMemberView } from '../../../types/DialogueType';
import CommonImage from '../../common/CommonImage';
import { UnknownIcon } from '../../../assets/GalatimeIcon';
import { playSfx } from '../../../controllers/audioController';
import { resolveCharacter } from '../../../services/dialogue/characterRegistryService';
import { resolveCharacterPortrait } from '../../../services/characterPortraitService';
import { orderByDepth, resolveStageCast } from '../../../services/dialogueCastService';
import {
    DIALOGUE_CHARACTER_ACTIVE_CLASS,
    DIALOGUE_CHARACTER_DIM_CLASS,
    DIALOGUE_MAX_VISIBLE_CHARACTERS,
    DIALOGUE_MISSING_SPRITE_OPACITY,
    DIALOGUE_POSE_TRANSITION_MS,
    DIALOGUE_SIT_SPRITE_OFFSET_PERCENT,
    DIALOGUE_SIT_SPRITE_SCALE,
    DIALOGUE_SLOT_CENTRES,
    DIALOGUE_SPRITE_BOX_CLASS,
    DIALOGUE_SPRITE_LAYOUT,
} from '../../../constants/DialogueConstants';
import {
    DIALOGUE_CHARACTER_EXPRESSION_DURATION,
    DIALOGUE_CHARACTER_VARIANTS,
    DIALOGUE_POSE_CHANGE_DURATION,
    DIALOGUE_SLOT_MOVE_TRANSITION,
    DIALOGUE_STAND_UP_LIFT_PERCENT,
    DIALOGUE_STEP_ACROSS_DURATION,
    DIALOGUE_STEP_ACROSS_TRAVEL_PERCENT,
    resolveEntranceOffset,
} from '../../../constants/DialogueAnimationConstants';
import {
    DIALOGUE_DEFAULT_FLAVOUR,
    resolveAnimationFlavour,
    resolveAnimationKind,
    type DialogueMotionFlavour,
} from '../../../constants/DialogueVocabulary';

/**
 * The characters taking part in the conversation.
 *
 * The stage draws the **cast the dialogue declared**, not just whoever is
 * talking: a conversation routinely holds two or three characters while one of
 * them speaks, and the silent ones still have to be there — dimmed, so the line
 * being read is the brightest thing on screen.
 *
 * **The stage lays itself out.** It works out how many characters it is drawing
 * and spreads them across it, up to `DIALOGUE_MAX_VISIBLE_CHARACTERS` — and fewer
 * than that when the stage is too narrow to give each of them a readable size, so
 * a phone shows two where a desktop shows four. The authored `position` decides
 * the order they stand in rather than an exact spot, because a dialogue can only
 * name five positions and a fourth character has to stand somewhere regardless —
 * see `dialogueCastService` for the rules.
 *
 * **Depth decides who is drawn in front of whom**, and the order they arrived
 * in breaks the tie between two characters at the same depth. The two orders are
 * independent on purpose: the character in front may well be the one standing
 * on the left.
 *
 * **A pose is drawn, not shown.** The game has one sprite per emotion, so a
 * character who is sitting is drawn shorter and lower than one who is standing.
 * The change settles over a moment, which is what makes standing up read as a
 * movement rather than as a cut.
 *
 * The sprite comes from the character's `tsp` folder, in the emotion the cast
 * carries for them. That emotion is a character's own state rather than a
 * property of the line: an entrance sets it, and every line that names an
 * `emotion` updates it, so somebody keeps the face they last spoke with instead
 * of dropping back to the emotion they entered with as soon as the next node
 * arrives.
 */

export interface DialogueCastStageProps {
    /** Everyone in the conversation, as the backend reports them. */
    characters: DialogueCastMemberView[];
    /**
     * The cast changes that produced this state.
     *
     * Used to read the authored `animation_id` of an entrance, an action or an
     * exit — so `step_in` can read heavier than `leave_running` — and to play
     * the sound the movement makes.
     */
    castEvents: DialogueCastEvent[];
    /** Who is speaking. Everyone else is dimmed; `null` dims nobody. */
    speakerId: string | null;
    /**
     * The current node's emotion, which overrides the speaker's own.
     *
     * The cast already carries this — a line updates the speaker's emotion as it
     * is reached — so the override is a safety net rather than the mechanism: it
     * keeps the line right even when the speaker is not in the cast at all.
     */
    speakerEmotion?: string | null;
    /** Skips the entrance travel; the accessibility setting wins. */
    reduceMotion?: boolean;
    /**
     * How many characters the stage has room for.
     *
     * A question about the stage's width, not about the conversation, so the
     * answer comes from `resolveVisibleCharacterCap` over a measurement of the
     * stage box. Defaults to the ceiling: an unmeasured stage draws everyone it
     * is allowed to rather than guessing at a smaller number.
     */
    maxVisibleCharacters?: number;
    className?: string;
}

export function DialogueCastStage({
    characters,
    castEvents,
    speakerId,
    speakerEmotion = null,
    reduceMotion = false,
    maxVisibleCharacters = DIALOGUE_MAX_VISIBLE_CHARACTERS,
    className = '',
}: DialogueCastStageProps) {
    // The last event for a character wins: it describes the move happening now.
    const flavourByCharacter = useMemo(() => {
        const flavours = new Map<string, DialogueMotionFlavour>();

        for (const event of castEvents) {
            flavours.set(event.character_id, resolveAnimationFlavour(event.animation_id));
        }

        return flavours;
    }, [castEvents]);

    /**
     * The last event for each character, by id.
     *
     * The stage needs two things out of them: how the character should move
     * now, and what sound that movement makes.
     */
    const eventByCharacter = useMemo(() => {
        const events = new Map<string, DialogueCastEvent>();

        for (const event of castEvents) {
            events.set(event.character_id, event);
        }

        return events;
    }, [castEvents]);

    /**
     * The sound a movement makes, played once when it happens.
     *
     * Guarded by the identity of the events array: the same step must not make
     * the same sound twice, even when React runs the effect twice.
     */
    const playedEvents = useRef<DialogueCastEvent[] | null>(null);

    useEffect(() => {
        if (castEvents.length === 0 || playedEvents.current === castEvents) {
            return;
        }

        playedEvents.current = castEvents;

        for (const event of castEvents) {
            if (event.sfx_id) {
                void playSfx(event.sfx_id);
            }
        }
    }, [castEvents]);

    // Who is on stage, and in what order — see `dialogueCastService` for the rules.
    const cast = useMemo(
        () => resolveStageCast(characters, speakerId, maxVisibleCharacters).map((character) => {
            const resolved = resolveCharacter(character.character_id);
            const displayName = resolved?.display_name ?? character.character_id;
            const isSpeaker = speakerId !== null && speakerId === character.character_id;

            // Every character already wears the face they should be drawn with:
            // their entrance set it, and every line that named an emotion has
            // updated it since (see `setCharacterEmotion`). So nothing here has to
            // remember an emotion, and nothing here can forget one — which is
            // exactly what used to send a character back to their entrance
            // emotion the moment somebody else started talking. The line being
            // read is the one exception: it wins for whoever is saying it.
            const emotion = isSpeaker ? speakerEmotion ?? character.emotion : character.emotion;

            return {
                ...character,
                isSpeaker,
                displayName,
                portraitUrl: resolveCharacterPortrait(
                    character.character_id,
                    emotion,
                    resolved?.display_name ?? null,
                )?.url ?? null,
            };
        }),
        [characters, speakerId, speakerEmotion, maxVisibleCharacters],
    );

    /**
     * Who is drawn in front of whom.
     *
     * The rank is the z-index: depth first, and the order they arrived in
     * breaking the tie. It is a separate order from the left-to-right one, so
     * a character can be standing on the left and still be drawn in front.
     */
    const depthRank = useMemo(() => {
        const ranks = new Map<string, number>();

        orderByDepth(cast).forEach((character, index) => {
            ranks.set(character.character_id, index + 1);
        });

        return ranks;
    }, [cast]);

    /**
     * The movement each kind of action performs.
     *
     * Kept in a table rather than built on every render: the motion library
     * reads a changed target as a new animation, so a fresh object would
     * restart the movement every time anything else on the surface changed.
     */
    const actionMotions = useMemo(() => {
        const motions = new Map<string, { animate: TargetAndTransition; transition: Transition }>();

        for (const kind of ['stand_up', 'sit_down', 'step_across']) {
            motions.set(kind, resolveActionMotion(kind, reduceMotion));
        }

        motions.set('', resolveActionMotion(null, reduceMotion));

        return motions;
    }, [reduceMotion]);

    /** The movement of a given kind, or the still one. */
    const motionFor = (kind: string | null) =>
        actionMotions.get(kind ?? '') ?? actionMotions.get('') as { animate: TargetAndTransition; transition: Transition };

    if (cast.length === 0) {
        return null;
    }

    // Laid out for the cast the stage actually has, not for the positions the
    // dialogue asked for.
    const slotCentres = DIALOGUE_SLOT_CENTRES[cast.length]
        ?? DIALOGUE_SLOT_CENTRES[DIALOGUE_MAX_VISIBLE_CHARACTERS];
    const spriteLayout = DIALOGUE_SPRITE_LAYOUT[cast.length]
        ?? DIALOGUE_SPRITE_LAYOUT[DIALOGUE_MAX_VISIBLE_CHARACTERS];

    return (
        // Decorative: clicks belong to the dialogue box in front of it. `isolate`
        // contains the per-character layers inside this subtree, so no cast layer
        // can ever paint over the options floating above the stage.
        <div className={`pointer-events-none absolute inset-0 isolate ${className}`}>
            <AnimatePresence>
                {cast.map((character, index) => {
                    const flavour = flavourByCharacter.get(character.character_id)
                        ?? DIALOGUE_DEFAULT_FLAVOUR;
                    const centre = slotCentres[index];
                    const event = eventByCharacter.get(character.character_id);
                    const kind = resolveAnimationKind(event?.animation_id);

                    /**
                     * Where the character travels, when they are leaving.
                     *
                     * An exit has its own side: the node says which way they
                     * go, and that is the side they walk off towards. While they
                     * are still on stage the entrance offset is what would
                     * apply, and the two never apply at the same time.
                     */
                    const exitOffset = event?.kind === 'exit'
                        && (event.direction === 'left' || event.direction === 'right')
                        ? (event.direction === 'left' ? -1 : 1) * 0.12 * flavour.travel
                        : null;

                    const travelOffset = exitOffset ?? resolveEntranceOffset(centre, flavour);

                    // The slot is a full-width box whose centre is moved onto the slot's
                    // position, so the sprite can be sized as a fraction of the stage
                    // and still land exactly where the layout put it. The centring is a
                    // class rather than an inline transform, because the inline one
                    // would overwrite the transform the motion variants animate.
                    const style: CSSProperties = {
                        left: `${centre}%`,
                        zIndex: depthRank.get(character.character_id) ?? character.layer,
                        // Slides when the cast grows or shrinks and every slot is
                        // recalculated. On `left`, so it cannot fight the variants.
                        transition: reduceMotion ? 'none' : DIALOGUE_SLOT_MOVE_TRANSITION,
                    };

                    /**
                     * The pose, drawn as a change of size and height.
                     *
                     * A transition rather than a jump: standing up and sitting down
                     * are movements, and a cut would lose them.
                     *
                     * The filter is on the same transition: the sprite dims when
                     * somebody else starts talking, and that fade has to survive
                     * the pose being there.
                     */
                    const isSitting = character.pose === 'sit';
                    const actionMotion = motionFor(kind);
                    const poseStyle: CSSProperties = {
                        transform: isSitting
                            ? `scale(${DIALOGUE_SIT_SPRITE_SCALE}) translateY(${DIALOGUE_SIT_SPRITE_OFFSET_PERCENT}%)`
                            : 'scale(1)',
                        transformOrigin: 'bottom center',
                        transition: reduceMotion
                            ? 'none'
                            : `transform ${DIALOGUE_POSE_TRANSITION_MS}ms ease-out, filter 300ms ease-out`,
                    };

                    return (
                        <div
                            key={character.character_id}
                            style={style}
                            className="absolute bottom-0 flex h-full w-full -translate-x-1/2 flex-col items-center justify-end"
                        >
                            <motion.div
                                custom={reduceMotion ? 0 : travelOffset}
                                variants={DIALOGUE_CHARACTER_VARIANTS}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="flex h-full w-full flex-col items-center justify-end"
                            >
                                {/*
                                  The action movement, on its own element so it cannot
                                  fight the entrance variants above or the pose below:
                                  the variants animate `x` and `y`, the pose is a
                                  transform on the sprite itself.
                                */}
                                <motion.div
                                    className="flex h-full w-full flex-col items-center justify-end"
                                    animate={actionMotion.animate}
                                    transition={actionMotion.transition}
                                >
                                    <div
                                        style={poseStyle}
                                        className={`${spriteLayout.widthClass} ${DIALOGUE_SPRITE_BOX_CLASS} ${
                                            character.isSpeaker
                                                ? DIALOGUE_CHARACTER_ACTIVE_CLASS
                                                : DIALOGUE_CHARACTER_DIM_CLASS
                                        }`}
                                    >
                                        {/* Keyed by the sprite, so a change of emotion fades the new one in. */}
                                        <motion.div
                                            key={character.portraitUrl ?? 'missing'}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: DIALOGUE_CHARACTER_EXPRESSION_DURATION }}
                                            className="h-full w-full"
                                        >
                                            {character.portraitUrl ? (
                                                <CommonImage
                                                    src={character.portraitUrl}
                                                    alt={character.displayName}
                                                    className="h-full w-full"
                                                />
                                            ) : (
                                                // A character with no artwork still has to be
                                                // present: hiding them would silently change
                                                // what the conversation appears to say.
                                                <div
                                                    className="flex h-full w-full items-center justify-center"
                                                    style={{ opacity: DIALOGUE_MISSING_SPRITE_OPACITY }}
                                                >
                                                    <UnknownIcon className="h-2/3 w-2/3 text-white" />
                                                </div>
                                            )}
                                        </motion.div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        </div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

/**
 * The movement an action performs, as a framer-motion target.
 *
 * Only the movements that happen while the character stays on stage are here:
 * standing up, sitting down and stepping across. An entrance and an exit are
 * the variants above, and an idle is nothing at all.
 */
function resolveActionMotion(
    kind: string | null,
    reduceMotion: boolean,
): { animate: TargetAndTransition; transition: Transition } {
    if (reduceMotion || !kind) {
        return { animate: {}, transition: { duration: 0 } };
    }

    switch (kind) {
        case 'stand_up':
            return {
                animate: { y: [`${DIALOGUE_STAND_UP_LIFT_PERCENT}%`, '0%'] },
                transition: { duration: DIALOGUE_POSE_CHANGE_DURATION, ease: 'easeOut' },
            };

        case 'sit_down':
            return {
                animate: { y: ['0%', `${DIALOGUE_STAND_UP_LIFT_PERCENT}%`] },
                transition: { duration: DIALOGUE_POSE_CHANGE_DURATION, ease: 'easeOut' },
            };

        case 'step_across':
            return {
                animate: { x: ['0%', `${DIALOGUE_STEP_ACROSS_TRAVEL_PERCENT}%`, '0%'] },
                transition: { duration: DIALOGUE_STEP_ACROSS_DURATION, ease: 'easeOut' },
            };

        default:
            return { animate: {}, transition: { duration: 0 } };
    }
}

export default DialogueCastStage;
