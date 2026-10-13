import type {
    ComparisonOperator,
    ConditionGroup,
    ConditionLeaf,
    ConditionNode,
} from '../../types/DialogueType';
import type { FlagValue, WorldState } from '../../types/WorldStateType';
import { toFiniteNumber, toStateBoolean } from '../../utils/dialogueUtils';
import type { StatePathValue } from '../state/worldStateService';
import { readStatePath } from '../state/worldStateService';

/**
 * Evaluates dialogue conditions against the world state.
 *
 * Read-only by contract: nothing here can mutate the state, so a condition can
 * be evaluated speculatively (to preview which choices would appear) without
 * side effects.
 */

/** Every comparison the evaluator understands. */
export const COMPARISON_OPERATORS: readonly ComparisonOperator[] = [
    'equals',
    'not_equals',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal',
];

/** Narrows an arbitrary string to a supported comparison. */
export function isComparisonOperator(value: unknown): value is ComparisonOperator {
    return typeof value === 'string' && (COMPARISON_OPERATORS as readonly string[]).includes(value);
}

/** A node is a leaf when it names a comparison; otherwise it is a group. */
export function isConditionLeaf(node: ConditionNode): node is ConditionLeaf {
    return typeof (node as ConditionLeaf).condition === 'string';
}

/**
 * Evaluates a condition node.
 *
 * An absent condition counts as satisfied, which is what makes `visible_if`,
 * `enabled_if`, `entry_conditions` and branch `if` optional in the file
 * format.
 */
export function evaluateCondition(node: ConditionNode | undefined, state: WorldState): boolean {
    if (!node) {
        return true;
    }

    return isConditionLeaf(node) ? evaluateLeaf(node, state) : evaluateGroup(node, state);
}

/**
 * Evaluates a group.
 *
 * Every key present must pass, so `all` and `not` together read as "all of
 * these, and none of that". An empty group is satisfied.
 */
export function evaluateGroup(group: ConditionGroup, state: WorldState): boolean {
    if (group.all && !group.all.every((child) => evaluateCondition(child, state))) {
        return false;
    }

    if (group.any && !group.any.some((child) => evaluateCondition(child, state))) {
        return false;
    }

    if (group.not && evaluateCondition(group.not, state)) {
        return false;
    }

    return true;
}

/** Evaluates a single comparison against the state. */
export function evaluateLeaf(leaf: ConditionLeaf, state: WorldState): boolean {
    return compareValues(leaf.condition, readStatePath(state, leaf.left), leaf.right);
}

/**
 * Compares a state value against a literal.
 *
 * A boolean literal is a yes/no question about the entry rather than a value to
 * match, so it is answered by `toStateBoolean`. That is what lets a branch ask
 * the two questions it always ends up asking — "which option did the player
 * pick?" about a flag, and "is the player carrying this?" about an inventory
 * count — without the writer having to guess whether the entry is currently `1`,
 * `0` or not there yet.
 *
 * Every other comparison stays strict, so a number never equals its quoted
 * string form and authored text values must be quoted consistently. A list is
 * compared by membership (`equals: some_dialogue_id` reads as "has already seen
 * it"), while numeric operators compare the list length.
 */
export function compareValues(
    operator: ComparisonOperator,
    left: StatePathValue,
    right: FlagValue | null,
): boolean {
    if (Array.isArray(left) && !isBooleanQuestion(left, right)) {
        switch (operator) {
            case 'equals':
                return right !== null && left.includes(String(right));
            case 'not_equals':
                return right === null || !left.includes(String(right));
            default: {
                const expectedLength = toFiniteNumber(right);
                return expectedLength === null
                    ? false
                    : compareNumbers(operator, left.length, expectedLength);
            }
        }
    }

    if (isBooleanQuestion(left, right)) {
        const leftAnswer = toStateBoolean(left);
        const rightAnswer = toStateBoolean(right);

        if (operator === 'equals') {
            return leftAnswer === rightAnswer;
        }

        if (operator === 'not_equals') {
            return leftAnswer !== rightAnswer;
        }

        // An ordering has no meaning for a yes/no answer, so it falls through to
        // the numeric path below, where a non-numeric side fails the comparison.
    }

    if (operator === 'equals') {
        return left === right;
    }

    if (operator === 'not_equals') {
        return left !== right;
    }

    const numericLeft = toFiniteNumber(left);
    const numericRight = toFiniteNumber(right);

    if (numericLeft === null || numericRight === null) {
        return false;
    }

    return compareNumbers(operator, numericLeft, numericRight);
}

/**
 * Whether a comparison against this pair should be read as a yes/no question.
 *
 * Only a boolean against something that has no words in it qualifies. Text is
 * left out on purpose: `flags.mood = true` must not quietly match
 * `flags.mood = "brave"`, because a named flag is a choice of words and the
 * writer spelled one out. An absent entry does qualify, so `= false` covers
 * "never set".
 */
function isBooleanQuestion(left: StatePathValue, right: FlagValue | null): boolean {
    if (typeof left !== 'boolean' && typeof right !== 'boolean') {
        return false;
    }

    return isAnswerable(left) && isAnswerable(right);
}

/** Whether a value can be answered yes or no, i.e. it is not free text. */
function isAnswerable(value: StatePathValue | FlagValue | null): boolean {
    return typeof value === 'boolean' || typeof value === 'number' || Array.isArray(value)
        || value === null;
}

/** Numeric comparison. Ordering operators on non-numbers never reach here. */
function compareNumbers(operator: ComparisonOperator, left: number, right: number): boolean {
    switch (operator) {
        case 'greater_than':
            return left > right;
        case 'greater_or_equal':
            return left >= right;
        case 'less_than':
            return left < right;
        case 'less_or_equal':
            return left <= right;
        case 'equals':
            return left === right;
        case 'not_equals':
            return left !== right;
        default:
            return false;
    }
}
