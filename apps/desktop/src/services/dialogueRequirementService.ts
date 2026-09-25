import type { ConditionLeaf, ConditionNode, DialogueDefinition } from '../types/DialogueType';
import type {
    FlagState,
    FlagValue,
    InventoryState,
    ObjectiveStateInput,
    ObjectiveStatus,
    RelationshipState,
    StatState,
    TimeState,
    WorldStateInput,
} from '../types/WorldStateType';

/**
 * Works out which parts of the world state a dialogue actually cares about.
 *
 * A dialogue only ever *gates* on the paths it compares in a condition, so those
 * — and only those — are what a tester needs to set before playing it. An open
 * editor would be worse than useless: it would let somebody set
 * `inventory.potato` to 10 and then wonder why nothing happened, because the
 * dialogue never asks about potatoes.
 *
 * Only the slices `WorldStateInput` can express are returned. `dialogues.seen`
 * and `paths.unlocked` are deliberately left out: the engine owns them, and a
 * caller that sets them is fighting the engine rather than testing it.
 */

/** A slice of the world state a tester can set. */
export type RequirementSlice =
    | 'flags'
    | 'inventory'
    | 'relationship'
    | 'objectives'
    | 'stats'
    | 'time';

/** Slices in the order they are presented. */
const SLICES: RequirementSlice[] = [
    'flags',
    'inventory',
    'relationship',
    'objectives',
    'stats',
    'time',
];

/** The editor a requirement needs. */
export type RequirementKind = 'boolean' | 'number' | 'text' | 'objective_status';

/** The statuses an objective may be in, for the picker. */
export const OBJECTIVE_STATUSES: ObjectiveStatus[] = ['locked', 'active', 'completed', 'failed'];

/** One value the dialogue reads, and a value that satisfies it. */
export interface DialogueStateRequirement {
    /** Dotted state path, e.g. `relationship.pacci.friendship`. */
    path: string;
    slice: RequirementSlice;
    /** Key within the slice, e.g. `pacci`. */
    key: string;
    /**
     * Second key within the slice, e.g. `friendship`.
     *
     * Only `relationship` has one; it is `null` for every other slice.
     */
    subKey: string | null;
    kind: RequirementKind;
    /**
     * A value that satisfies every condition the dialogue places on this path.
     *
     * Derived from those conditions, so a freshly loaded dialogue is playable and
     * fully unlocked without touching anything — the interesting thing to do with
     * this panel is lower a value and watch a branch close.
     */
    defaultValue: FlagValue;
    /** Where the dialogue reads it, e.g. `nodes.first_choice.choices[0]`. */
    usage: string[];
}

/**
 * Splits a state path into its slice and keys, or `null` when unsettable.
 *
 * `relationship` is the only slice with a second key: the path names both who
 * and which affinity, `relationship.pacci.friendship`.
 */
export function splitStatePath(
    path: string,
): { slice: RequirementSlice; key: string; subKey: string | null } | null {
    const segments = path.split('.');

    if (segments.length < 2 || segments.length > 3) {
        return null;
    }

    const [slice, key, subKey] = segments;

    if (!key || !SLICES.includes(slice as RequirementSlice)) {
        return null;
    }

    if (subKey !== undefined && (slice !== 'relationship' || !subKey)) {
        return null;
    }

    return {
        slice: slice as RequirementSlice,
        key,
        subKey: subKey ?? null,
    };
}

/** A condition leaf plus a note of where it was found. */
interface CollectedLeaf {
    leaf: ConditionLeaf;
    origin: string;
}

/** Walks a condition tree, collecting every comparison it contains. */
function collectLeaves(
    node: ConditionNode | undefined,
    origin: string,
    out: CollectedLeaf[],
): void {
    if (!node) {
        return;
    }

    if ('condition' in node) {
        out.push({ leaf: node, origin });
        return;
    }

    for (const child of node.all ?? []) {
        collectLeaves(child, origin, out);
    }

    for (const child of node.any ?? []) {
        collectLeaves(child, origin, out);
    }

    collectLeaves(node.not, origin, out);
}

/** Every condition the dialogue evaluates, with where it lives. */
function collectAllLeaves(definition: DialogueDefinition): CollectedLeaf[] {
    const leaves: CollectedLeaf[] = [];

    collectLeaves(definition.entry_conditions, 'entry_conditions', leaves);

    for (const [nodeId, node] of Object.entries(definition.nodes)) {
        if (node.type === 'choice') {
            node.choices.forEach((choice, index) => {
                const origin = `nodes.${nodeId}.choices[${index}]`;
                collectLeaves(choice.visible_if, origin, leaves);
                collectLeaves(choice.enabled_if, origin, leaves);
            });
        } else if (node.type === 'conditional') {
            for (const branch of node.branches) {
                collectLeaves(branch.if, `nodes.${nodeId}.branches.${branch.branch_id}`, leaves);
            }
        }
    }

    return leaves;
}

/** Which editor this path needs, read from the literals it is compared against. */
function resolveKind(slice: RequirementSlice, group: CollectedLeaf[]): RequirementKind {
    if (slice === 'objectives') {
        return 'objective_status';
    }

    if (slice === 'relationship' || slice === 'stats' || slice === 'time') {
        return 'number';
    }

    // `flags` and `inventory` take the shape of whatever they are compared to —
    // a key item is a boolean, a herb is a count. If a path is compared to more
    // than one shape the file is inconsistent, so it falls back to free text
    // rather than guessing which one was meant.
    const shapes = new Set(group.map((entry) => typeof entry.leaf.right));

    if (shapes.size !== 1) {
        return 'text';
    }

    const [shape] = [...shapes];

    if (shape === 'boolean') {
        return 'boolean';
    }

    return shape === 'number' ? 'number' : 'text';
}

