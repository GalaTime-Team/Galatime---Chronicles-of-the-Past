/**
 * Action resolver.
 *
 * Turns one validated action into the damage it deals, the effects it applies
 * and the feedback the HUD plays. It mutates the units it touches and returns
 * the events; deciding *when* an action may run is the session service's job.
 *
 * Resolution order for an attack is: `before_attack`, roll hits per target, apply
 * the main damage, apply the action's effects (honouring each effect's own
 * `apply_to` scope — which wakes `on_status_applied` where they land), let the
 * targets' reactive abilities fire, reap the defeated (firing their `on_death`
 * abilities), then report the attack itself as `after_attack` and `on_hit` or
 * `on_miss`. Effects are applied before the resolutions are emitted so each
 * resolution can list the effects it landed.
 */

import {
    FLEE_CHANCE,
    REST_MANA_RESTORE_FRACTION,
    REST_STAMINA_RESTORE_FRACTION,
} from '../constants/CombatConstants';
import type {
    AttackResolution,
    CombatAction,
    CombatElementIndex,
    CombatEvent,
    CombatOutcome,
    CombatRandom,
    CombatState,
    CombatUnit,
} from '../types/CombatType';
import { readString } from '../utils/combatUtils';
import type { AbilityTriggerContext } from './combat/abilityContext';
import { foldAttackModifiers } from './combat/abilityModifiers';
import { resolveAbilityEvent } from './combat/abilityTriggers';
import { resolveDamage } from './combat/damageCalculator';
import { reapDefeated } from './combat/defeatResolver';
import {
    applyEffectResources,
    applyEffectToUnit,
    changeResource,
    effectiveStats,
    resolveEffectTargets,
} from './combat/effectResolver';
import { reachableTargets } from './combat/targetResolver';
import { weaponStackMultiplier, effectPowerMultiplier } from './combat/weaponEffects';
import { applyWeaponActionHooks } from './combat/weaponActionHooks';

export interface ActionResolutionContext {
    state: CombatState;
    actor: CombatUnit;
    action: CombatAction;
    /** The chosen target for `enemy_one`; `null` for rule-based actions. */
    target: CombatUnit | null;
    elementIndex: CombatElementIndex;
    random: CombatRandom;
    /**
     * The actor's live inventory for this fight, when the caller has one
     * (the session owns it). Weapon ammo is spent against it, so arrows shot
     * leave the quiver at the end of the fight.
     */
    unitInventory?: Record<string, number>;
}

export interface ActionResolution {
    events: CombatEvent[];
    /** Set when the action itself ends the fight (a successful `flee`). */
    outcome: CombatOutcome | null;
}

/** The units an action addresses: the named one, or every reachable candidate. */
function resolveActionTargets(context: ActionResolutionContext): CombatUnit[] {
    const { state, actor, action, target } = context;
    if (action.targeting === 'enemy_one' && target) return [target];
    return reachableTargets(state.units, actor, action);
}

/**
 * The context an attack's own abilities are evaluated against.
 *
 * `source` is the actor and `target` the unit it aimed at, so `scope: attacker`
 * and `scope: defender` mean the same thing here as they do in a damage event.
 */
function attackAbilityContext(
    context: ActionResolutionContext,
    primaryTarget: CombatUnit | null,
): AbilityTriggerContext {
    return {
        source: context.actor,
        target: primaryTarget,
        damageType: context.action.damageType,
        elementId: context.action.elementId,
        damage: 0,
        units: context.state.units,
        random: context.random,
    };
}

/** Resolves a submitted action. Assumes the action was already validated. */
export function resolveCombatAction(context: ActionResolutionContext): ActionResolution {
    const { state, actor, action } = context;
    const events: CombatEvent[] = [
        {
            type: 'action_used',
            actorId: actor.id,
            actionId: action.id,
            actionName: action.name,
            kind: action.kind,
            targetIds: resolveActionTargets(context).map((unit) => unit.id),
        },
    ];

    let outcome: CombatOutcome | null = null;

    switch (action.kind) {
        case 'defend':
            actor.defending = true;
            break;
        case 'rest':
            events.push(...resolveRest(context));
            break;
        case 'flee':
            outcome = resolveFlee(context, events);
            break;
        case 'skill':
        case 'weapon': {
            const attackContext = attackAbilityContext(context, resolveActionTargets(context)[0] ?? null);
            events.push(...resolveAbilityEvent(state, actor, 'before_attack', attackContext));

            const attackEvents = resolveAttack(context);
            events.push(...attackEvents);

            const landed = attackEvents.some(
                (event) => event.type === 'attack_resolved' && event.resolution.isHit,
            );

            // Weapon bookkeeping: bank the hit streak, spend ammo, wear durability
            // (and destroy the weapon at 0). Runs before the actor's own
            // after_attack abilities so a broken weapon is already gone.
            if (action.kind === 'weapon') {
                const resolutions = attackEvents
                    .filter((event): event is Extract<CombatEvent, { type: 'attack_resolved' }> => event.type === 'attack_resolved')
                    .map((event) => event.resolution);
                events.push(...applyWeaponActionHooks(
                    actor,
                    action,
                    resolutions,
                    context.random,
                    context.unitInventory,
                ));
            }

            events.push(...resolveAbilityEvent(state, actor, 'after_attack', attackContext));
            events.push(...resolveAbilityEvent(state, actor, landed ? 'on_hit' : 'on_miss', attackContext));
            break;
        }
        case 'inventory':
            // Items are not wired to the backend yet; the service rejects this kind.
            break;
        case 'switch_line':
            events.push(...resolveSwitchLine(context));
            break;
    }

    return { events, outcome };
}

