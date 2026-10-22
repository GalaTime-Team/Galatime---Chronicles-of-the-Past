/**
 * The vocabulary a dialogue author may write.
 *
 * The dialogue format leaves `position`, `pose`, `depth` and `animation_id` as
 * free-form strings: the engine never gates on them, only the presentation
 * layer reads them. That tolerance is deliberate — a typo must not make a
 * conversation unplayable — but it leaves an author with nothing to write
 * against. This file is that list.
 *
 * **Positions are an ordering hint, not a coordinate.** The stage works out its
 * own layout from how many characters are on it (see `DialogueCastStage`), and
 * reads the position only to decide who stands to the left of whom.
 *
 * **An animation outside the list still works**, falling back to the default
 * motion, so the table below is a menu rather than a gate.
 */

/**
 * The slots a dialogue may name, in the order the stage sorts them.
 *
 * Five, not three: the half-slots between the outer ones (`center_left`,
 * `center_right`) are accepted content, so they are first-class here and two
 * characters can stand between the middle and an edge without one of them
 * having to give way.
 */
export const DIALOGUE_CHARACTER_POSITIONS = [
    'left',
    'center_left',
    'center',
    'center_right',
    'right',
] as const;

export type DialogueCharacterPosition = (typeof DIALOGUE_CHARACTER_POSITIONS)[number];

/** Read from a position the frontend does not recognise. */
export const DIALOGUE_DEFAULT_POSITION: DialogueCharacterPosition = 'center';

/**
 * What a character's body does while standing in a slot.
 *
 * `stand` is the ordinary case. `sit` is not a different artwork — the game
 * has one sprite per emotion — so it is drawn by making the character smaller
 * and lower, which is what reads as "sitting down" on a stage of standing
 * figures.
 */
export const DIALOGUE_CHARACTER_POSES = ['stand', 'sit'] as const;

export type DialogueCharacterPose = (typeof DIALOGUE_CHARACTER_POSES)[number];

/** Read from a pose the frontend does not recognise. */
export const DIALOGUE_DEFAULT_POSE: DialogueCharacterPose = 'stand';

/**
 * Which side of the cast a character is drawn on.
 *
 * `depth_of` narrows it to one other character: "behind Pacci" instead of
 * "behind everybody".
 */
export const DIALOGUE_CHARACTER_DEPTHS = ['back', 'front'] as const;

export type DialogueCharacterDepth = (typeof DIALOGUE_CHARACTER_DEPTHS)[number];

/** Read from a depth the frontend does not recognise. */
export const DIALOGUE_DEFAULT_DEPTH: DialogueCharacterDepth = 'front';

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
export type DialogueAnimationPhase = 'enter' | 'idle' | 'action' | 'exit';

/**
 * The movement an animation performs.
 *
 * The kind is what decides how the character moves *and* what sound it makes:
 * walking is a step, running is a run, standing up and sitting down are the
 * two that make a noise of their own.
 */
export type DialogueAnimationKind =
    | 'step_in'
    | 'run_in'
    | 'fade_in'
    | 'idle'
    | 'idle_shake'
    | 'idle_wave'
    | 'stand_up'
    | 'sit_down'
    | 'step_across'
    | 'step_out'
    | 'run_out'
    | 'fade_out';

/** One authored animation. */
export interface DialogueAnimationDefinition {
    id: string;
    phase: DialogueAnimationPhase;
    kind: DialogueAnimationKind;
    description: string;
    flavour: DialogueMotionFlavour;
}

/**
 * Every animation a dialogue may name, grouped by the moment it belongs to.
 *
 * The ids are the ones the Dialogue Forger writes: it composes an id out of
 * the movement, the side and the speed, so `step_in` is "walk in from the
 * middle at the normal pace" and `run_in_from_left_fast` is the same walk,
 * hurried and from the other side.
 *
 * The older ids (`enter_surprised`, `idle_nervous`, `leave_running`) are kept
 * so a file written before the forger's vocabulary still animates the way its
 * author meant it to.
 */