/** Whether a value would satisfy one comparison, by the engine's own rules. */
function satisfies(leaf: ConditionLeaf, value: FlagValue): boolean {
    const { condition, right } = leaf;

    switch (condition) {
        case 'equals':
            return value === right;
        case 'not_equals':
            return value !== right;
        case 'greater_than':
            return typeof value === 'number' && typeof right === 'number' && value > right;
        case 'greater_or_equal':
            return typeof value === 'number' && typeof right === 'number' && value >= right;
        case 'less_than':
            return typeof value === 'number' && typeof right === 'number' && value < right;
        case 'less_or_equal':
            return typeof value === 'number' && typeof right === 'number' && value <= right;
        default:
            return false;
    }
}

/** A value that would satisfy this comparison on its own. */
function deriveCandidate(leaf: ConditionLeaf): FlagValue {
    const { condition, right } = leaf;

    if (condition === 'not_equals') {
        if (typeof right === 'boolean') {
            return !right;
        }

        return typeof right === 'number' ? right + 1 : '';
    }

    if (typeof right === 'number') {
        if (condition === 'greater_than') {
            return right + 1;
        }

        if (condition === 'less_than') {
            return right - 1;
        }

        return right;
    }

    return right ?? false;
}

/**
 * The value that satisfies the most of a path's comparisons.
 *
 * A path is often gated more than once — `relationship.pacci.friendship` is
 * checked at 10, 12 and 14 — and the useful default is the one that opens all of
 * them, not the first one found.
 */
function resolveDefault(group: CollectedLeaf[]): FlagValue {
    const candidates = group.map((entry) => deriveCandidate(entry.leaf));
    let best = candidates[0] ?? false;
    let bestScore = -1;

    for (const candidate of candidates) {
        const score = group.filter((entry) => satisfies(entry.leaf, candidate)).length;

        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }

    return best;
}

/** Every value the dialogue gates on, in presentation order. */
export function collectStateRequirements(
    definition: DialogueDefinition,
): DialogueStateRequirement[] {
    const byPath = new Map<string, CollectedLeaf[]>();

    for (const collected of collectAllLeaves(definition)) {
        const existing = byPath.get(collected.leaf.left);

        if (existing) {
            existing.push(collected);
        } else {
            byPath.set(collected.leaf.left, [collected]);
        }
    }

    const requirements: DialogueStateRequirement[] = [];

    for (const [path, group] of byPath) {
        const parsed = splitStatePath(path);

        if (!parsed) {
            continue;
        }

        requirements.push({
            path,
            slice: parsed.slice,
            key: parsed.key,
            subKey: parsed.subKey,
            kind: resolveKind(parsed.slice, group),
            defaultValue: resolveDefault(group),
            usage: [...new Set(group.map((entry) => entry.origin))],
        });
    }

    return requirements.sort(
        (a, b) => SLICES.indexOf(a.slice) - SLICES.indexOf(b.slice)
            || a.key.localeCompare(b.key)
            || (a.subKey ?? '').localeCompare(b.subKey ?? ''),
    );
}

/** Editor state: one text per requirement, since every editor is a text field. */
export type RequirementValues = Record<string, string>;

/** The starting editor state: everything set to the value that opens the most. */
export function createRequirementValues(
    requirements: DialogueStateRequirement[],
): RequirementValues {
    return Object.fromEntries(
        requirements.map((requirement) => [requirement.path, String(requirement.defaultValue)]),
    );
}

/**
 * Converts the editor state into the loose world state the engine accepts.
 *
 * The text is coerced using the requirement's own kind, so an emptied number
 * field becomes `0` rather than `NaN` and a dialogue still starts.
 */
export function buildWorldStateInput(
    requirements: DialogueStateRequirement[],
    values: RequirementValues,
): WorldStateInput {
    const flags: FlagState = {};
    const inventory: InventoryState = {};
    const relationship: RelationshipState = {};
    const objectives: Record<string, ObjectiveStateInput> = {};
    const stats: StatState = {};

    let hour: number | undefined;
    let day: number | undefined;

    for (const requirement of requirements) {
        const raw = values[requirement.path] ?? String(requirement.defaultValue);

        switch (requirement.slice) {
            case 'flags':
                flags[requirement.key] = requirement.kind === 'boolean'
                    ? raw === 'true'
                    : requirement.kind === 'number' ? Number(raw) : raw;
                break;

            case 'inventory':
                inventory[requirement.key] = requirement.kind === 'boolean'
                    ? raw === 'true'
                    : Number(raw);
                break;

            case 'relationship': {
                // Two levels, so the requirement's key is split back into the
                // character and the kind rather than stored as a dotted string.
                relationship[requirement.key] = {
                    ...relationship[requirement.key],
                    [requirement.subKey ?? '']: Number(raw),
                };
                break;
            }

            case 'objectives':
                objectives[requirement.key] = raw as ObjectiveStatus;
                break;

            case 'stats':
                stats[requirement.key] = Number(raw);
                break;

            case 'time':
                if (requirement.key === 'day') {
                    day = Number(raw);
                } else {
                    hour = Number(raw);
                }
                break;
        }
    }

    const time: TimeState | undefined = hour === undefined && day === undefined
        ? undefined
        : { hour: hour ?? 0, ...(day === undefined ? {} : { day }) };

    return { flags, inventory, relationship, objectives, stats, ...(time ? { time } : {}) };
}
