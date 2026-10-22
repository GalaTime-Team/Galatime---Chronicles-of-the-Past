import type { DialogueSegment } from '../../types/DialogueType';
import type { WorldState } from '../../types/WorldStateType';

/**
 * Speaks back the values the player gave the game.
 *
 * A line may hold a reference to a variable — `{input.name}`, `{name}` or
 * `{elements}` — and the writer does not have to know what the player will
 * answer. The reference is resolved here, when the line is shown, so the same
 * line says whatever the player typed.
 *
 * **A reference that has no value reads as nothing.** The player has not
 * answered yet, so there is nothing to say; the line still plays, with a gap
 * where the name would have been. A missing value is reported as a warning by
 * the validator, so a line that can never be filled does not pass silently.
 */

/**
 * The variable names the format knows by heart.
 *
 * `name` and `elements` are the protagonist's own — they are read from the
 * `input` slice like everything else, so a game that asks the player for their
 * name fills them in.
 */
const ALIASES: Record<string, string> = {
    name: 'input.name',
    elements: 'input.elements',
};

/**
 * Replaces every variable reference with the value it holds.
 *
 * The rest of the line is passed through untouched, including the delivery of
 * each segment: a thought that contains a variable is still a thought.
 */
export function resolveVariableSegments(
    segments: DialogueSegment[],
    state: WorldState,
): DialogueSegment[] {
    return segments.map((segment) => {
        if (segment.type !== 'variable') {
            return segment;
        }

        return { type: 'text', value: readVariable(segment.value, state) };
    });
}

/**
 * The value a reference names, or an empty string when it names none.
 *
 * The reference is a name, not a path: `input.name` is the variable `name`
 * under the `input` slice, and `name` is an alias for the same thing.
 */
export function readVariable(reference: string, state: WorldState): string {
    const name = String(reference ?? '').trim();

    if (name === '') {
        return '';
    }

    const key = ALIASES[name] ?? name;

    if (!key.startsWith('input.')) {
        return '';
    }

    const variable = key.slice('input.'.length);

    return state.input[variable] ?? '';
}

/**
 * The name of the variable a reference points at.
 *
 * `input.name` and `name` both point at `name`, so a warning about a missing
 * value names the variable the writer would have to fill.
 */
export function variableNameOf(reference: string): string {
    const name = String(reference ?? '').trim();
    const key = ALIASES[name] ?? name;

    return key.startsWith('input.') ? key.slice('input.'.length) : name;
}
