import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DialogueCastEvent, DialogueCastMemberView } from '../../../types/DialogueType';
import CommonImage from '../../common/CommonImage';
import { UnknownIcon } from '../../../assets/GalatimeIcon';
import { resolveCharacter } from '../../../services/dialogue/characterRegistryService';
import { resolveCharacterPortrait } from '../../../services/characterPortraitService';
import { resolveStageCast } from '../../../services/dialogueCastService';
import {
    DIALOGUE_CHARACTER_ACTIVE_CLASS,
    DIALOGUE_CHARACTER_DIM_CLASS,
    DIALOGUE_MAX_VISIBLE_CHARACTERS,
    DIALOGUE_MISSING_SPRITE_OPACITY,
    DIALOGUE_SLOT_CENTRES,
    DIALOGUE_SPRITE_BOX_CLASS,
    DIALOGUE_SPRITE_LAYOUT,
} from '../../../constants/DialogueConstants';
import {
    DIALOGUE_CHARACTER_EXPRESSION_DURATION,
    DIALOGUE_CHARACTER_VARIANTS,
    DIALOGUE_SLOT_MOVE_TRANSITION,
    resolveEntranceOffset,
} from '../../../constants/DialogueAnimationConstants';
import {
    DIALOGUE_DEFAULT_FLAVOUR,
    resolveAnimationFlavour,
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
 * name three positions and a fourth character has to stand somewhere regardless —
 * see `dialogueCastService` for the rules.
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
     * Only used to read the authored `animation_id` of an entrance or an exit, so
     * `step_in` can read heavier than `leave_running`.
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

                    // The slot is a full-width box whose centre is moved onto the slot's
                    // position, so the sprite can be sized as a fraction of the stage
                    // and still land exactly where the layout put it. The centring is a
                    // class rather than an inline transform, because the inline one
                    // would overwrite the transform the motion variants animate.
                    const style: CSSProperties = {
                        left: `${centre}%`,
                        zIndex: character.layer,
                        // Slides when the cast grows or shrinks and every slot is
                        // recalculated. On `left`, so it cannot fight the variants.
                        transition: reduceMotion ? 'none' : DIALOGUE_SLOT_MOVE_TRANSITION,
                    };

                    return (
                        <div
                            key={character.character_id}
                            style={style}
                            className="absolute bottom-0 flex h-full w-full -translate-x-1/2 flex-col items-center justify-end"
                        >
                            <motion.div
                                custom={reduceMotion ? 0 : resolveEntranceOffset(centre, flavour)}
                                variants={DIALOGUE_CHARACTER_VARIANTS}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="flex h-full w-full flex-col items-center justify-end"
                            >
                                <div
                                    className={`${spriteLayout.widthClass} ${DIALOGUE_SPRITE_BOX_CLASS} transition-[filter] duration-300 ease-out ${
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
                        </div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

export default DialogueCastStage;