export const DIALOGUE_ANIMATIONS = [
    {
        id: 'step_in',
        phase: 'enter',
        kind: 'step_in',
        description: 'A slow, deliberate walk into place.',
        flavour: { intensity: 1.3, travel: 0.8 },
    },
    {
        id: 'run_in',
        phase: 'enter',
        kind: 'run_in',
        description: 'Rushes in from off stage.',
        flavour: { intensity: 0.7, travel: 1.6 },
    },
    {
        id: 'fade_in',
        phase: 'enter',
        kind: 'fade_in',
        description: 'Appears in place, without travelling.',
        flavour: { intensity: 1.4, travel: 0 },
    },
    {
        id: 'idle',
        phase: 'idle',
        kind: 'idle',
        description: 'Settles, and stays settled.',
        flavour: { intensity: 1.2, travel: 0.6 },
    },
    {
        id: 'idle_shake',
        phase: 'idle',
        kind: 'idle_shake',
        description: 'Restless; more movement than the default.',
        flavour: { intensity: 1, travel: 1.1 },
    },
    {
        id: 'idle_wave',
        phase: 'idle',
        kind: 'idle_wave',
        description: 'Sways, as if greeting someone.',
        flavour: { intensity: 1.1, travel: 0.9 },
    },
    {
        id: 'stand_up',
        phase: 'action',
        kind: 'stand_up',
        description: 'Gets up from where they were sitting.',
        flavour: { intensity: 1, travel: 0.35 },
    },
    {
        id: 'sit_down',
        phase: 'action',
        kind: 'sit_down',
        description: 'Sits down where they are standing.',
        flavour: { intensity: 1, travel: 0.35 },
    },
    {
        id: 'step_across',
        phase: 'action',
        kind: 'step_across',
        description: 'Takes a step sideways, without leaving the stage.',
        flavour: { intensity: 1.2, travel: 0.7 },
    },
    {
        id: 'step_out',
        phase: 'exit',
        kind: 'step_out',
        description: 'Walks out slowly.',
        flavour: { intensity: 1.3, travel: 0.8 },
    },
    {
        id: 'fade_out',
        phase: 'exit',
        kind: 'fade_out',
        description: 'Disappears in place, without travelling.',
        flavour: { intensity: 1.4, travel: 0 },
    },
    {
        id: 'enter_surprised',
        phase: 'enter',
        kind: 'step_in',
        description: 'Arrives quickly, as if caught off guard.',
        flavour: { intensity: 0.8, travel: 1.2 },
    },
    {
        id: 'enter_running',
        phase: 'enter',
        kind: 'run_in',
        description: 'Rushes in from off stage.',
        flavour: { intensity: 0.7, travel: 1.6 },
    },
    {
        id: 'idle_neutral',
        phase: 'idle',
        kind: 'idle',
        description: 'Settles, and stays settled.',
        flavour: { intensity: 1.2, travel: 0.6 },
    },
    {
        id: 'idle_nervous',
        phase: 'idle',
        kind: 'idle_shake',
        description: 'Restless; more movement than the default.',
        flavour: { intensity: 1, travel: 1.1 },
    },
    {
        id: 'idle_angry',
        phase: 'idle',
        kind: 'idle_shake',
        description: 'Tense and sharp.',
        flavour: { intensity: 0.8, travel: 1.3 },
    },
    {
        id: 'leave_running',
        phase: 'exit',
        kind: 'run_out',
        description: 'Runs off stage.',
        flavour: { intensity: 0.7, travel: 1.6 },
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

/**
 * The sound a movement makes.
 *
 * The four sounds are the ones the game ships: a step, a run, getting up and
 * getting down. The mapping is deliberately obvious — walking sounds like
 * walking — so the sound and the movement can never disagree about what the
 * character is doing.
 */
export const DIALOGUE_MOVEMENT_SFX: Partial<Record<DialogueAnimationKind, string>> = {
    step_in: 'walk',
    step_across: 'walk',
    step_out: 'walk',
    run_in: 'run',
    run_out: 'run',
    stand_up: 'get_up',
    sit_down: 'get_down',
};

const FLAVOUR_BY_ID = new Map<string, DialogueMotionFlavour>(
    DIALOGUE_ANIMATIONS.map((animation) => [animation.id, animation.flavour]),
);

const KIND_BY_ID = new Map<string, DialogueAnimationKind>(
    DIALOGUE_ANIMATIONS.map((animation) => [animation.id, animation.kind]),
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
    { keyword: 'walk', flavour: { intensity: 1.3, travel: 0.8 } },
    { keyword: 'stand', flavour: { intensity: 1, travel: 0.35 } },
    { keyword: 'sit', flavour: { intensity: 1, travel: 0.35 } },
    { keyword: 'enter', flavour: { intensity: 1, travel: 1.1 } },
    { keyword: 'idle', flavour: { intensity: 1.2, travel: 0.6 } },
];

/**
 * The movement an id names, or `null` when it names none.
 *
 * Read with the same rules as the flavour: the declared id first, then the
 * words, most specific first. `run_out` is a run that leaves, not a run that
 * arrives.
 */
export function resolveAnimationKind(
    animationId: string | null | undefined,
): DialogueAnimationKind | null {
    if (!animationId) {
        return null;
    }

    const declared = KIND_BY_ID.get(animationId);

    if (declared) {
        return declared;
    }

    const normalized = animationId.toLowerCase();

    if (/fade/.test(normalized)) {
        return /out/.test(normalized) ? 'fade_out' : 'fade_in';
    }

    if (/run/.test(normalized)) {
        return /out|leave/.test(normalized) ? 'run_out' : 'run_in';
    }

    if (/stand/.test(normalized)) {
        return 'stand_up';
    }

    if (/sit/.test(normalized)) {
        return 'sit_down';
    }

    if (/shake|tremor/.test(normalized)) {
        return 'idle_shake';
    }

    if (/wave|sway/.test(normalized)) {
        return 'idle_wave';
    }

    if (/step_out|leave/.test(normalized)) {
        return 'step_out';
    }

    if (/step_across|across/.test(normalized)) {
        return 'step_across';
    }

    if (/step|walk|enter/.test(normalized)) {
        return 'step_in';
    }

    if (/idle/.test(normalized)) {
        return 'idle';
    }

    return null;
}

/**
 * How an authored animation should move.
 *
 * A declared id is taken exactly as declared; anything else is read from its
 * name, and anything unrecognisable moves like the default.
 *
 * The speed the id carries (`_slow`, `_fast`) is applied on top: a slow
 * movement takes longer and a fast one takes less time, which is what the
 * words mean.
 */
export function resolveAnimationFlavour(
    animationId: string | null | undefined,
): DialogueMotionFlavour {
    if (!animationId) {
        return DIALOGUE_DEFAULT_FLAVOUR;
    }

    const declared = FLAVOUR_BY_ID.get(animationId);

    if (declared) {
        return withSpeed(declared, animationId);
    }

    const normalized = animationId.toLowerCase();

    const matched = FLAVOUR_KEYWORDS.find(({ keyword }) => normalized.includes(keyword))?.flavour
        ?? DIALOGUE_DEFAULT_FLAVOUR;

    return withSpeed(matched, normalized);
}

/**
 * The speed an id carries, as a multiplier on the movement's own duration.
 *
 * A slow movement takes longer, so its intensity goes up; a fast one takes
 * less time, so its intensity goes down.
 */
function withSpeed(flavour: DialogueMotionFlavour, animationId: string): DialogueMotionFlavour {
    const normalized = animationId.toLowerCase();

    if (normalized.includes('fast')) {
        return { intensity: flavour.intensity * 0.7, travel: flavour.travel };
    }

    if (normalized.includes('slow')) {
        return { intensity: flavour.intensity * 1.4, travel: flavour.travel };
    }

    return flavour;
}

/**
 * The sound a movement makes, or `null` when it makes none.
 *
 * Read from the movement, not from the id's exact spelling, so an id written
 * by hand (`walk_in_fast`) still sounds like walking.
 *
 * An exit that is *fast* sounds like running: the format has a single "move
 * off" movement for an exit, and the speed is what tells a hurried departure
 * from a stroll.
 */
export function resolveAnimationSfx(animationId: string | null | undefined): string | null {
    const kind = resolveAnimationKind(animationId);

    if (!kind) {
        return null;
    }

    if (kind === 'step_out' && /fast/i.test(String(animationId ?? ''))) {
        return 'run';
    }

    return DIALOGUE_MOVEMENT_SFX[kind] ?? null;
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
