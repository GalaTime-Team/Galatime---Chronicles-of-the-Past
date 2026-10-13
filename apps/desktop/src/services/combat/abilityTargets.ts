/**
 * Ability target resolution.
 *
 * Two related questions, one module: which units an action addresses
 * (`action.target`, defaulting to the trigger's `scope`) and which unit a
 * condition reads (`stat.target` / `status.target`). Both are relative to the
 * ability's owner, and both fall back to the owner itself.
 */

import type {
    AbilityActionTarget,
    AbilityStatTarget,
    AbilityTriggerScope,
} from '../../types/AbilityType';
import type { CombatUnit } from '../../types/CombatType';
import type { AbilityTriggerContext } from './abilityContext';

/** The unit a trigger scope points at; `null` for `battle` or an absent actor. */
export function resolveScopeUnit(
    scope: AbilityTriggerScope | undefined,
    owner: CombatUnit,
    context: AbilityTriggerContext,
): CombatUnit | null {
    switch (scope ?? 'self') {
        case 'attacker':
            return context.source;
        case 'defender':
            return context.target;
        case 'ally': {
            const candidate = context.source ?? context.target;
            return candidate && candidate.side === owner.side ? candidate : owner;
        }
        case 'enemy': {
            const candidate = context.source ?? context.target;
            return candidate && candidate.side !== owner.side ? candidate : null;
        }
        case 'battle':
            return null;
        case 'self':
        default:
            return owner;
    }
}

/** The unit a condition reads; `null` when the context has no such actor. */
export function resolveStatTarget(
    target: AbilityStatTarget | undefined,
    owner: CombatUnit,
    context: AbilityTriggerContext,
): CombatUnit | null {
    switch (target ?? 'self') {
        case 'attacker':
        case 'source':
            return context.source;
        case 'defender':
        case 'target':
            return context.target;
        case 'self':
        default:
            return owner;
    }
}

/**
 * The units an action addresses.
 *
 * `self`/`attacker`/`defender` are single units; `allies`/`enemies`/`battle` are
 * every living combatant in that scope.
 */
export function resolveAbilityTargets(
    target: AbilityActionTarget,
    owner: CombatUnit,
    context: AbilityTriggerContext,
): CombatUnit[] {
    const alive = context.units.filter((unit) => unit.status === 'alive');

    switch (target) {
        case 'attacker':
        case 'source':
            return context.source ? [context.source] : [];
        case 'defender':
        case 'target':
            return context.target ? [context.target] : [];
        case 'allies':
            return alive.filter((unit) => unit.side === owner.side);
        case 'enemies':
            return alive.filter((unit) => unit.side !== owner.side);
        case 'battle':
            return alive;
        case 'self':
        default:
            return [owner];
    }
}
