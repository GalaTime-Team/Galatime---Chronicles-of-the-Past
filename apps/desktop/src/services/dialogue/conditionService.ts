import type {
    ComparisonOperator,
    ConditionGroup,
    ConditionLeaf,
    ConditionNode,
} from '../../types/DialogueType';
import type { FlagValue, WorldState } from '../../types/WorldStateType';
import { toFiniteNumber } from '../../utils/dialogueUtils';
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
 * Scalar comparison is strict, so a number never equals its string form and
 * authored values must be quoted consistently. A list is compared by
 * membership (`equals: some_dialogue_id` reads as "has already seen it"),
 * while numeric operators compare the list length.
 */
export function compareValues(
    operator: ComparisonOperator,
    left: StatePathValue,
    right: FlagValue | null,
): boolean {
    if (Array.isArray(left)) {
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
