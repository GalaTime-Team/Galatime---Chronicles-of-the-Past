import type {
    DialogueCastEvent,
    DialogueCastMemberView,
    DialogueCastView,
} from '../../types/DialogueType';
import { resolveAnimationSfx } from '../../constants/DialogueVocabulary';

/**
 * Who is in the conversation, and what each of them looks like.
 *
 * A dialogue stages itself: characters are brought in and taken out by
 * `character_enter` and `character_exit` nodes, and this is the state those
 * nodes maintain. A line that names an `emotion` updates it as well — see
 * `setCharacterEmotion` — so the emotion held here is always the one a character
 * should currently be drawn with, rather than a property of the line on screen.
 *
 * It is deliberately **not** a scene — there is no background, no authored
 * composition and no notion of where anyone stands in the world. It answers one
 * question for the presentation layer: who is here, what do they look like, and
 * which of them is talking.
 */

/** Where a character stands when the author did not say. */
export const DEFAULT_CHARACTER_POSITION = 'center';

/** One character taking part in the conversation. */
export interface CastMember {
    character_id: string;
    position: string;
    emotion: string | null;
    layer: number;
    /** What the body does while standing there: `stand` or `sit`. */
    pose: string | null;
    /** Which side of the cast the character is drawn on: `back` or `front`. */
    depth: string | null;
    /** The character the depth is relative to, when it names one. */
    depth_of: string | null;
}

/** The cast of a running conversation. */
export interface CastState {
    members: Map<string, CastMember>;
}

/** An empty cast, for a conversation nobody has walked into yet. */
export function createCastState(): CastState {
    return { members: new Map() };
}

/**
 * A copy, so a step can be attempted against the cast and only committed once
 * the step succeeded.
 */
export function cloneCastState(state: CastState): CastState {
    return {
        members: new Map(
            [...state.members].map(([id, member]) => [id, { ...member }]),
        ),
    };
}

/**
 * Brings a character in, or refreshes one who is already there.
 *
 * A field the node omits keeps its current value, so an enter node only has to
 * state what changed. An event is emitted either way: re-entering someone
 * already on screen is a real thing an author may want — a character steps
 * forward and speaks again — and the stage needs to know it happened.
 */
export function enterCharacter(
    state: CastState,
    placement: {
        character_id: string;
        position?: string;
        pose?: string;
        depth?: string;
        depth_of?: string;
        emotion?: string;
        animation_id?: string;
    },
): DialogueCastEvent {
    const existing = state.members.get(placement.character_id);

    const member: CastMember = {
        character_id: placement.character_id,
        position: placement.position || existing?.position || DEFAULT_CHARACTER_POSITION,
        emotion: placement.emotion ?? existing?.emotion ?? null,
        // Defaults to the end of the queue, so whoever arrives later stands in front.
        layer: existing?.layer ?? state.members.size,
        pose: placement.pose || existing?.pose || null,
        depth: placement.depth || existing?.depth || null,
        depth_of: placement.depth_of || existing?.depth_of || null,
    };

    state.members.set(member.character_id, member);

    return {
        kind: 'enter',
        character_id: member.character_id,
        position: member.position,
        animation_id: placement.animation_id ?? null,
        pose: member.pose,
        depth: member.depth,
        depth_of: member.depth_of,
        sfx_id: resolveAnimationSfx(placement.animation_id),
    };
}

/**
 * Changes someone who is already in the conversation.
 *
 * Only what the node states changes; anything left out keeps what the
 * character already had. There is no entrance animation here — the character
 * never left the stage — so the movement belongs to the pose: standing up
 * while sitting down is what the node says.
 *
 * A character who is not on stage cannot be changed. The node is still
 * reported, so the stage knows the author asked for a move that could not
 * happen, but the cast itself is left alone.
 */
export function changeCharacter(
    state: CastState,
    placement: {
        character_id: string;
        position?: string;
        pose?: string;
        depth?: string;
        depth_of?: string;
        emotion?: string;
        animation_id?: string;
    },
): DialogueCastEvent | null {
    const member = state.members.get(placement.character_id);

    if (!member) {
        return null;
    }

    if (placement.position) {
        member.position = placement.position;
    }

    if (placement.pose) {
        member.pose = placement.pose;
    }

    // A new depth redefines the pair: naming a depth without naming who it is
    // relative to puts the character in front of, or behind, the whole cast.
    if (placement.depth) {
        member.depth = placement.depth;
        member.depth_of = placement.depth_of || '';
    }

    if (placement.emotion) {
        member.emotion = placement.emotion;
    }

    return {
        kind: 'action',
        character_id: member.character_id,
        position: member.position,
        animation_id: placement.animation_id ?? null,
        pose: member.pose,
        depth: member.depth,
        depth_of: member.depth_of,
        sfx_id: resolveAnimationSfx(placement.animation_id),
    };
}

/**
 * Changes the face a character is wearing, without moving them.
 *
 * A line's `emotion` is not a costume for that one line: it is the emotion the
 * character wears from then on, until another line or another entrance says
 * otherwise. Keeping it on the member — instead of leaving it to the
 * presentation layer to remember — is what stops a character snapping back to
 * the emotion they entered with the moment somebody else starts talking, and
 * it is what lets the stage be a pure function of the cast it is handed.
 *
 * Returns whether anything changed. A character who is not on stage is left
 * alone: a line cannot dress somebody who was never brought in.
 */
export function setCharacterEmotion(
    state: CastState,
    characterId: string | null | undefined,
    emotion: string | null | undefined,
): boolean {
    if (!characterId || !emotion) {
        return false;
    }

    const member = state.members.get(characterId);

    if (!member || member.emotion === emotion) {
        return false;
    }

    member.emotion = emotion;
    return true;
}

/**
 * Takes a character out.
 *
 * Returns `null` when they were not there to begin with, so an author's stray
 * `character_exit` produces no event rather than a departure nobody can see.
 */
export function exitCharacter(
    state: CastState,
    characterId: string,
    options: { animation_id?: string; direction?: string } = {},
): DialogueCastEvent | null {
    if (!state.members.has(characterId)) {
        return null;
    }

    state.members.delete(characterId);

    return {
        kind: 'exit',
        character_id: characterId,
        animation_id: options.animation_id ?? null,
        direction: options.direction ?? null,
        sfx_id: resolveAnimationSfx(options.animation_id),
    };
}

/** The cast as the presentation layer reads it, ordered so the layers stack. */
export function toCastView(state: CastState): DialogueCastView {
    const characters: DialogueCastMemberView[] = [...state.members.values()]
        .sort((a, b) => a.layer - b.layer)
        .map((member) => ({ ...member }));

    return { characters };
}
