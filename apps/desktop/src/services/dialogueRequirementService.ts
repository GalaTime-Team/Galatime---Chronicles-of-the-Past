import type {
    ConditionLeaf,
    ConditionNode,
    DialogueDefinition,
    DialogueEffect,
} from '../types/DialogueType';
import { compareValues } from './dialogue/conditionService';
import { DEFAULT_ITEM_QUANTITY } from './state/inventoryService';
import type {
    FlagState,
    FlagValue,
    InventoryEntry,
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
 * A dialogue *gates* on the paths it compares in a condition, so those are what a
 * tester needs to set before playing it. An open editor would be worse than
 * useless: it would let somebody set `inventory.potato` to 10 and then wonder why
 * nothing happened, because the dialogue never asks about potatoes.
 *
 * The one exception is an item an effect moves. `remove_item` is a hard
 * requirement — the step fails outright when the player does not own what is taken
 * (`insufficient_item`) — so an item a dialogue takes has to be grantable or the
 * conversation cannot be tested at all. `add_item` is listed beside it so a tester
 * can also set what the player already holds; it imposes no requirement, so its
 * default is simply none.
 *
 * Only the slices `WorldStateInput` can express are returned. `dialogues.seen`
 * and `paths.unlocked` are deliberately left out: the engine owns them, and a
 * caller that sets them is fighting the engine rather than testing it. Item
 * effects on *entities* are left out too: they touch `entityInventories`, which
 * `WorldStateInput` cannot express.
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
     *
     * A path only an effect touches has no condition to satisfy: one being taken
     * defaults to the quantity taken, which is the smallest value the step can
     * succeed with, and one only being given defaults to none.
     */
    defaultValue: FlagValue;
    /** Where the dialogue reads or moves it, e.g. `nodes.first_choice.choices[0]`. */
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

/** One player-inventory effect, and where it lives. */
interface CollectedItemEffect {
    /** Item the effect moves. */
    itemId: string;
    /** How many of it are moved, defaulted the way the engine defaults it. */
    quantity: number;
    /**
     * Whether the effect *takes* the item.
     *
     * Taking is the only direction that imposes a requirement — the player has to
     * own what is being taken — so it is what decides a consumed item's minimum.
     */
    consumed: boolean;
    /** Where the effect lives, e.g. `nodes.fala_45.effects_after`. */
    origin: string;
}

/** Collects a node's player-inventory effects. Entity inventories are not settable. */
function collectItemEffects(
    effects: DialogueEffect[] | undefined,
    origin: string,
    out: CollectedItemEffect[],
): void {
    for (const effect of effects ?? []) {
        if (effect.type === 'add_item') {
            out.push({
                itemId: effect.item_id,
                quantity: effect.quantity ?? DEFAULT_ITEM_QUANTITY,
                consumed: false,
                origin,
            });
        } else if (effect.type === 'remove_item') {
            out.push({
                itemId: effect.item_id,
                quantity: effect.quantity ?? DEFAULT_ITEM_QUANTITY,
                consumed: true,
                origin,
            });
        }
    }
}

/**
 * Every player-inventory effect the dialogue runs, with where it lives.
 *
 * `add_item_to_entity` / `remove_item_from_entity` are skipped on purpose: they
 * move an entity's inventory, which `WorldStateInput` cannot express, so there is
 * no editor the panel could offer for them.
 */
function collectAllItemEffects(definition: DialogueDefinition): CollectedItemEffect[] {
    const effects: CollectedItemEffect[] = [];

    for (const [nodeId, node] of Object.entries(definition.nodes)) {
        switch (node.type) {
            case 'line':
            case 'character_enter':
            case 'character_exit':
                collectItemEffects(node.effects_after, `nodes.${nodeId}.effects_after`, effects);
                break;

            case 'end':
                collectItemEffects(node.effects, `nodes.${nodeId}.effects`, effects);
                break;

            case 'choice':
                node.choices.forEach((choice, index) => {
                    collectItemEffects(
                        choice.effects_before,
                        `nodes.${nodeId}.choices[${index}].effects_before`,
                        effects,
                    );
                });
                break;

            case 'conditional':
                break;
        }
    }

    return effects;
}

/** Which editor this path needs, read from the literals it is compared against. */
function resolveKind(slice: RequirementSlice, group: CollectedLeaf[]): RequirementKind {
    if (slice === 'objectives') {
        return 'objective_status';
    }

    if (slice === 'relationship' || slice === 'stats' || slice === 'time') {
        return 'number';
    }

    // A path takes the editor of whatever it is compared against. A boolean is a
    // yes/no question, so it wants a switch — on a flag it is the literal value,
    // on an item it is the count behind it. If a path is compared to more than one
    // shape the file is inconsistent, so it falls back to free text rather than
    // guessing which one was meant.
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
    return compareValues(leaf.condition, value, leaf.right);
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

/**
 * The inventory count a condition-derived default stands for.
 *
 * An entry is a count, so a boolean default means "one of the item" or "none" —
 * the same reading `coerceInventoryValue` uses when it turns the editor's text
 * back into state.
 */
function inventoryCountOf(value: FlagValue): number {
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
}

/** Every value the dialogue gates on or an effect moves, in presentation order. */
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

    // Effects add a second kind of path: an item the dialogue gives or takes is a
    // value a tester has to be able to set, just like one a condition compares —
    // with one extra rule, that an item being *taken* has to be owned first.
    const effectsByPath = new Map<string, CollectedItemEffect[]>();

    for (const effect of collectAllItemEffects(definition)) {
        const path = `inventory.${effect.itemId}`;
        const existing = effectsByPath.get(path);

        if (existing) {
            existing.push(effect);
        } else {
            effectsByPath.set(path, [effect]);
        }
    }

    const paths = [...new Set([...byPath.keys(), ...effectsByPath.keys()])];
    const requirements: DialogueStateRequirement[] = [];

    for (const path of paths) {
        const parsed = splitStatePath(path);

        if (!parsed) {
            continue;
        }

        const conditions = byPath.get(path);
        const effects = effectsByPath.get(path);

        // The most of the item any single effect takes; zero when none does.
        const taken = Math.max(
            0,
            ...(effects ?? [])
                .filter((effect) => effect.consumed)
                .map((effect) => effect.quantity),
        );

        let kind: RequirementKind;
        let defaultValue: FlagValue;

        if (taken > 0) {
            // Taking an item is a requirement of its own: the count has to reach
            // the quantity taken, whatever the conditions happened to ask for. The
            // editor is a number for the same reason — it sets an amount, not a
            // truth.
            kind = 'number';
            defaultValue = Math.max(
                inventoryCountOf(conditions ? resolveDefault(conditions) : 0),
                taken,
            );
        } else if (conditions) {
            kind = resolveKind(parsed.slice, conditions);
            defaultValue = resolveDefault(conditions);
        } else {
            // Given by an effect and never compared: nothing to satisfy, so the
            // tester simply starts with none of it.
            kind = 'number';
            defaultValue = 0;
        }

        requirements.push({
            path,
            slice: parsed.slice,
            key: parsed.key,
            subKey: parsed.subKey,
            kind,
            defaultValue,
            usage: [...new Set([
                ...(conditions ?? []).map((entry) => entry.origin),
                ...(effects ?? []).map((entry) => entry.origin),
            ])],
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
 * Turns one editor string into the value the engine stores.
 *
 * The switch is the inverse of `resolveKind`, so a flag never receives a shape
 * the dialogue could not have compared it against in the first place.
 */
function coerceFlagValue(kind: RequirementKind, raw: string): FlagValue {
    if (kind === 'boolean') {
        return raw === 'true';
    }

    return kind === 'number' ? Number(raw) : raw;
}

/**
 * Turns one editor string into an inventory count.
 *
 * The inverse of `resolveKind`, with the one narrowing the inventory imposes: an
 * entry is a quantity, so the boolean the switch shows is stored as the `1` and
 * `0` a dialogue would have to write. A non-numeric field degrades to `0` rather
 * than writing a `NaN` no condition could read back.
 */
function coerceInventoryValue(kind: RequirementKind, raw: string): InventoryEntry {
    if (kind === 'boolean') {
        return raw === 'true' ? 1 : 0;
    }

    const parsed = Number(raw);

    return Number.isFinite(parsed) ? parsed : 0;
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
                flags[requirement.key] = coerceFlagValue(requirement.kind, raw);
                break;

            case 'inventory':
                // A switch on an item is a question about a count, so it is
                // answered by writing the count the comparison is really asking
                // about: one of the item, or none.
                inventory[requirement.key] = coerceInventoryValue(requirement.kind, raw);
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
