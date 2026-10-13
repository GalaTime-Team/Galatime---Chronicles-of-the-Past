/**
 * Deterministic action previews.
 *
 * The HUD and the AI both need to know what an action *would* do without
 * touching the fight: the HUD to draw the number on a target, the AI to score a
 * candidate. Both go through here, so a preview can never disagree with itself
 * (or with the real hit, which runs the same damage chain minus the dice).
 *
 * Pure: reads the units and the precomputed element index, mutates nothing and
 * never consumes the fight's RNG (`roll: false` skips accuracy and variance).
 */

import { asRecord, readNumber, readString } from '../../utils/combatUtils';
import type {
    CombatAction,
    CombatActionImpact,
    CombatElementIndex,
    CombatRandom,
    CombatUnit,
} from '../../types/CombatType';
import { foldAttackModifiers } from './abilityModifiers';
import { DETERMINISTIC_PREVIEW_RANDOM, resolveDamage } from './damageCalculator';
import { effectiveStats, resolveEffectTargets } from './effectResolver';
import { weaponStackMultiplier } from './weaponEffects';

/**
 * Flat HP an action's effects restore to one target.
 *
 * Only the authored `heal` field counts: `resource_regen` is paid out once per
 * turn the effect stays live, so it has no single "gain" to preview. Effects are
 * read through their own `apply_to` scope, so a `self` heal is not reported on
 * somebody else's preview.
 */
export function previewHealOn(
    action: CombatAction,
    actor: CombatUnit,
    target: CombatUnit,
    units: readonly CombatUnit[],
): number {
    let total = 0;

    for (const effect of action.effects) {
        const scope = resolveEffectTargets(readString(effect.apply_to, '') || null, actor, target, units);
        if (!scope.some((unit) => unit.id === target.id)) continue;

        total += readNumber(asRecord(effect)?.heal, 0);
    }

    return total;
}

/** Everything a preview needs; the session supplies the index and the RNG. */
export interface PreviewImpactParams {
    actor: CombatUnit;
    action: CombatAction;
    target: CombatUnit;
    units: readonly CombatUnit[];
    elementIndex: CombatElementIndex;
    random: CombatRandom;
}

/**
 * What an action would do to one target, without rolling randomness.
 *
 * Damage comes whole from the shared damage chain; healing is the action's flat
 * `heal`, which is all the resolver pays out in one go. An action that only
 * braces or buffs moves no health, so its `hpDelta` is `0`.
 */
export function previewImpact(params: PreviewImpactParams): CombatActionImpact {
    const { actor, action, target, units, elementIndex, random } = params;

    // One damage calculation for the whole game: the preview reads the same
    // inputs a real hit would use, minus the dice (`roll: false`). The ability
    // modifier is folded with deterministic randomness so a preview never
    // consumes the fight's RNG stream.
    const damage = resolveDamage({
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
            DETERMINISTIC_PREVIEW_RANDOM,
            units,
            actor,
            weaponStackMultiplier(actor, action),
        ),
        random,
        roll: false,
    });

    if (action.dealsDamage) {
        return { ...damage, hpDelta: damage.finalDamage, kind: 'damage' };
    }

    const healed = previewHealOn(action, actor, target, units);
    if (healed > 0) {
        return { ...damage, hpDelta: -healed, kind: 'heal', defenseReduction: 0 };
    }

    // Defend, rest and pure buffs move no health, so the HUD shows no number.
    return { ...damage, hpDelta: 0, kind: 'damage', defenseReduction: 0 };
}
