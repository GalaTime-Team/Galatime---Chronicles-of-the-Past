/**
 * Rewinding a unit's own time.
 *
 * Spatium's rewind takes a wound back: the unit's resources go back to what
 * they were, and the statuses of the rewound turns are undone. To do that the
 * engine keeps a short history of every unit — one snapshot per turn, taken
 * when the unit's turn begins.
 *
 * The history is the unit's own, so a rewind never rewinds the fight: it puts
 * one participant back where it was, and the rest of the battle carries on.
 */

import { MAX_REWIND_HISTORY } from '../../constants/CombatConstants';
import type {
    CombatEffectInstance,
    CombatEvent,
    CombatRewindSpec,
    CombatTimelineEntry,
    CombatUnit,
} from '../../types/CombatType';
import { changeResource } from './effectResolver';

/** Copies an effect instance, so a snapshot never shares state with the live one. */
export function cloneEffectInstance(effect: CombatEffectInstance): CombatEffectInstance {
    return {
        ...effect,
        buff: effect.buff ? { ...effect.buff } : null,
        debuff: effect.debuff ? { ...effect.debuff } : null,
        statMultipliers: effect.statMultipliers ? { ...effect.statMultipliers } : null,
        preventActions: effect.preventActions ? [...effect.preventActions] : null,
        immunities: effect.immunities ? [...effect.immunities] : null,
        regenPerTurn: effect.regenPerTurn ? { ...effect.regenPerTurn } : null,
        selfUpkeep: effect.selfUpkeep ? { ...effect.selfUpkeep } : null,
        deferredCost: effect.deferredCost ? { ...effect.deferredCost } : null,
        move: effect.move ? { ...effect.move } : null,
        rewind: effect.rewind ? { ...effect.rewind, resources: [...effect.rewind.resources] } : null,
    };
}

/** Copies the unit's statuses, for a snapshot. */
function cloneEffects(effects: readonly CombatEffectInstance[]): CombatEffectInstance[] {
    return effects.map(cloneEffectInstance);
}

/**
 * Records where the unit stands right now, so a rewind can come back to it.
 *
 * One snapshot per turn, and only the last {@link MAX_REWIND_HISTORY} of them
 * are kept — a fight can be long, and the history is there for the rewinds a
 * fight realistically needs.
 */
export function recordTimelineSnapshot(unit: CombatUnit): void {
    const entry: CombatTimelineEntry = {
        turn: unit.turnCount,
        hp: unit.currentHp,
        mana: unit.currentMana,
        stamina: unit.currentStamina,
        effects: cloneEffects(unit.effects),
    };

    unit.timeline.push(entry);
    if (unit.timeline.length > MAX_REWIND_HISTORY) {
        unit.timeline.splice(0, unit.timeline.length - MAX_REWIND_HISTORY);
    }
}

/**
 * The snapshot a rewind goes back to.
 *
 * `turns` counts the unit's own turns back: `1` undoes the turn it just took,
 * `2` the two before it. `null` means all of them, so the rewind lands on the
 * oldest snapshot the history still holds — the state the unit started the
 * fight in.
 */
function rewindTarget(unit: CombatUnit, turns: number | null): CombatTimelineEntry | null {
    const timeline = unit.timeline;
    if (timeline.length === 0) return null;

    if (turns === null) return timeline[0];

    const index = Math.max(0, timeline.length - Math.max(1, turns));
    return timeline[index];
}

/**
 * Puts a unit back the way it was.
 *
 * The pools named by the spec go back to the snapshot's values, and — unless the
 * spec says otherwise — the statuses of the rewound turns are undone too: the
 * ones applied since are removed, and the ones that had expired come back.
 */
export function rewindUnit(unit: CombatUnit, spec: CombatRewindSpec): CombatEvent[] {
    const snapshot = rewindTarget(unit, spec.turns);
    if (!snapshot) return [];

    const events: CombatEvent[] = [];
    const resources = spec.resources.length > 0
        ? spec.resources
        : (['hp', 'mana', 'stamina'] as const);

    let restoredHp = 0;
    let restoredMana = 0;
    let restoredStamina = 0;

    for (const resource of resources) {
        const before = resource === 'hp' ? unit.currentHp
            : resource === 'mana' ? unit.currentMana
                : unit.currentStamina;
        const after = resource === 'hp' ? snapshot.hp
            : resource === 'mana' ? snapshot.mana
                : snapshot.stamina;

        if (before === after) continue;

        events.push(...changeResource(unit, resource, after - before));

        const restored = after - before;
        if (resource === 'hp') restoredHp = restored;
        else if (resource === 'mana') restoredMana = restored;
        else restoredStamina = restored;
    }

    const removedEffectIds: string[] = [];

    if (spec.cleanse) {
        const snapshotIds = new Set(snapshot.effects.map((effect) => effect.effectId));

        // The statuses that arrived since the snapshot go away.
        const kept = unit.effects.filter((effect) => {
            if (snapshotIds.has(effect.effectId)) return true;
            removedEffectIds.push(effect.effectId);
            events.push({ type: 'effect_expired', unitId: unit.id, effectId: effect.effectId });
            return false;
        });

        // And the ones that had worn off come back.
        const liveIds = new Set(kept.map((effect) => effect.effectId));
        for (const effect of snapshot.effects) {
            if (liveIds.has(effect.effectId)) continue;
            kept.push(cloneEffectInstance(effect));
        }

        unit.effects = kept;
    }

    events.push({
        type: 'unit_rewound',
        unitId: unit.id,
        turns: spec.turns ?? unit.turnCount,
        restoredHp,
        restoredMana,
        restoredStamina,
        removedEffectIds,
    });

    return events;
}
