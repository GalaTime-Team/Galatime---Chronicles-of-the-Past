/**
 * Reaping the defeated.
 *
 * Marking a unit defeated is not just bookkeeping: its `on_death` abilities run
 * there (a slime bursts into two slimes). That can cascade — a reflection fired
 * from an `after_damage` ability may drop the attacker, and a split adds units
 * that must not be reaped by the pass that created them — so the sweep loops
 * instead of running once.
 *
 * It lives in its own module because two very different callers need it: the
 * action resolver (a hit just landed) and the turn loop (a status killed its host
 * as its turn began).
 */

import { MAX_UNITS_PER_LINE } from '../../constants/CombatConstants';
import type { CombatEvent, CombatRandom, CombatSide, CombatState } from '../../types/CombatType';
import { passiveTriggerContext } from './abilityContext';
import { resolveAbilityEvent } from './abilityTriggers';

/** Passes allowed while reaping: a reflection or a split can kill again. */
const MAX_REAP_PASSES = 8;

/**
 * Marks every unit at zero HP as defeated and fires its `on_death` abilities.
 *
 * Death clears the unit's effects, bracing and immunities, so nothing lingers on
 * a corpse. A unit brought in by a split is alive, so the same sweep cannot reap
 * it again.
 */
export function reapDefeated(state: CombatState, events: CombatEvent[], random: CombatRandom): void {
    let reaped = false;

    for (let pass = 0; pass < MAX_REAP_PASSES; pass += 1) {
        const fallen = state.units.filter((unit) => unit.status === 'alive' && unit.currentHp <= 0);
        if (fallen.length === 0) break;

        reaped = true;

        for (const unit of fallen) {
            unit.status = 'defeated';
            unit.currentHp = 0;
            unit.effects = [];
            unit.defending = false;
            unit.immunities = [];
            events.push({ type: 'unit_defeated', unitId: unit.id });
        }

        for (const unit of fallen) {
            events.push(...resolveAbilityEvent(state, unit, 'on_death', passiveTriggerContext(random, state.units)));
        }
    }

    // A death can empty a side's front line, and an empty front line cannot hold
    // the fight: the rear steps up as part of the same sweep.
    if (reaped) promoteRearLines(state, events);
}

/** First slot index a line still has free, or `null` when it is full. */
function firstFreeSlot(taken: ReadonlySet<number>): number | null {
    for (let slot = 0; slot < MAX_UNITS_PER_LINE; slot += 1) {
        if (!taken.has(slot)) return slot;
    }
    return null;
}

/**
 * Fills a side's emptied front line from its rear line.
 *
 * The front line is where a side fights from, so once every unit there has fallen
 * the rear steps up — obligatorily, not as a choice: the fight cannot go on with
 * nobody in front. Survivors keep their roster order and take the front's free
 * slots (the fallen still hold theirs); every step forward is reported so the log
 * can show it.
 */
export function promoteRearLines(state: CombatState, events: CombatEvent[]): void {
    const sides: CombatSide[] = ['allies', 'enemies'];

    for (const side of sides) {
        const frontHeld = state.units.some(
            (unit) => unit.side === side && unit.line === 'front' && unit.status === 'alive',
        );
        if (frontHeld) continue;

        const rear = state.units.filter(
            (unit) => unit.side === side && unit.line === 'rear' && unit.status === 'alive',
        );
        if (rear.length === 0) continue;

        const taken = new Set(
            state.units.filter((unit) => unit.side === side && unit.line === 'front').map((unit) => unit.slot),
        );

        for (const unit of rear) {
            const slot = firstFreeSlot(taken);
            if (slot === null) break;

            unit.line = 'front';
            unit.slot = slot;
            taken.add(slot);
            events.push({ type: 'unit_line_changed', unitId: unit.id, line: unit.line, slot });
        }
    }
}
