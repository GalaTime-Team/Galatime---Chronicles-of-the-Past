/**
 * Summon action.
 *
 * Brings units onto the battlefield from a blueprint that was pre-loaded at the
 * start of the fight (see `unitBlueprint.preloadAbilityBlueprints`), which is
 * what lets a death or a turn end spawn somebody synchronously.
 *
 * Placement mirrors the summoner: its own line is tried first, then the other one. A
 * multi-unit summon flanks the original — one branch to each side of the slot it burst
 * from — instead of piling up at one end of the line or spilling into the other lane. A
 * line already holding {@link MAX_UNITS_PER_LINE} units has no room — dead or alive, their
 * sprites still occupy the board.
 */

import { MAX_UNITS_PER_LINE } from '../../constants/CombatConstants';
import type { AbilityDefinition } from '../../types/AbilityType';
import type { CombatEvent, CombatLine, CombatSide, CombatState, CombatUnit } from '../../types/CombatType';
import { readNumber } from '../../utils/combatUtils';
import { readAbilityEntityTarget } from './abilityFactory';
import { abilityNotFired } from './abilityResult';
import type { AbilityActionResult } from './abilityResult';
import { getUnitBlueprint, instantiateUnit } from './unitBlueprint';

interface SummonPlacement {
    side: CombatSide;
    line: CombatLine;
    slot: number;
}

/** Slot indices already taken in one line, dead units included. */
function occupiedSlots(state: CombatState, side: CombatSide, line: CombatLine): Set<number> {
    const slots = new Set<number>();
    for (const unit of state.units) {
        if (unit.side === side && unit.line === line) slots.add(unit.slot);
    }
    return slots;
}

function firstFreeSlot(occupied: Set<number>): number | null {
    for (let slot = 0; slot < MAX_UNITS_PER_LINE; slot += 1) {
        if (!occupied.has(slot)) return slot;
    }
    return null;
}

/**
 * Where a summon stands, or `null` when both lines are full.
 *
 * `preferredLine` is only a preference: the other line is tried when it has no room.
 */
export function findSummonPlacement(
    state: CombatState,
    summoner: CombatUnit,
    preferredLine: CombatLine = summoner.line,
): SummonPlacement | null {
    const order: CombatLine[] = preferredLine === 'front' ? ['front', 'rear'] : ['rear', 'front'];

    for (const line of order) {
        const occupied = occupiedSlots(state, summoner.side, line);
        if (occupied.size >= MAX_UNITS_PER_LINE) continue;

        const slot = firstFreeSlot(occupied);
        if (slot !== null) return { side: summoner.side, line, slot };
    }

    return null;
}

/**
 * The free slot nearest the summoner, alternating sides.
 *
 * A multi-unit summon flanks the original: one branch to each side of the slot it
 * burst from, not a pile at one end of the line. The offsets walk outward (−1/+1,
 * −2/+2, …) and the first free slot in the summoner's own line wins; `null` when
 * that line is full, which the caller answers with the other line.
 */
function findFlankingPlacement(state: CombatState, summoner: CombatUnit): SummonPlacement | null {
    const occupied = occupiedSlots(state, summoner.side, summoner.line);
    if (occupied.size >= MAX_UNITS_PER_LINE) return null;

    for (let offset = 1; offset <= MAX_UNITS_PER_LINE; offset += 1) {
        for (const slot of [summoner.slot - offset, summoner.slot + offset]) {
            if (slot >= 0 && slot < MAX_UNITS_PER_LINE && !occupied.has(slot)) {
                return { side: summoner.side, line: summoner.line, slot };
            }
        }
    }

    return null;
}

/** The derived id, with a numeric suffix when another unit already holds it. */
function uniqueUnitId(state: CombatState, base: string): string {
    if (!state.units.some((unit) => unit.id === base)) return base;

    let suffix = 2;
    while (state.units.some((unit) => unit.id === `${base}_${suffix}`)) suffix += 1;
    return `${base}_${suffix}`;
}

/** Parameters: `entity_id`, `entity_type` and `count`. */
export function summonUnits(
    state: CombatState,
    summoner: CombatUnit,
    definition: AbilityDefinition,
): AbilityActionResult {
    const target = readAbilityEntityTarget(definition);
    if (!target) return abilityNotFired();

    const blueprint = getUnitBlueprint(target.entityId, target.entityType);
    if (!blueprint) return abilityNotFired();

    const count = Math.max(1, Math.round(readNumber(definition.action.parameters?.count, 1)));
    const targetIds: string[] = [];
    const events: CombatEvent[] = [];

    for (let index = 0; index < count; index += 1) {
        // A split flanks the original — one branch to each side of its slot, in the
        // summoner's own line. A single summon keeps the plain placement: the first
        // free slot of the summoner's line, the other line when there is no room.
        const placement = (count > 1
            ? findFlankingPlacement(state, summoner)
            : null) ?? findSummonPlacement(state, summoner);
        if (!placement) break;

        const unit = instantiateUnit(blueprint, {
            id: uniqueUnitId(state, `${placement.side}_${placement.line}_${placement.slot}_${blueprint.entityId}`),
            side: placement.side,
            line: placement.line,
            slot: placement.slot,
            isPlayerControlled: summoner.isPlayerControlled,
        });

        state.units.push(unit);
        targetIds.push(unit.id);
        events.push({
            type: 'unit_summoned',
            sourceId: summoner.id,
            unitId: unit.id,
            entityId: unit.entityId,
            name: unit.name,
            side: unit.side,
            line: unit.line,
            slot: unit.slot,
        });
    }

    if (targetIds.length === 0) return abilityNotFired();
    return { fired: true, targetIds, events };
}
