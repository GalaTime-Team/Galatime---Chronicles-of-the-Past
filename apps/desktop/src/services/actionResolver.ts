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
    COUNTER_REFLECT_FRACTION,
    REST_MANA_RESTORE_FRACTION,
    REST_STAMINA_RESTORE_FRACTION,
} from '../constants/CombatConstants';
import type { AttackEffect } from '../types/AttackDataType';
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
import { asRecord, readBoolean, readNumber, readString } from '../utils/combatUtils';
import type { AbilityTriggerContext } from './combat/abilityContext';
import { foldAttackModifiers } from './combat/abilityModifiers';
import { resolveAbilityEvent } from './combat/abilityTriggers';
import { phaseEffectMultiplier, resolveDamage } from './combat/damageCalculator';
import { reapDefeated, promoteRearLines } from './combat/defeatResolver';
import {
    applyEffectResources,
    applyEffectToUnit,
    bonusVsHpBelowFromEffects,
    changeResource,
    claimTargetLock,
    confusionChance,
    effectiveStats,
    hasCounter,
    isHealBlocked,
    invertBuffsOn,
    liftLuxCurses,
    resolveEffectTargets,
} from './combat/effectResolver';
import {
    applyCleanse,
    applyDispel,
    applyMove,
    applyRewind,
} from './combat/effectMechanics';
import { reachableTargets, scatterCandidates } from './combat/targetResolver';
import { effectiveTimePhase, setPhaseOverride } from './combat/phaseOverride';
import { fleeChanceFor } from './combat/fleeRules';
import { weaponStackMultiplier, effectPowerMultiplier } from './combat/weaponEffects';
import { applyWeaponActionHooks } from './combat/weaponActionHooks';

