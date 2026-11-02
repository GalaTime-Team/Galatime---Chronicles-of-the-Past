/**
 * Target selection and target legality.
 *
 * Turns an action's authored `targeting` scope into a concrete list of units,
 * then applies the positional reach rules. `any_one` additionally needs the
 * caller to name a target, which {@link validateTargetRule} checks.
 */
import type {
    CombatAction,
    CombatError,
    CombatState,
    CombatUnit,
} from '../../types/CombatType';
import { createCombatError } from '../../utils/combatUtils';
import { isUntargetable, liveTargetLockId } from './effectResolver';
import { isRangeAllowedFromLine, rangeReachesLine } from './positionRules';

/**
 * Units an action may address before positional reach is considered.
 *
 * A unit under an `untargetable` status cannot be chosen by anybody else; the
 * actor can still single itself out.
 */
export function candidateTargets(
    units: readonly CombatUnit[],
    actor: CombatUnit,
    action: CombatAction,
): CombatUnit[] {
    const alive = units.filter((unit) => unit.status === 'alive');

    const reachable = (() => {
        switch (action.targeting) {
            case 'self':
                return alive.filter((unit) => unit.id === actor.id);
            case 'enemies_all':
                return alive.filter((unit) => unit.side !== actor.side);
            case 'allies_all':
                return alive.filter((unit) => unit.side === actor.side);
            case 'both_teams':
                return alive;
            case 'any_one':
            default:
                // A single-target action may be aimed at anyone on the field, the
                // actor's own side included: friendly fire is a real choice, and a
                // single-target heal needs the same freedom. Only `self` and the
                // team-scoped rules restrict the roster.
                return alive;
        }
    })();

    return reachable.filter((unit) => unit.id === actor.id || !isUntargetable(unit));
}

/**
 * Units the action can actually reach from the actor's lane.
 *
 * Ally targets are never limited by reach; enemy targets must sit in a line the
 * action's range can cross (short reach stops at the enemy front line).
 *
 * A unit under a `locks_target` status (Keen Focus and friends) cannot switch
 * targets: while the focus lives, aimed actions may only address the unit the
 * lock has claimed. The lock releases the moment its victim falls.
 */
export function reachableTargets(
    units: readonly CombatUnit[],
    actor: CombatUnit,
    action: CombatAction,
): CombatUnit[] {
    const lockedId = liveTargetLockId(actor);
    if (lockedId !== null && (action.targeting === 'any_one' || action.targeting === 'enemies_all')) {
        const lockedUnit = units.find(
            (unit) => unit.id === lockedId && unit.status === 'alive',
        );
        return lockedUnit ? [lockedUnit] : [];
    }

    if (!isRangeAllowedFromLine(action.range, actor.line)) return [];

    return candidateTargets(units, actor, action).filter((unit) => {
        if (unit.side === actor.side) return true;
        return rangeReachesLine(action.range, unit.line);
    });
}

/** Ids of every legal target, used to build an action preview. */
export function legalTargetIds(
    state: CombatState,
    actor: CombatUnit,
    action: CombatAction,
): string[] {
    if (action.scatterTargets) {
        return scatterCandidates(state.units, actor, action).map((unit) => unit.id);
    }

    return reachableTargets(state.units, actor, action).map((unit) => unit.id);
}

/**
 * The pool a scatter action draws each ray from.
 *
 * `can_hit_any_enemy` lifts the positional reach entirely: every living enemy
 * is fair game, the back line included. Otherwise the action keeps its normal
 * reach rules and only the enemies it could already hit are eligible.
 */
export function scatterCandidates(
    units: readonly CombatUnit[],
    actor: CombatUnit,
    action: CombatAction,
): CombatUnit[] {
    if (action.canHitAnyEnemy) {
        return units.filter((unit) => (
            unit.status === 'alive'
            && unit.side !== actor.side
            && !isUntargetable(unit)
        ));
    }

    return reachableTargets(units, actor, action)
        .filter((unit) => unit.side !== actor.side);
}

export interface TargetValidation {
    /** The named target, for `any_one`; `null` for area actions. */
    target: CombatUnit | null;
    error: CombatError | null;
}

/**
 * Validates the target of an action.
 *
 * Returns the resolved target for single-target actions, and `null` for rule
 * actions whose targets the resolver derives from the battlefield.
 */
export function validateTargetRule(
    state: CombatState,
    actor: CombatUnit,
    action: CombatAction,
    targetId?: string,
): TargetValidation {
    // A scatter action that may pick any enemy ignores the reach that would
    // otherwise forbid firing from this lane.
    const liftsReach = action.scatterTargets && action.canHitAnyEnemy;

    if (!liftsReach && !isRangeAllowedFromLine(action.range, actor.line)) {
        return {
            target: null,
            error: createCombatError(
                'out_of_range',
                `A ${action.range}-range action cannot be used from the ${actor.line} line.`,
                { actionId: action.id, actorId: actor.id, line: actor.line },
            ),
        };
    }

    // Scatter picks its own targets ray by ray, so the only question is whether
    // anybody is left to shoot at.
    if (action.scatterTargets) {
        if (scatterCandidates(state.units, actor, action).length === 0) {
            return {
                target: null,
                error: createCombatError('target_invalid', 'No unit can be hit by this action.', {
                    actionId: action.id,
                }),
            };
        }

        return { target: null, error: null };
    }

    if (action.targeting === 'any_one') {
        const lockedId = liveTargetLockId(actor);
        if (lockedId !== null && targetId !== lockedId) {
            return {
                target: null,
                error: createCombatError(
                    'target_invalid',
                    'A focus status keeps this unit on its current target.',
                    { actionId: action.id, actorId: actor.id, lockedTargetId: lockedId },
                ),
            };
        }

        if (!targetId) {
            return {
                target: null,
                error: createCombatError('target_required', 'This action needs a target.', {
                    actionId: action.id,
                }),
            };
        }

        const target = state.units.find((unit) => unit.id === targetId) ?? null;
        // The actor may always target itself; every other unit must be alive and
        // not hiding behind an `untargetable` status.
        if (
            !target
            || target.status !== 'alive'
            || (target.id !== actor.id && isUntargetable(target))
        ) {
            return {
                target: null,
                error: createCombatError('target_invalid', 'That unit cannot be targeted.', {
                    actionId: action.id,
                    targetId,
                }),
            };
        }

        // Reach only limits what the action can cross towards the other side; a
        // unit on the actor's own side is always an arm's length away.
        if (target.side !== actor.side && !rangeReachesLine(action.range, target.line)) {
            return {
                target: null,
                error: createCombatError(
                    'out_of_range',
                    `A ${action.range}-range action cannot reach the ${target.line} line.`,
                    { actionId: action.id, targetId },
                ),
            };
        }

        return { target, error: null };
    }

    if (reachableTargets(state.units, actor, action).length === 0) {
        return {
            target: null,
            error: createCombatError('target_invalid', 'No unit can be hit by this action.', {
                actionId: action.id,
            }),
        };
    }

    return { target: null, error: null };
}
