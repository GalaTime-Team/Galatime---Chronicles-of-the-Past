import type { DialogueError } from '../../types/DialogueType';
import type {
    FlagValue,
    InventoryEntry,
    ObjectiveState,
    ObjectiveStateInput,
    StateChange,
    StateChangeKind,
    WorldState,
    WorldStateInput,
} from '../../types/WorldStateType';
import { createDialogueError, toFiniteNumber } from '../../utils/dialogueUtils';

/**
 * Generic access to the narrative world state.
 *
 * This service owns the shape of `WorldState` and the dotted-path vocabulary
 * that dialogue conditions are written in. It deliberately does **not** own
 * inventory, relationship or objective rules — those live in their own
 * services, which mutate their slice directly and record their own changes.
 */

/** Roots a dotted state path may address. Mirrors the authored dialogue paths. */
export const STATE_PATH_ROOTS = [
    'flags',
    'inventory',
    'relationship',
    'objectives',
    'stats',
    'time',
    'dialogues',
    'paths',
] as const;

/** A root segment of a state path. */
export type StatePathRoot = (typeof STATE_PATH_ROOTS)[number];

/**
 * A parsed state path.
 *
 * Two segments for every root (`flags.met_pacci`), three for `relationship`
 * (`relationship.pacci.friendship`).
 */
export interface StatePathParts {
    root: StatePathRoot;
    /** First segment after the root: flag name, item id, character id, … */
    key: string;
    /** Second segment after the root. Only `relationship` has one: the kind. */
    subKey?: string;
}

/** The deepest a state path may go: `relationship.<character>.<kind>`. */
export const MAX_STATE_PATH_SEGMENTS = 3;

/**
 * The state path of one affinity towards a character.
 *
 * Built here so the reader, the writer and the validator cannot drift into
 * different spellings of the same path.
 */
export function relationshipStatePath(characterId: string, relationshipKind: string): string {
    return `relationship.${characterId}.${relationshipKind}`;
}

/**
 * Whether a path names the relationship slice but stops before the kind.
 *
 * The one mistake the shape invites. Kept next to `parseStatePath` so the rule
 * and the explanation of it cannot disagree; the validator uses this to say
 * what is missing instead of reporting a bare "not a state path".
 */
export function isRelationshipPathMissingKind(path: string): boolean {
    if (typeof path !== 'string') {
        return false;
    }

    const segments = path.split('.');

    return segments.length === 2 && segments[0] === 'relationship' && segments[1] !== '';
}

/** Everything `readStatePath` can return. Lists are returned as copies. */
export type StatePathValue = FlagValue | InventoryEntry | string[] | null;

/** Outcome of a state mutation: the recorded change, or why it did not happen. */
export interface StateWriteResult {
    change: StateChange | null;
    error: DialogueError | null;
}

/**
 * The change kind a write to this path produces.
 *
 * `dialogues` needs its own handling because its two lists mean different
 * things: appending to `unlocked` opens a dialogue up, while `seen` records
 * that one was played through.
 */
function changeKindForPath(parts: StatePathParts): StateChangeKind {
    switch (parts.root) {
        case 'dialogues':
            return parts.key === 'unlocked' ? 'dialogue_unlocked' : 'dialogue_seen';
        case 'flags':
            return 'flag_set';
        case 'inventory':
        case 'stats':
        case 'time':
            return 'stat_changed';
        case 'relationship':
            return 'relationship_changed';
        case 'objectives':
            return 'objective_changed';
        case 'paths':
            return 'path_unlocked';
        default:
            return 'stat_changed';
    }
}

/** Narrows an arbitrary string to a known path root. */
export function isStatePathRoot(value: string): value is StatePathRoot {
    return (STATE_PATH_ROOTS as readonly string[]).includes(value);
}

/**
 * Builds a complete state from whatever the game supplied.
 *
 * Missing slices default to empty so a caller can pass only the state a given
 * dialogue actually reads, and the engine-managed slices (`dialogues`,
 * `paths`) never need to be supplied at all.
 */
export function createWorldState(input: WorldStateInput = {}): WorldState {
    return {
        flags: { ...(input.flags ?? {}) },
        inventory: { ...(input.inventory ?? {}) },
        relationship: { ...(input.relationship ?? {}) },
        objectives: normalizeObjectives(input.objectives),
        stats: { ...(input.stats ?? {}) },
        time: input.time?.day === undefined
            ? { hour: input.time?.hour ?? 0 }
            : { hour: input.time?.hour ?? 0, day: input.time.day },
        dialogues: {
            seen: [...(input.dialogues?.seen ?? [])],
            unlocked: [...(input.dialogues?.unlocked ?? [])],
        },
        paths: { unlocked: [...(input.paths?.unlocked ?? [])] },
    };
}

/**
 * Copies a state so a session can mutate it without touching the caller's.
 *
 * `WorldState` is structurally assignable to `WorldStateInput`, so building a
 * fresh state is enough to deep-copy every slice and list.
 */
export function cloneWorldState(state: WorldState): WorldState {
    return createWorldState(state);
}

/** Accepts both the `status` shorthand and the full objective object. */
function normalizeObjectives(
    input?: Record<string, ObjectiveStateInput>,
): Record<string, ObjectiveState> {
    const normalized: Record<string, ObjectiveState> = {};

    for (const [objectiveId, value] of Object.entries(input ?? {})) {
        normalized[objectiveId] = typeof value === 'string' ? { status: value } : { ...value };
    }

    return normalized;
}