export interface ActionResolutionContext {
    state: CombatState;
    actor: CombatUnit;
    action: CombatAction;
    /** The chosen target for `any_one`; `null` for rule-based actions. */
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
    // A scatter action does not aim: every ray draws its own target, so the
    // action addresses the whole pool.
    if (action.scatterTargets && action.dealsDamage) {
        return scatterCandidates(state.units, actor, action);
    }
    if (action.targeting === 'any_one' && target) return [target];
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

/**
 * Applies any battlefield-phase override the action authors (`set_phase`).
 *
 * It runs after the action's own hit and effects, so the eclipse cannot change
 * the cast that created it.
 */
function resolveForcedPhase(
    state: CombatState,
    actor: CombatUnit,
    action: CombatAction,
): void {
    for (const effect of action.effects) {
        const record = asRecord(effect);
        const phase = readString(record?.set_phase, '');
        if (phase !== 'day' && phase !== 'night') continue;

        setPhaseOverride(state, phase, readNumber(record?.phase_rounds, 5), actor.id);
        return;
    }
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

            // A battlefield-phase override lands after the cast that authored
            // it, so an eclipse does not change its own damage retroactively.
            resolveForcedPhase(state, actor, action);

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

/**
 * Rolls a panic escape.
 *
 * The unit must already be below its health gate (the service refuses the
 * action otherwise), so this only owns the dice and the consequence. A
 * player-controlled success ends the fight as `'fled'`; an enemy success takes
 * that enemy out of the fight instead, leaving the rest of the battle running.
 */
function resolveFlee(context: ActionResolutionContext, events: CombatEvent[]): CombatOutcome | null {
    const { actor, state } = context;
    const chance = fleeChanceFor(actor);
    const escaped = chance > 0 && context.random() < chance;

    events.push({ type: 'flee_attempted', unitId: actor.id, escaped });

    if (!escaped) return null;
    if (actor.isPlayerControlled) return 'fled';

    // An enemy that escapes is out of the fight but was not killed: mark it so
    // victory still resolves, keep it out of the loot table, and let the rear
    // line step up if it was holding the front.
    actor.status = 'defeated';
    actor.flags.fled = true;
    promoteRearLines(state, events);
    return null;
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
    options: { attempts?: number } = {},
): AttackResolution {
    const { actor, action, elementIndex, random, state } = context;

    const result = resolveDamage({
        action,
        attempts: options.attempts,
        attackerStats: effectiveStats(actor),
        defenderStats: effectiveStats(target),
        defenderElementIds: target.elementIds,
        defender: target,
        elementIndex,
        attackerLine: actor.line,
        defenderLine: target.line,
        sameSide: actor.side === target.side,
        defenderDefending: target.defending,
        // The hour of the day decides what a solar or lunar action is worth.
        timePhase: effectiveTimePhase(state),
        // The wounded-target bonus reads how much of its health is left.
        defenderHpFraction: hpFraction(target),
        // A status such as Blood Moon can add damage against wounded targets.
        attackerTraits: bonusVsHpBelowFromEffects(actor, hpFraction(target)),
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

/** How much of its maximum health a unit still has, as a fraction. */
function hpFraction(unit: CombatUnit): number {
    const max = effectiveStats(unit).maxHp;
    return max > 0 ? unit.currentHp / max : 0;
}

/**
 * Rolls a scatter action's rays.
 *
 * Each ray picks a random living enemy from the pool, so the same unit may take
 * several rays and the back line can be reached without a lane penalty when the
 * action authors `can_hit_any_enemy` / `ignore_position_penalty`. A ray that
 * empties a target's health removes it from the pool for the remaining rays;
 * the deaths themselves are reaped once the whole cast is over.
 */
function rollScatter(
    context: ActionResolutionContext,
    pool: readonly CombatUnit[],
    resolutions: Map<string, AttackResolution>,
): void {
    const { action, random } = context;
    const rays = Math.max(1, action.scatterHits ?? action.hitCount);
    const candidates = [...pool];

    for (let ray = 0; ray < rays && candidates.length > 0; ray += 1) {
        // Clamp only guards a random source that returns exactly `1`.
        const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
        const target = candidates[index];

        // One ray is one hit: the damage chain must not multiply it by hitCount.
        const resolution = buildResolution(context, target, { attempts: 1 });
        const existing = resolutions.get(target.id);
        resolutions.set(target.id, existing ? mergeResolution(existing, resolution) : resolution);

        if (target.currentHp <= 0) candidates.splice(index, 1);
    }
}

/** Folds one scatter ray's outcome into the target's running total. */
function mergeResolution(into: AttackResolution, ray: AttackResolution): AttackResolution {
    return {
        ...into,
        isHit: into.isHit || ray.isHit,
        hits: into.hits + ray.hits,
        isCrit: into.isCrit || ray.isCrit,
        finalDamage: into.finalDamage + ray.finalDamage,
        targetHpAfter: ray.targetHpAfter,
    };
}

/**
 * Whether an action is aimed at the enemy side.
 *
 * Only these actions can be turned by confusion; a self-buff or a team heal is
 * never redirected.
 */
function isHostileAction(action: CombatAction): boolean {
    return action.dealsDamage
        || action.targeting === 'any_one'
        || action.targeting === 'enemies_all';
}

/**
 * The actor's own side, as the target of a confused action.
 *
 * A single-target action picks one ally at random (the actor included); an area
 * action covers the whole side, mirroring how it would have covered the enemy
 * side.
 */
function confusedTargets(
    state: CombatState,
    actor: CombatUnit,
    action: CombatAction,
    random: CombatRandom,
): CombatUnit[] {
    const allies = state.units.filter(
        (unit) => unit.status === 'alive' && unit.side === actor.side,
    );
    if (allies.length === 0) return [actor];

    if (action.targeting === 'enemies_all' || action.targeting === 'both_teams') return allies;

    const index = Math.min(allies.length - 1, Math.floor(random() * allies.length));
    return [allies[index]];
}

/** Mirrors a team scope when confusion turns an action on its own side. */
function swapTeamScope(scope: string): string {
    if (scope === 'enemies_all') return 'allies_all';
    if (scope === 'allies_all') return 'enemies_all';
    return scope;
}

/**
 * Takes a random subset of a resolved scope (`random_targets`).
 *
 * Plague uses it to curse only some of the enemies rather than the whole line.
 * The roll happens after the scope is resolved, so it composes with `both_teams`.
 */
function pickRandomTargets(
    targets: CombatUnit[],
    effect: AttackEffect,
    random: CombatRandom,
): CombatUnit[] {
    const spec = asRecord(asRecord(effect)?.random_targets);
    if (!spec || targets.length <= 1) return targets;

    const min = Math.max(1, Math.round(readNumber(spec.min, 1)));
    const max = Math.max(min, Math.round(readNumber(spec.max, targets.length)));
    const count = Math.min(targets.length, min + Math.floor(random() * (max - min + 1)));

    const pool = [...targets];
    for (let index = pool.length - 1; index > 0; index -= 1) {
        const swap = Math.min(index, Math.floor(random() * (index + 1)));
        const held = pool[index];
        pool[index] = pool[swap];
        pool[swap] = held;
    }

    return pool.slice(0, count);
}

function resolveAttack(context: ActionResolutionContext): CombatEvent[] {
    const { state, actor, action, random } = context;
    const events: CombatEvent[] = [];
    // A scatter action does not aim: every ray draws its own target from the
    // pool. The rest of the resolver still works off the units the action hit.
    const scatter = action.dealsDamage && action.scatterTargets;

    // Confusion is rolled once per action: an entire area attack either turns on
    // the actor's own side or lands normally.
    const confused = isHostileAction(action) && random() < confusionChance(actor);
    const actionTargets = confused
        ? confusedTargets(state, actor, action, random)
        : resolveActionTargets(context);
    const primaryTarget = actionTargets[0] ?? null;

    const resolutions = new Map<string, AttackResolution>();
    if (action.dealsDamage) {
        if (scatter) {
            rollScatter(context, actionTargets, resolutions);
        } else {
            for (const target of actionTargets) {
                resolutions.set(target.id, buildResolution(context, target));
            }
        }
    }

    // The `target` scope of a scatter action follows the rays: only the units a
    // ray actually hit receive the effect. The team scopes keep their literal
    // meaning and are resolved once for the whole battlefield.
    const targetScope = scatter
        ? actionTargets.filter((target) => resolutions.get(target.id)?.isHit)
        : actionTargets;

    // The same hour-of-the-day curve the direct hit uses also scales the effect
    // magnitudes — never their duration, costs or control flags.
    const phaseMultiplier = phaseEffectMultiplier(action, effectiveTimePhase(state));

    // Any Lux attack that lands lifts a `removable_by_lux` curse (Curse, Hex,
    // Plague), whether it belonged to the caster or to somebody else.
    if (action.elementId === 'lux') {
        for (const target of actionTargets) {
            if (!resolutions.get(target.id)?.isHit) continue;
            events.push(...liftLuxCurses(target));
        }
    }

    // Effects honour their own `apply_to` scope. `target` tracks the action's
    // targets; the team scopes are resolved once for the whole battlefield. A
    // status that lands wakes the victim's `on_status_applied` abilities.
    const appliedByUnit = new Map<string, string[]>();
    for (const effect of action.effects) {
        const applyTo = readString(effect.apply_to, '') || null;
        const scopeTargets = applyTo === null || applyTo === 'target'
            ? targetScope
            : resolveEffectTargets(
                confused ? swapTeamScope(applyTo) : applyTo,
                actor,
                primaryTarget,
                state.units,
            );
        const effectTargets = pickRandomTargets(scopeTargets, effect, random);

        for (const scopeTarget of effectTargets) {
            if (scopeTarget.status !== 'alive') continue;

            const applied = applyEffectToUnit(scopeTarget, effect, action.id, action.elementId, random, effectPowerMultiplier(actor), phaseMultiplier);
            if (applied) {
                events.push(applied);
                if (applied.type === 'effect_applied') {
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
            }

            // A `heal_block` holder cannot be healed by anybody else; its own
            // healing still works.
            const healBlocked = isHealBlocked(scopeTarget) && scopeTarget.id !== actor.id;

            events.push(...applyEffectResources(
                scopeTarget,
                effect,
                random,
                effectPowerMultiplier(actor),
                { healBlocked, drainRecipient: actor, phaseMultiplier, damageDealt: resolutions.get(scopeTarget.id)?.finalDamage ?? 0 },
            ));

            // The effects that change the battlefield rather than a number.
            events.push(...applyCleanse(scopeTarget, effect));
            events.push(...applyDispel(scopeTarget, effect));
            // An `invert_buffs` landing turns the gifts the target still holds
            // into curses of the same size (Solar Exorcism).
            if (readBoolean((asRecord(effect) ?? {}).invert_buffs, false)) {
                events.push(...invertBuffsOn(scopeTarget));
            }
            events.push(...applyMove(state, actor, scopeTarget, effect));
            events.push(...applyRewind(scopeTarget, effect));

            // A cooldown tick takes turns off the target's waiting actions.
            const cooldownTick = readNumber(asRecord(effect)?.cooldown_tick, 0);
            if (cooldownTick > 0) {
                for (const actionId of Object.keys(scopeTarget.cooldowns)) {
                    const remaining = scopeTarget.cooldowns[actionId] - Math.round(cooldownTick);
                    if (remaining <= 0) delete scopeTarget.cooldowns[actionId];
                    else scopeTarget.cooldowns[actionId] = remaining;
                }
            }
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

        // A `counter` status throws the next hit back at the attacker. The
        // status survives the throw — it simply has nothing left to reflect.
        if (hasCounter(target) && resolution.finalDamage > 0) {
            events.push(...reflectCounter(actor, target, resolution.finalDamage));
        }
    }

    // A `locks_target` status grows its focus on the first target a damaging
    // action reaches while the buff lives (Keen Focus cast on oneself).
    if (action.dealsDamage) {
        for (const target of actionTargets) {
            if (target.status !== 'alive') continue;
            if (!resolutions.get(target.id)?.isHit) continue;

            claimTargetLock(actor, target.id);
            break;
        }
    }

    // A skill that says "the target panics below this much health" takes it
    // out of the fight when the hit leaves it that low. Control skills (Fear and
    // friends) have no damage roll, so they reach their targets outright.
    const fleeBelowHp = action.fleeBelowHp;
    if (fleeBelowHp !== null && fleeBelowHp > 0) {
        for (const target of actionTargets) {
            const resolution = resolutions.get(target.id);
            const landed = resolution ? resolution.isHit : !action.dealsDamage;
            if (!landed || target.status !== 'alive') continue;
            if (hpFraction(target) > fleeBelowHp) continue;

            target.status = 'defeated';
            events.push({ type: 'flee_attempted', unitId: target.id, escaped: true });
            events.push({ type: 'unit_defeated', unitId: target.id });
            promoteRearLines(state, events);
        }
    }

    reapDefeated(state, events, random);
    return events;
}

/**
 * Throws part of a landed hit back at the attacker.
 *
 * The counter is spent by the throw: the status stays on the unit, but it no
 * longer reflects anything.
 */
function reflectCounter(
    attacker: CombatUnit,
    reflector: CombatUnit,
    damage: number,
): CombatEvent[] {
    const amount = Math.max(1, Math.round(damage * COUNTER_REFLECT_FRACTION));
    const counter = reflector.effects.find((effect) => effect.counter);
    if (counter) counter.counter = false;

    attacker.currentHp = Math.max(0, attacker.currentHp - amount);

    return [{
        type: 'damage_reflected',
        sourceId: reflector.id,
        targetId: attacker.id,
        abilityId: counter?.effectId ?? `${reflector.id}_counter`,
        abilityName: counter?.statusEffect ?? 'Counter',
        isHit: true,
        amount,
        targetHpAfter: attacker.currentHp,
    }];
}
