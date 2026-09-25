import type { DialogueCastMemberView } from '../types/DialogueType';
import {
    DIALOGUE_CHARACTER_POSITIONS,
    DIALOGUE_DEFAULT_POSITION,
    type DialogueCharacterPosition,
} from '../constants/DialogueVocabulary';
import {
    DIALOGUE_MAX_VISIBLE_CHARACTERS,
    DIALOGUE_SPRITE_HEIGHT_TO_WIDTH,
    DIALOGUE_SPRITE_LAYOUT,
    DIALOGUE_SPRITE_MIN_HEIGHT_PX,
} from '../constants/DialogueConstants';

/**
 * Who the stage draws, and in what order.
 *
 * The stage is a fixed-size cast: `DIALOGUE_MAX_VISIBLE_CHARACTERS` sprites, and
 * a conversation is free to bring in more than that. When it does, someone has
 * to be left out, and the choice is deliberate rather than arbitrary — the
 * speaker is always drawn, because the player is reading their line, and after
 * them the characters who arrived last, because somebody who has just walked on
 * is the one the scene is about.
 *
 * **The authored `position` is an ordering hint, not a coordinate.** The layout
 * itself comes from how many characters are on stage (see `DIALOGUE_SLOT_CENTRES`),
 * so this module only decides who stands to the left of whom. It is pure and
 * unit-testable on purpose: the stage's geometry is the one thing that cannot be
 * checked by reading a diff.
 */

/** Canonical slot of an authored position. Anything unrecognised reads as the middle. */
export function resolveAuthoredSlot(position: string | null | undefined): DialogueCharacterPosition {
    if (!position) {
        return DIALOGUE_DEFAULT_POSITION;
    }

    const normalized = position.trim().toLowerCase();

    if ((DIALOGUE_CHARACTER_POSITIONS as readonly string[]).includes(normalized)) {
        return normalized as DialogueCharacterPosition;
    }

    // The free-form vocabulary also allows the halves between the slots; they are
    // read as the side they lean towards, so `center_left` still stands left of
    // `center_right` instead of both collapsing into the middle.
    if (normalized.includes('left')) {
        return 'left';
    }

    if (normalized.includes('right')) {
        return 'right';
    }

    return DIALOGUE_DEFAULT_POSITION;
}

/** Sorts a cast left to right, then by the order they arrived. */
export function orderForStage(
    characters: DialogueCastMemberView[],
): DialogueCastMemberView[] {
    const order = (position: string): number =>
        DIALOGUE_CHARACTER_POSITIONS.indexOf(resolveAuthoredSlot(position));

    return characters.slice().sort((a, b) =>
        order(a.position) - order(b.position)
        || a.layer - b.layer,
    );
}

/**
 * How many characters the stage draws at the size it was given.
 *
 * The count exists to protect the sprite's **height**. A character is sized by
 * width (see `DIALOGUE_SPRITE_LAYOUT`), so a stage that is not wide enough draws a
 * sprite that is short as well as narrow — and a short character is the one thing
 * a small screen cannot afford. So this keeps the largest cast whose sprites still
 * reach `DIALOGUE_SPRITE_MIN_HEIGHT_PX`, and leaves characters out when they
 * cannot: dropping one hands its width to the others, and the 5:6 ratio turns that
 * width straight back into height.
 *
 * The stage's *height* is the other half of the same question and is answered
 * elsewhere — the surface hosting the stage is floored at the minimum height plus
 * the box (see `DIALOGUE_BOX_HEIGHT_ALLOWANCE_PX`), so the stage is always tall
 * enough to honour the minimum and this only has to work out how many fit *across*
 * it.
 *
 * `stageWidthPx` is a *layout* width — the space the slot percentages resolve
 * against — so the render scale needs no handling here: a zoomed-in window simply
 * measures narrower. An unmeasured stage keeps the full ceiling rather than
 * guessing, so the first render can never be narrower than the truth.
 */
export function resolveVisibleCharacterCap(stageWidthPx: number | null): number {
    if (stageWidthPx === null || !Number.isFinite(stageWidthPx) || stageWidthPx <= 0) {
        return DIALOGUE_MAX_VISIBLE_CHARACTERS;
    }

    for (let count = DIALOGUE_MAX_VISIBLE_CHARACTERS; count > 1; count -= 1) {
        if (reachesMinimumHeight(count, stageWidthPx)) {
            return count;
        }
    }

    // One character is the floor of this function even when a single sprite cannot
    // reach the minimum: an empty stage would be a worse answer than a small one,
    // and the surface's own floor is what stops that from happening.
    return 1;
}

/**
 * Whether a cast of `count` on a stage this wide can still draw a character at
 * `DIALOGUE_SPRITE_MIN_HEIGHT_PX`.
 *
 * The sprite's width is its share of the stage, and its height follows from that
 * width by the art's own ratio — so this is the whole of the sizing question.
 */
function reachesMinimumHeight(count: number, stageWidthPx: number): boolean {
    const layout = DIALOGUE_SPRITE_LAYOUT[count]
        ?? DIALOGUE_SPRITE_LAYOUT[DIALOGUE_MAX_VISIBLE_CHARACTERS];

    return layout.widthFraction * stageWidthPx * DIALOGUE_SPRITE_HEIGHT_TO_WIDTH
        >= DIALOGUE_SPRITE_MIN_HEIGHT_PX;
}

/**
 * The cast the stage actually draws.
 *
 * Below the cap this is just the cast in stage order. Above it, the speaker and
 * the most recent arrivals are kept and the rest are dropped for this step —
 * they are still in the conversation, so they come back the moment somebody
 * leaves or the speaker changes.
 *
 * `maxVisible` is how many the stage has room for, which is a question about the
 * stage's width rather than about the conversation: `resolveVisibleCharacterCap`
 * answers it from the measurement. It defaults to the ceiling, so a caller that
 * has measured nothing gets the widest layout rather than the narrowest.
 */
export function resolveStageCast(
    characters: DialogueCastMemberView[],
    speakerId: string | null,
    maxVisible: number = DIALOGUE_MAX_VISIBLE_CHARACTERS,
): DialogueCastMemberView[] {
    const cap = Math.max(1, Math.floor(maxVisible));

    if (characters.length <= cap) {
        return orderForStage(characters);
    }

    const speaker = characters.find((character) => character.character_id === speakerId);

    const rest = characters
        .filter((character) => character !== speaker)
        // Latest arrival first, so the newest faces survive the cut.
        .sort((a, b) => b.layer - a.layer);

    const shown = (speaker ? [speaker] : []).concat(rest);

    return orderForStage(shown.slice(0, cap));
}