/**
 * Splits a state path into its parts.
 *
 * Two segments for every root, three for `relationship`:
 * `relationship.pacci.friendship`. A two-segment relationship path is rejected
 * rather than guessed at — assuming `friendship` would make a dialogue that
 * meant something else read zero and fail quietly.
 *
 * Returns `null` for anything else, so a malformed path in a dialogue is
 * reported rather than silently resolving to `undefined`.
 */
export function parseStatePath(path: string): StatePathParts | null {
    if (typeof path !== 'string') {
        return null;
    }

    const segments = path.split('.');

    if (segments.length < 2 || segments.length > MAX_STATE_PATH_SEGMENTS) {
        return null;
    }

    const [root, key, subKey] = segments;

    if (!root || !key || !isStatePathRoot(root)) {
        return null;
    }

    if (root === 'relationship') {
        return segments.length === MAX_STATE_PATH_SEGMENTS && subKey
            ? { root, key, subKey }
            : null;
    }

    return segments.length === 2 ? { root, key } : null;
}

/**
 * Reads a dotted state path.
 *
 * Unknown paths return `null` rather than throwing: a condition that reads a
 * state entry the game never supplied simply evaluates as absent. List roots
 * (`dialogues.seen`, `paths.unlocked`) are returned as copies so a caller
 * cannot mutate the state through the result.
 */
export function readStatePath(state: WorldState, path: string): StatePathValue {
    const parts = parseStatePath(path);
    if (!parts) {
        return null;
    }

    switch (parts.root) {
        case 'flags':
            return state.flags[parts.key] ?? null;
        case 'inventory':
            return state.inventory[parts.key] ?? null;
        case 'relationship':
            // Two levels: the character, then which affinity towards them.
            return parts.subKey ? (state.relationship[parts.key]?.[parts.subKey] ?? null) : null;
        case 'stats':
            return state.stats[parts.key] ?? null;
        case 'objectives':
            return state.objectives[parts.key]?.status ?? null;
        case 'time':
            if (parts.key === 'hour') return state.time.hour;
            if (parts.key === 'day') return state.time.day ?? null;
            return null;
        case 'dialogues':
            if (parts.key === 'seen') return [...state.dialogues.seen];
            if (parts.key === 'unlocked') return [...state.dialogues.unlocked];
            return null;
        case 'paths':
            return parts.key === 'unlocked' ? [...state.paths.unlocked] : null;
        default:
            return null;
    }
}

/**
 * Sets a narrative flag.
 *
 * Flags are free-form, so this cannot fail: the flag name comes from a
 * literal in the dialogue file.
 */
export function setFlag(
    state: WorldState,
    flag: string,
    value: FlagValue,
    source: string,
): StateChange {
    const previous = state.flags[flag] ?? null;
    state.flags[flag] = value;

    return {
        kind: 'flag_set',
        target: `flags.${flag}`,
        previous,
        next: value,
        source,
    };
}

/**
 * Adds to a numeric counter under `stats`.
 *
 * A counter that was never initialised starts from zero, so a dialogue can
 * increment `stats.suspicion` without the game having to declare it upfront.
 */
export function addToStat(
    state: WorldState,
    statName: string,
    delta: number,
    source: string,
): StateChange {
    const previous = toFiniteNumber(state.stats[statName]) ?? 0;
    const next = previous + delta;
    state.stats[statName] = next;

    return {
        kind: 'stat_changed',
        target: `stats.${statName}`,
        previous,
        next,
        delta,
        source,
    };
}

/**
 * Appends to one of the engine-managed lists.
 *
 * Appending an entry that is already present is a no-op that reports no
 * change, so replaying an effect cannot duplicate an unlock.
 */
export function appendToStateList(
    state: WorldState,
    path: string,
    value: string,
    source: string,
): StateWriteResult {
    const parts = parseStatePath(path);
    if (!parts) {
        return {
            change: null,
            error: createDialogueError(
                'invalid_effect',
                `Cannot write to unknown state path "${path}".`,
                { path },
            ),
        };
    }

    const list = resolveWritableList(state, parts);
    if (!list) {
        return {
            change: null,
            error: createDialogueError(
                'invalid_effect',
                `State path "${path}" is not a list the dialogue may append to.`,
                { path },
            ),
        };
    }

    if (list.includes(value)) {
        return { change: null, error: null };
    }

    list.push(value);

    return {
        change: {
            kind: changeKindForPath(parts),
            target: path,
            previous: null,
            next: value,
            source,
        },
        error: null,
    };
}

/** The mutable list behind a list-shaped state path, or `null`. */
function resolveWritableList(state: WorldState, parts: StatePathParts): string[] | null {
    switch (parts.root) {
        case 'dialogues':
            if (parts.key === 'seen') return state.dialogues.seen;
            if (parts.key === 'unlocked') return state.dialogues.unlocked;
            return null;
        case 'paths':
            return parts.key === 'unlocked' ? state.paths.unlocked : null;
        default:
            return null;
    }
}

/** True when the path addresses one of the engine-managed lists. */
export function isStateListPath(path: string): boolean {
    const parts = parseStatePath(path);
    if (!parts) {
        return false;
    }

    switch (parts.root) {
        case 'dialogues':
            return parts.key === 'seen' || parts.key === 'unlocked';
        case 'paths':
            return parts.key === 'unlocked';
        default:
            return false;
    }
}
