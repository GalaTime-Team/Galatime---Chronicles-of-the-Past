/**
 * Types for the mutable narrative state of the world.
 *
 * This is deliberately separate from `GameState` in `GameContext.tsx`, which
 * only holds player-facing settings and vitals. The dialogue engine reads and
 * writes `WorldState` exclusively through the `services/state` domain
 * services, so it never depends on React state.
 *
 * Slice names match the dotted paths authored in dialogue files
 * (`flags.x`, `relationship.y.friendship`, `inventory.z`, …) so no translation
 * layer is needed between the file format and the runtime state.
 */

/**
 * A single inventory entry.
 *
 * Most items are counted (a number), but key items may be modelled as a
 * boolean "owned / not owned" flag — the dialogue fixture compares
 * `inventory.ancient_key` against `true`, so both shapes must be supported.
 */
export type InventoryEntry = number | boolean;

/** Owned items, keyed by item id. */
export interface InventoryState {
    [itemId: string]: InventoryEntry;
}

/**
 * One character's affinities, keyed by relationship kind.
 *
 * The kind is named in the path a dialogue authors
 * (`relationship.pacci.friendship`), so a second one — trust, rivalry — is a new
 * key here rather than a reshape of the state.
 */
export interface CharacterRelationshipState {
    [relationshipKind: string]: number;
}

/**
 * Affinity towards each character, keyed by character id.
 *
 * Two levels deep on purpose: `relationship.pacci` would not say *which* of
 * someone's affinities it meant, and a dialogue comparing the wrong one would
 * read zero instead of failing.
 */
export interface RelationshipState {
    [characterId: string]: CharacterRelationshipState;
}

/** A flag value. Flags stay untyped because the dialogue only ever compares them. */
export type FlagValue = boolean | string | number;

/** Narrative flags, keyed by flag name. */
export interface FlagState {
    [flagName: string]: FlagValue;
}

/** Lifecycle of an objective. */
export type ObjectiveStatus = 'locked' | 'active' | 'completed' | 'failed';

/** One objective's normalized state. */
export interface ObjectiveState {
    status: ObjectiveStatus;
    /** Optional 0..1 progress, for objectives that report partial completion. */
    progress?: number;
}

/** Objectives, keyed by objective id, in their normalized runtime form. */
export interface ObjectiveStateMap {
    [objectiveId: string]: ObjectiveState;
}

/** Free-form numeric counters (`stats.suspicion`, `stats.courage`, …). */
export interface StatState {
    [statName: string]: number;
}

/** In-game clock. Only the fields a dialogue can actually read are modelled. */
export interface TimeState {
    hour: number;
    day?: number;
}

/**
 * Everything the dialogue engine can read from or write to.
 *
 * The state is supplied by the game when a conversation starts and handed back
 * updated when it ends; the engine never persists it itself.
 */
export interface WorldState {
    flags: FlagState;
    inventory: InventoryState;
    relationship: RelationshipState;
    objectives: ObjectiveStateMap;
    stats: StatState;
    time: TimeState;
    /** Which dialogues were already seen, and which were unlocked. */
    dialogues: {
        seen: string[];
        unlocked: string[];
    };
    /** Narrative paths unlocked by dialogues. */
    paths: {
        unlocked: string[];
    };
}

/** Objective shorthand: either a bare status or a full state object. */
export type ObjectiveStateInput = ObjectiveStatus | ObjectiveState;

/**
 * Loose shape the game may supply when a conversation starts.
 *
 * Everything is optional — the engine-managed slices (`dialogues`, `paths`)
 * default to empty and `createWorldState` fills in whatever is missing, so a
 * caller can pass only the state a given dialogue actually reads.
 */
export interface WorldStateInput {
    flags?: FlagState;
    inventory?: InventoryState;
    relationship?: RelationshipState;
    objectives?: Record<string, ObjectiveStateInput>;
    stats?: StatState;
    time?: TimeState;
    dialogues?: {
        seen?: string[];
        unlocked?: string[];
    };
    paths?: {
        unlocked?: string[];
    };
}

/** What kind of mutation a state change represents. */
export type StateChangeKind =
    | 'flag_set'
    | 'stat_changed'
    | 'item_added'
    | 'item_removed'
    | 'relationship_changed'
    | 'objective_changed'
    | 'dialogue_unlocked'
    | 'dialogue_seen'
    | 'path_unlocked';

/**
 * One recorded mutation of the world state.
 *
 * The engine returns these instead of the whole state so the presentation
 * layer can show deltas ("+2 with Pacci") without diffing two snapshots.
 */
export interface StateChange {
    kind: StateChangeKind;
    /**
     * Dotted path of the affected entry.
     *
     * Two segments for most slices (`flags.met_pacci`), three for a relationship,
     * whose kind is part of its identity (`relationship.pacci.friendship`).
     */
    target: string;
    previous: FlagValue | InventoryEntry | null;
    next: FlagValue | InventoryEntry;
    /** Set for numeric changes only. */
    delta?: number;
    /** The effect type (or `scene.on_enter`) that produced the change. */
    source: string;
}