function resolveSwitchLine(context: ActionResolutionContext): CombatEvent[] {
    const { state, actor } = context;
    const targetLine = actor.line === 'front' ? 'rear' : 'front';

    const sameLineUnits = state.units.filter(
        (unit) => unit.side === actor.side && unit.line === targetLine,
    );
    const maxUnitsPerLine = 10;

    if (sameLineUnits.length >= maxUnitsPerLine) {
        return [];
    }

    actor.line = targetLine;
    actor.slot = sameLineUnits.length;

    return [];
}

function resolveRest(context: ActionResolutionContext): CombatEvent[] {
    const stats = effectiveStats(context.actor);
    const mana = Math.round(stats.maxMana * REST_MANA_RESTORE_FRACTION);
    const stamina = Math.round(stats.maxStamina * REST_STAMINA_RESTORE_FRACTION);

    return [
        ...changeResource(context.actor, 'mana', mana),
        ...changeResource(context.actor, 'stamina', stamina),
    ];
}

function resolveFlee(context: ActionResolutionContext, events: CombatEvent[]): CombatOutcome | null {
    const canFlee = context.actor.side === 'allies';
    const escaped = canFlee && context.random() < FLEE_CHANCE;

    events.push({ type: 'flee_attempted', unitId: context.actor.id, escaped });
    return escaped ? 'fled' : null;
}

/**
 * Rolls one target's damage and records the whole chain.
 *
 * The numbers come from {@link resolveDamage}, so a real hit and the HUD preview
 * can never drift apart.
 */
function buildResolution(
    context: ActionResolutionContext,
    target: CombatUnit,
): AttackResolution {
    const { actor, action, elementIndex, random, state } = context;

    const result = resolveDamage({
        action,
        attackerStats: effectiveStats(actor),
        defenderStats: effectiveStats(target),
        defenderElementIds: target.elementIds,
        elementIndex,
        attackerLine: actor.line,
        defenderLine: target.line,
        sameSide: actor.side === target.side,
        defenderDefending: target.defending,
        modifier: foldAttackModifiers(
            target,
            { damageType: action.damageType, elementId: action.elementId },
            random,
            state.units,
            actor,
            weaponStackMultiplier(actor, action),
        ),
        random,
    });

    const targetHpBefore = target.currentHp;
    if (result.finalDamage > 0) {
        target.currentHp = Math.max(0, target.currentHp - result.finalDamage);
    }

    return {
        attackerId: actor.id,
        targetId: target.id,
        actionId: action.id,
        ...result,
        targetHpBefore,
        targetHpAfter: target.currentHp,
        appliedEffectIds: [],
    };
}

function resolveAttack(context: ActionResolutionContext): CombatEvent[] {
    const { state, actor, action, random } = context;
    const events: CombatEvent[] = [];
    const actionTargets = resolveActionTargets(context);
    const primaryTarget = actionTargets[0] ?? null;

    const resolutions = new Map<string, AttackResolution>();
    if (action.dealsDamage) {
        for (const target of actionTargets) {
            resolutions.set(target.id, buildResolution(context, target));
        }
    }

    // Effects honour their own `apply_to` scope. `target` tracks the action's
    // targets; the team scopes are resolved once for the whole battlefield. A
    // status that lands wakes the victim's `on_status_applied` abilities.
    const appliedByUnit = new Map<string, string[]>();
    for (const effect of action.effects) {
        const applyTo = readString(effect.apply_to, '') || null;
        const scopeTargets = applyTo === null || applyTo === 'target'
            ? actionTargets
            : resolveEffectTargets(applyTo, actor, primaryTarget, state.units);

        for (const scopeTarget of scopeTargets) {
            if (scopeTarget.status !== 'alive') continue;

            const applied = applyEffectToUnit(scopeTarget, effect, action.id, action.elementId, random, effectPowerMultiplier(actor));
            if (applied) {
                events.push(applied);
                const list = appliedByUnit.get(scopeTarget.id) ?? [];
                list.push(applied.effectId);
                appliedByUnit.set(scopeTarget.id, list);

                events.push(...resolveAbilityEvent(state, scopeTarget, 'on_status_applied', {
                    source: actor,
                    target: scopeTarget,
                    damageType: action.damageType,
                    elementId: action.elementId,
                    damage: 0,
                    units: state.units,
                    random,
                }));
            }

            events.push(...applyEffectResources(scopeTarget, effect, random, effectPowerMultiplier(actor)));
        }
    }

    for (const target of actionTargets) {
        const resolution = resolutions.get(target.id);
        if (!resolution) continue;
        resolution.appliedEffectIds = appliedByUnit.get(target.id) ?? [];
        events.push({ type: 'attack_resolved', resolution });
    }

    // A landed hit can wake the target's reactive abilities (a reflection, a
    // first-hit immunity). Only survivors react: a corpse's abilities belong to
    // `on_death`, which the reap below fires.
    for (const target of actionTargets) {
        const resolution = resolutions.get(target.id);
        if (!resolution || !resolution.isHit || target.status !== 'alive') continue;

        events.push(...resolveAbilityEvent(state, target, 'after_damage', {
            source: actor,
            target,
            damageType: action.damageType,
            elementId: action.elementId,
            damage: resolution.finalDamage,
            units: state.units,
            random,
        }));
    }

    reapDefeated(state, events, random);
    return events;
}
