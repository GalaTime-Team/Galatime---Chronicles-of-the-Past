import type { DialogueError } from '../../types/DialogueType';
import type { ObjectiveState, ObjectiveStatus, WorldState } from '../../types/WorldStateType';
import { clamp, createDialogueError } from '../../utils/dialogueUtils';
import type { StateWriteResult } from './worldStateService';

/**
 * Objective lifecycle.
 *
 * Transitions are validated against an explicit table so a dialogue cannot
 * silently re-activate something the player already finished.
 */

/**
 * Statuses each status may move to.
 *
 * An objective the game never declared counts as `locked`, which is why
 * completing one that was never explicitly unlocked is allowed: a dialogue can
 * legitimately finish something it introduced earlier in the conversation.
 */
const ALLOWED_TRANSITIONS: Record<ObjectiveStatus, readonly ObjectiveStatus[]> = {
    locked: ['active', 'completed', 'failed'],
    active: ['completed', 'failed'],
    completed: [],
    failed: ['active', 'completed'],
};

/** Status of an objective, treating "not declared" as `locked`. */
function currentStatus(state: WorldState, objectiveId: string): ObjectiveStatus {
    return state.objectives[objectiveId]?.status ?? 'locked';
}

/** Writes a status and records the change. */
function writeStatus(
    state: WorldState,
    objectiveId: string,
    next: ObjectiveStatus,
    source: string,
    progress?: number,
): StateWriteResult {
    const previous = state.objectives[objectiveId]?.status ?? null;

    const entry: ObjectiveState = progress === undefined
        ? { status: next }
        : { status: next, progress };

    state.objectives[objectiveId] = entry;

    return {
        change: {
            kind: 'objective_changed',
            target: `objectives.${objectiveId}`,
            previous,
            next,
            source,
        },
        error: null,
    };
}

function transitionError(objectiveId: string, from: ObjectiveStatus, to: ObjectiveStatus): DialogueError {
    return createDialogueError(
        'invalid_effect',
        `Objective "${objectiveId}" cannot move from "${from}" to "${to}".`,
        { objective_id: objectiveId, from, to },
    );
}

function unknownObjectiveError(objectiveId: string, action: string): DialogueError {
    return createDialogueError(
        'unknown_objective',
        `Objective "${objectiveId}" is unknown, so it cannot be ${action}.`,
        { objective_id: objectiveId },
    );
}

/**
 * Makes an objective available, without activating it.
 *
 * Unlocking something already known is a no-op, so replaying the effect is
 * harmless.
 */
export function unlockObjective(state: WorldState, objectiveId: string, source: string): StateWriteResult {
    if (state.objectives[objectiveId]) {
        return { change: null, error: null };
    }

    return writeStatus(state, objectiveId, 'locked', source);
}

/** Moves an objective to `active`. */
export function activateObjective(state: WorldState, objectiveId: string, source: string): StateWriteResult {
    if (!state.objectives[objectiveId]) {
        return { change: null, error: unknownObjectiveError(objectiveId, 'activated') };
    }

    const from = currentStatus(state, objectiveId);

    if (from === 'active') {
        return { change: null, error: null };
    }

    if (!ALLOWED_TRANSITIONS[from].includes('active')) {
        return { change: null, error: transitionError(objectiveId, from, 'active') };
    }

    return writeStatus(state, objectiveId, 'active', source, state.objectives[objectiveId]?.progress);
}

/** Marks an objective as completed. Completing one twice is a no-op. */
export function completeObjective(state: WorldState, objectiveId: string, source: string): StateWriteResult {
    const from = currentStatus(state, objectiveId);

    if (from === 'completed') {
        return { change: null, error: null };
    }

    if (!ALLOWED_TRANSITIONS[from].includes('completed')) {
        return { change: null, error: transitionError(objectiveId, from, 'completed') };
    }

    return writeStatus(state, objectiveId, 'completed', source, 1);
}

/** Marks an objective as failed. */
export function failObjective(state: WorldState, objectiveId: string, source: string): StateWriteResult {
    if (!state.objectives[objectiveId]) {
        return { change: null, error: unknownObjectiveError(objectiveId, 'failed') };
    }

    const from = currentStatus(state, objectiveId);

    if (from === 'failed') {
        return { change: null, error: null };
    }

    if (!ALLOWED_TRANSITIONS[from].includes('failed')) {
        return { change: null, error: transitionError(objectiveId, from, 'failed') };
    }

    return writeStatus(state, objectiveId, 'failed', source);
}

/**
 * Reports partial progress on an active objective.
 *
 * Progress is only meaningful while the objective is running, so this refuses
 * to touch a locked, completed or failed one.
 */
export function updateObjectiveProgress(
    state: WorldState,
    objectiveId: string,
    progress: number,
    source: string,
): StateWriteResult {
    const entry = state.objectives[objectiveId];

    if (!entry) {
        return { change: null, error: unknownObjectiveError(objectiveId, 'given progress') };
    }

    if (entry.status !== 'active') {
        return {
            change: null,
            error: createDialogueError(
                'invalid_effect',
                `Objective "${objectiveId}" only reports progress while active (currently "${entry.status}").`,
                { objective_id: objectiveId, status: entry.status },
            ),
        };
    }

    return writeStatus(state, objectiveId, 'active', source, clamp(progress, 0, 1));
}

/** Status of an objective, or `null` when the game never declared it. */
export function getObjectiveStatus(state: WorldState, objectiveId: string): ObjectiveStatus | null {
    return state.objectives[objectiveId]?.status ?? null;
}
