/**
 * The vocabulary a dialogue author may write.
 *
 * The dialogue format leaves `position` and `animation_id` as free-form strings:
 * the engine never reads them, only the presentation layer does. That tolerance
 * is deliberate — a typo must not make a conversation unplayable — but it leaves
 * an author with nothing to write against. This file is that list.
 *
 * **Positions are an ordering hint, not a coordinate.** The stage works out its
 * own layout from how many characters are on it (see `DialogueCastStage`), and
 * reads the position only to decide who stands to the left of whom.
 *
 * **An animation outside the list still works**, falling back to the default
 * motion, so the table below is a menu rather than a gate.
 */

/** The slots a dialogue may name, in the order the stage sorts them. */
export const DIALOGUE_CHARACTER_POSITIONS = ['left', 'center', 'right'] as const;

export type DialogueCharacterPosition = (typeof DIALOGUE_CHARACTER_POSITIONS)[number];

/** Read from a position the frontend does not recognise. */
export const DIALOGUE_DEFAULT_POSITION: DialogueCharacterPosition = 'center';

/** How far and how fast a move goes, relative to the default. */
export interface DialogueMotionFlavour {
    /** Multiplies the duration. Above 1 is slower and heavier. */
    intensity: number;
    /** Multiplies the distance travelled. `0` means the character does not move. */
    travel: number;
}

/** Used by any animation the table below does not name. */
export const DIALOGUE_DEFAULT_FLAVOUR: DialogueMotionFlavour = { intensity: 1, travel: 1 };

/** When a declared animation is meant to be used. */
export type DialogueAnimationPhase = 'enter' | 'idle' | 'exit';

/** One authored animation. */
export interface DialogueAnimationDefinition {
    id: string;
    phase: DialogueAnimationPhase;
    description: string;
    flavour: DialogueMotionFlavour;
}

/**
 * Every animation a dialogue may name, grouped by the moment it belongs to.
 *
 * The ids already used by `test-1.yaml` (`step_in`, `enter_surprised`,
 * `idle_nervous`, `leave_running`) are all present, so the fixture and the menu
 * agree.
 */
export const DIALOGUE_ANIMATIONS = [
    {
        id: 'step_in',
        phase: 'enter',
        description: 'A slow, deliberate walk into place.',
        flavour: { intensity: 1.3, travel: 0.8 },
    },
    {
        id: 'enter_surprised',
        phase: 'enter',
        description: 'Arrives quickly, as if caught off guard.',
        flavour: { intensity: 0.8, travel: 1.2 },
    },
    {
        id: 'enter_running',
        phase: 'enter',
        description: 'Rushes in from off stage.',
        flavour: { intensity: 0.7, travel: 1.6 },
    },
    {
        id: 'fade_in',
        phase: 'enter',
        description: 'Appears in place, without travelling.',
        flavour: { intensity: 1.4, travel: 0 },
    },
    {
        id: 'idle_neutral',
        phase: 'idle',
        description: 'Settles, and stays settled.',
        flavour: { intensity: 1.2, travel: 0.6 },
    },
    {
        id: 'idle_nervous',
        phase: 'idle',
        description: 'Restless; more movement than the default.',
        flavour: { intensity: 1, travel: 1.1 },
    },
    {
        id: 'idle_angry',
        phase: 'idle',
        description: 'Tense and sharp.',
        flavour: { intensity: 0.8, travel: 1.3 },
    },
    {
        id: 'step_out',
        phase: 'exit',
        description: 'Walks out slowly.',
        flavour: { intensity: 1.3, travel: 0.8 },
    },
    {
        id: 'leave_running',
        phase: 'exit',
        description: 'Runs off stage.',
        flavour: { intensity: 0.7, travel: 1.6 },
    },
    {
        id: 'fade_out',
        phase: 'exit',
        description: 'Disappears in place, without travelling.',
        flavour: { intensity: 1.4, travel: 0 },
    },
] as const satisfies readonly DialogueAnimationDefinition[];

/** The id of an animation the table declares. */
export type DialogueAnimationId = (typeof DIALOGUE_ANIMATIONS)[number]['id'];

/** Every declared id, for tooling that offers a menu. */
export const DIALOGUE_ANIMATION_IDS: readonly string[] = DIALOGUE_ANIMATIONS.map(
    (animation) => animation.id,
);

/**
 * The affinities a dialogue may read or change.
 *
 * A relationship path is three segments — `relationship.pacci.friendship` —
 * because affinity towards someone only means something once the *kind* of
 * affinity is named. This list is the menu authoring tools offer; the engine
 * itself treats a kind as a free-form key, exactly like a flag, so a new kind
 * needs no change here beyond making it suggestable.
 */
export const DIALOGUE_RELATIONSHIP_KINDS = ['friendship'] as const;

export type DialogueRelationshipKind = (typeof DIALOGUE_RELATIONSHIP_KINDS)[number];

/** Used when a caller has no kind to hand and needs a sensible one. */
export const DIALOGUE_DEFAULT_RELATIONSHIP_KIND: DialogueRelationshipKind = 'friendship';

const FLAVOUR_BY_ID = new Map<string, DialogueMotionFlavour>(
    DIALOGUE_ANIMATIONS.map((animation) => [animation.id, animation.flavour]),
);

/**
 * Read by ids the table does not name.
 *
 * The authored id is free-form, and the intent is usually legible from the word
 * the author chose, so an unrecognised id is still read rather than ignored.
 * Order matters: the more specific word wins, so `leave_running` is read as a
 * run rather than as a leave.
 */
const FLAVOUR_KEYWORDS: Array<{ keyword: string; flavour: DialogueMotionFlavour }> = [
    { keyword: 'run', flavour: { intensity: 0.7, travel: 1.6 } },
    { keyword: 'leave', flavour: { intensity: 0.8, travel: 1.4 } },
    { keyword: 'step', flavour: { intensity: 1.3, travel: 0.8 } },
    { keyword: 'enter', flavour: { intensity: 1, travel: 1.1 } },
    { keyword: 'idle', flavour: { intensity: 1.2, travel: 0.6 } },
];

/**
 * How an authored animation should move.
 *
 * A declared id is taken exactly as declared; anything else is read from its
 * name, and anything unrecognisable moves like the default.
 */
export function resolveAnimationFlavour(
    animationId: string | null | undefined,
): DialogueMotionFlavour {
    if (!animationId) {
        return DIALOGUE_DEFAULT_FLAVOUR;
    }

    const declared = FLAVOUR_BY_ID.get(animationId);

    if (declared) {
        return declared;
    }

    const normalized = animationId.toLowerCase();

    return FLAVOUR_KEYWORDS.find(({ keyword }) => normalized.includes(keyword))?.flavour
        ?? DIALOGUE_DEFAULT_FLAVOUR;
}

/** The declared animation with this id, or `null` when it is not in the table. */
export function findAnimationDefinition(
    animationId: string | null | undefined,
): DialogueAnimationDefinition | null {
    if (!animationId) {
        return null;
    }

    return DIALOGUE_ANIMATIONS.find((animation) => animation.id === animationId) ?? null;
}
