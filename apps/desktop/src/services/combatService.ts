/**
 * Combat session service.
 *
 * The backend entry point for a fight: it builds the units from an authored
 * encounter, owns the in-memory sessions (mirroring the dialogue engine, which
 * also runs in process) and drives the turn loop. Turn *rules* live in
 * `services/combat/*` and action *resolution* in `services/actionResolver`; this
 * module is the state machine that stitches them together.
 */

import { MAX_CARRIED_WEAPONS, MAX_LOG_ENTRIES, MAX_UNITS_PER_LINE } from '../constants/CombatConstants';
import type {
    CombatAction,
    CombatActionImpact,
    CombatActionPreview,
    CombatActionRequest,
    CombatElementIndex,
    CombatEncounter,
    CombatEncounterMember,
    CombatErrorCode,
    CombatEvent,
    CombatLine,
    CombatOutcome,
    CombatRandom,
    CombatResult,
    CombatSide,
    CombatState,
    CarriedWeapon,
    CombatTurnResult,
    CombatUnit,
    StartCombatOptions,
} from '../types/CombatType';
import { combatFail, combatOk, createCombatError, trimLog } from '../utils/combatUtils';
import type { AiDecisionContext } from '../types/AiType';
import type { LootEntry } from '../types/EntityDataType';
import { resolveCombatAction } from './actionResolver';
import { passiveTriggerContext } from './combat/abilityContext';
import {
    resolveAbilityEvent,
    resolveBattleStartAbilities,
    resolveUnitTurnEnd,
    resolveUnitTurnStart,
} from './combat/abilityTriggers';
import { buildElementDamageIndex } from './combat/damageCalculator';
import { previewImpact } from './combat/damagePreview';
import { reapDefeated } from './combat/defeatResolver';
import {
    changeResource,
    areSkillsPrevented,
    effectiveStats,
    isActionPrevented,
    preventedActionKinds,
    tickUnitEffects,
} from './combat/effectResolver';
import { recordTimelineSnapshot } from './combat/rewind';
import { resolveFightHour, timePhaseForHour } from './state/worldClock';
import { tickResourceRegen } from './combat/resourceRegen';
import { getEncounter, getAllEncounters } from './combat/encounterLoader';
import { lootChanceMultiplier, rollCombatLoot } from './combat/lootService';
import { isRangeAllowedFromLine } from './combat/positionRules';
import { legalTargetIds, validateTargetRule } from './combat/targetResolver';
import { advanceTurnIndex, planTurnOrder } from './combat/turnOrderService';
import { effectiveActionCost } from './combat/weaponEffects';
import { effectiveThresholds, resolveAiTuning } from './combat/ai/aiDifficulty';
import { instantiateUnit, loadUnitBlueprint, preloadAbilityBlueprints } from './combat/unitBlueprint';
import { equipCarriedWeapon, isWeaponUsable, resolveCarriedWeapon } from './combat/weaponLoadout';
import { getAllElementsDataService } from './elementService';
import { getCharacterData, getMobData } from './entityService';
import { getInventory } from './inventory/entityInventoryStore';
import { countAmmoUnits } from './inventory/ammoService';
import { canUseInCombat, useItemInCombat } from './inventory/inventoryCombatService';
import { getItemDefinition } from './inventory/itemService';
import { legalItemTargetIds } from './inventory/itemTargetResolver';
import type { InventoryErrorCode, ItemTargetRule } from '../types/InventoryType';
import type { WeaponAmmo } from '../types/WeaponType';
import type { Difficulty } from '../constants/DifficultyConstants';

interface CombatSession {
    state: CombatState;
    elementIndex: CombatElementIndex;
    random: CombatRandom;
    /**
     * Live inventories, keyed by unit id, for THIS fight.
     *
     * Scoped to the session rather than to the unit id: two sessions can hold units
     * with the same id (a remount, or two fights of the same roster), and a shared
     * map let one session's teardown wipe the other's items.
     */
    inventories: Map<string, Record<string, number>>;
    /** Loot table of every unit in the fight, keyed by unit id. */
    loot: Map<string, LootEntry[]>;
    /**
     * Whether the fight's inventories are flushed back to the entity store when it
     * ends. The Test Playground starts its fights with `false`: its entities are
     * called up for one battle, so their stock dies with the session.
     */
    persistInventories: boolean;
    /** How well the opponents play; read by `getCombatDecisionContext`. */
    difficulty: Difficulty;
}

const sessions = new Map<string, CombatSession>();
let sessionCounter = 0;

/** One item in the combat picker: what it is, how many, and who it hits. */
export interface CombatInventoryEntry {
    itemId: string;
    name: string;
    description: string;
    quantity: number;
    /** Whether the item can be used in combat at all; the picker dims the rest. */
    usable: boolean;
    /** Default target scope of the item. */
    target: ItemTargetRule;
    /** Unit ids the item may be aimed at; empty when it needs no target. */
    targetIds: string[];
}

/**
 * One carried weapon in the combat picker.
 *
 * A unit can carry several copies of the same weapon, each with its own durability,
 * so an entry is identified by its `index` in the unit's carried list, not by weapon id.
 */
export interface CombatWeaponEntry {
    /** Position in the unit's carried weapons; what a swap is addressed by. */
    index: number;
    weaponId: string;
    name: string;
    /** Remaining durability, or `null` when the weapon has none. */
    durability: number | null;
    maxDurability: number | null;
    indestructible: boolean;
    /** The swing's stats, as the HUD's attack card shows them. */
    power: number;
    accuracy: number;
    manaCost: number;
    staminaCost: number;
    /** The weapon the unit has in hand. */
    equipped: boolean;
    /** Whether it can be drawn. A broken weapon stays listed, but cannot be drawn. */
    usable: boolean;
}

/** Inventory error codes mapped onto the combat vocabulary. */
const ITEM_ERROR_TO_COMBAT_ERROR: Record<InventoryErrorCode, CombatErrorCode> = {
    item_not_found: 'item_not_found',
    insufficient_quantity: 'insufficient_quantity',
    item_not_usable_in_combat: 'item_not_usable_in_combat',
    item_not_usable_outside_combat: 'item_not_usable_outside_combat',
    inventory_full: 'inventory_full',
    invalid_quantity: 'invalid_quantity',
    entity_not_found: 'entity_not_found',
    target_required: 'target_required',
    invalid_target: 'target_invalid',
    no_target_available: 'target_invalid',
    max_stack_exceeded: 'inventory_full',
};

/**
 * Player-facing reasons for an unavailable action, keyed by error code.
 *
 * Exported because the HUD quotes the same sentence on a card it draws as disabled
 * (`combatBattleView`): the reason a card is out of reach must read the same whether it is
 * shown on the card or in the notice bar after a click.
 */
export const AVAILABILITY_MESSAGES: Partial<Record<CombatErrorCode, string>> = {
    action_on_cooldown: 'This action is still on cooldown.',
    insufficient_mana: 'Not enough mana.',
    insufficient_stamina: 'Not enough stamina.',
    out_of_ammo: 'No ammunition left.',
    out_of_range: 'This action cannot be used from this line.',
    target_invalid: 'There is nothing this action can hit.',
    not_implemented: 'This action is not available yet.',
};

/** The unit whose turn it is, or `null` when the order points at nobody. */
function currentUnit(state: CombatState): CombatUnit | null {
    return state.units.find((unit) => unit.id === state.order[state.turnIndex]) ?? null;
}

/** How much of its maximum health a unit still has, as a fraction. */
function hpFraction(unit: CombatUnit): number {
    const stats = effectiveStats(unit);
    return stats.maxHp > 0 ? unit.currentHp / stats.maxHp : 0;
}

function findUnit(state: CombatState, unitId: string): CombatUnit | null {
    return state.units.find((unit) => unit.id === unitId) ?? null;
}

/**
 * Whether an action can be taken right now, and why not when it cannot.
 *
 * Does not consider whose turn it is — {@link submitCombatAction} owns that.
 */
function actionAvailability(state: CombatState, actor: CombatUnit, action: CombatAction): CombatErrorCode | null {
    if (actor.status !== 'alive') return 'unit_not_found';
    if (!actor.isPlayerControlled && action.kind === 'flee') return 'action_unavailable';
    // A `silenced`-style status forbids the action outright; the reference schema
    // uses `attack` as the umbrella for the offensive kinds.
    if (isActionPrevented(action, preventedActionKinds(actor))) return 'action_unavailable';
    // A sealed unit may not use its skills, though it may still brace or rest.
    if (action.kind === 'skill' && areSkillsPrevented(actor)) return 'action_unavailable';
    if ((actor.cooldowns[action.id] ?? 0) > 0) return 'action_on_cooldown';

    // A ranged weapon with no rounds left cannot be fired (Fairy Bow).
    if (action.kind === 'weapon' && action.weapon?.ammo
        && (!actor.weapon || (actor.weapon.ammo ?? 0) <= 0)) {
        return 'out_of_ammo';
    }

    // A weapon can discount the cost (Staff of God: mana of aqua/lapis skills), so
    // affordability is judged on the effective cost the holder actually pays.
    const costs = effectiveActionCost(actor, action);
    if (actor.currentMana < costs.mana) return 'insufficient_mana';
    if (actor.currentStamina < costs.stamina) return 'insufficient_stamina';
    // A skill that costs blood cannot be paid for with more blood than there is:
    // the price would kill its own user.
    if (costs.hp > 0 && costs.hp >= actor.currentHp) return 'action_unavailable';
    if (!isRangeAllowedFromLine(action.range, actor.line)) return 'out_of_range';

    if (action.kind === 'switch_line') {
        const targetLine = actor.line === 'front' ? 'rear' : 'front';
        const targetLineCount = state.units.filter(
            (unit) => unit.side === actor.side && unit.line === targetLine,
        ).length;
        if (targetLineCount >= MAX_UNITS_PER_LINE) return 'action_unavailable';
        if (actor.line === 'front') {
            const frontCount = state.units.filter(
                (unit) => unit.side === actor.side && unit.line === 'front',
            ).length;
            if (frontCount <= 1) return 'action_unavailable';
        }
    }

    const needsTarget = action.targeting === 'enemy_one'
        || action.targeting === 'enemies_all'
        || action.targeting === 'both_teams';
    if (needsTarget && legalTargetIds(state, actor, action).length === 0) return 'target_invalid';

    return null;
}

/** Removes the action's resource costs and starts its cooldown. */
function payCosts(actor: CombatUnit, action: CombatAction): CombatEvent[] {
    const costs = effectiveActionCost(actor, action);
    const events: CombatEvent[] = [
        ...changeResource(actor, 'mana', -costs.mana),
        ...changeResource(actor, 'stamina', -costs.stamina),
    ];

    // A skill that costs health takes it from its own user.
    if (costs.hp > 0) events.push(...changeResource(actor, 'hp', -costs.hp));

    if (costs.cooldown > 0) actor.cooldowns[action.id] = costs.cooldown;
    return events;
}

/**
 * Opens a unit's own turn.
 *
 * The `defending` flag clears, action cooldowns tick, and timed effects expire —
 * which is where a status pays out its `damage_per_turn` and where
 * `on_status_removed` and `turn_start` abilities fire.
 */
function beginUnitTurn(state: CombatState, unit: CombatUnit, random: CombatRandom): CombatEvent[] {
    unit.defending = false;

    // The unit's own past is recorded before anything changes, so a rewind can
    // put it back here.
    recordTimelineSnapshot(unit);

    // Idle regen pays FIRST: a status that drains mana this same turn must not
    // also erase the streak the regen was just paid from.
    const events: CombatEvent[] = [...tickResourceRegen(unit)];

    for (const actionId of Object.keys(unit.cooldowns)) {
        const remaining = unit.cooldowns[actionId] - 1;
        if (remaining <= 0) delete unit.cooldowns[actionId];
        else unit.cooldowns[actionId] = remaining;
    }

    const ticked = tickUnitEffects(unit);
    events.push(...ticked);

    // One `on_status_removed` per status that wore off this turn.
    const removed = ticked.filter((event) => event.type === 'effect_expired').length;
    for (let index = 0; index < removed; index += 1) {
        events.push(...resolveAbilityEvent(state, unit, 'on_status_removed', passiveTriggerContext(random, state.units)));
    }

    events.push(...resolveUnitTurnStart(state, unit, random));
    return events;
}

/**
 * Moves the queue to the next unit that can actually act.
 *
 * A unit can be dropped by its own status damage the moment its turn begins, so
 * the reap runs inside the loop: a corpse never gets handed a turn.
 */
function advanceToNextUnit(
    state: CombatState,
    random: CombatRandom,
): { events: CombatEvent[]; unit: CombatUnit | null } {
    const events: CombatEvent[] = [];

    for (let guard = 0; guard < MAX_UNITS_PER_LINE * 4; guard += 1) {
        const advance = advanceTurnIndex(state);
        state.turnIndex = advance.turnIndex;
        state.round = advance.round;
        state.order = advance.order;
        state.turnGauges = advance.gauges;

        if (!advance.unit) return { events, unit: null };

        events.push(...beginUnitTurn(state, advance.unit, random));
        if (advance.unit.currentHp > 0) return { events, unit: advance.unit };

        reapDefeated(state, events, random);
    }

    return { events, unit: null };
}

function evaluateOutcome(state: CombatState): CombatOutcome | null {
    const alliesAlive = state.units.some((unit) => unit.side === 'allies' && unit.status === 'alive');
    const enemiesAlive = state.units.some((unit) => unit.side === 'enemies' && unit.status === 'alive');

    if (!alliesAlive) return 'defeat';
    if (!enemiesAlive) return 'victory';
    return null;
}

function outcomeReason(outcome: CombatOutcome): string {
    switch (outcome) {
        case 'victory':
            return 'Every enemy was defeated.';
        case 'defeat':
            return 'Every ally was defeated.';
        case 'fled':
            return 'The party escaped.';
    }
}

/** What building a roster produces: the units and the stock each was given. */
interface BuiltRoster {
    units: CombatUnit[];
    /**
     * Opening inventory per unit id, but only for members that declared one
     * (`CombatEncounterMember.inventory`). Members without an entry fall back to
     * the entity store when the fight starts.
     */
    inventories: Map<string, Record<string, number>>;
}

/** Loads every member's blueprint and builds the roster. */
async function buildUnits(encounter: CombatEncounter): Promise<CombatResult<BuiltRoster>> {
    const units: CombatUnit[] = [];
    const declaredInventories = new Map<string, Record<string, number>>();
    const groups: Array<{ side: CombatSide; members: CombatEncounterMember[] }> = [
        { side: 'allies', members: encounter.allies },
        { side: 'enemies', members: encounter.enemies },
    ];

    for (const { side, members } of groups) {
        const lineCounts: Record<CombatLine, number> = { front: 0, rear: 0 };

        for (const member of members) {
            if (lineCounts[member.line] >= MAX_UNITS_PER_LINE) {
                return combatFail(createCombatError(
                    'encounter_invalid',
                    `The ${side} ${member.line} line already holds ${MAX_UNITS_PER_LINE} units.`,
                    { encounterId: encounter.id, member },
                ));
            }

            // Blueprints resolve the entity's skills, weapon and abilities once,
            // and are cached, so a summon/transform can reuse the same projection.
            const blueprint = await loadUnitBlueprint(member.entityId, member.entityType);
            if (!blueprint) {
                return combatFail(createCombatError(
                    'encounter_invalid',
                    `Entity "${member.entityId}" (${member.entityType}) was not found.`,
                    { entityId: member.entityId, entityType: member.entityType },
                ));
            }

            const slot = lineCounts[member.line];
            lineCounts[member.line] += 1;

            const id = `${side}_${member.line}_${slot}_${member.entityId}`;
            if (member.inventory) {
                declaredInventories.set(id, { ...member.inventory });
            }

            // A declared loadout replaces the entity's own weapon; without one the
            // blueprint's default weapon is what the unit carries.
            let weapons: CarriedWeapon[] | undefined;
            if (member.weapons) {
                if (member.weapons.length > MAX_CARRIED_WEAPONS) {
                    return combatFail(createCombatError(
                        'encounter_invalid',
                        `A unit can carry at most ${MAX_CARRIED_WEAPONS} weapons.`,
                        { entityId: member.entityId, count: member.weapons.length },
                    ));
                }
                weapons = [];
                for (const weaponId of member.weapons) {
                    const carried = await resolveCarriedWeapon(weaponId);
                    if (!carried) {
                        return combatFail(createCombatError(
                            'encounter_invalid',
                            `Weapon "${weaponId}" was not found.`,
                            { weaponId, entityId: member.entityId },
                        ));
                    }
                    weapons.push(carried);
                }
            }

            units.push(instantiateUnit(blueprint, {
                id,
                side,
                line: member.line,
                slot,
                isPlayerControlled: member.isPlayerControlled ?? side === 'allies',
                name: member.name,
                hp: member.hp,
                weapons,
            }));
        }
    }

    if (units.length === 0) {
        return combatFail(createCombatError('encounter_invalid', 'The encounter has no members.', {
            encounterId: encounter.id,
        }));
    }

    return combatOk({ units, inventories: declaredInventories });
}

/**
 * Starts a fight from an encounter id (or a supplied definition) and returns its
 * opening state.
 */
export async function startCombat(
    encounterId: string,
    options: StartCombatOptions = {},
): Promise<CombatResult<CombatState>> {
    const encounter = options.encounter ?? await getEncounter(encounterId);
    if (!encounter) {
        return combatFail(createCombatError('encounter_not_found', `Encounter "${encounterId}" was not found.`, {
            encounterId,
        }));
    }

    const built = await buildUnits(encounter);
    if (!built.ok) return built;

    // A summon or transform resolves its target entity by id at trigger time and
    // must be synchronous, so the blueprints its abilities can reach are fetched
    // now, while the fight is still being set up.
    await preloadAbilityBlueprints(built.data.units);

    const elements = await getAllElementsDataService();
    const elementIndex = buildElementDamageIndex(elements);
    const units = built.data.units;

    const inventories = new Map<string, Record<string, number>>();
    const loot = new Map<string, LootEntry[]>();

    for (const unit of units) {
        const entity = await getEntityData(unit.entityId, unit.entityType);

        // What a unit opens the fight with: either the stock its encounter member
        // declared (the Test Playground declares it per fight), or the entity
        // store — the source of truth, with the entity YAML's `inventory` block as
        // only the initial fallback the first time an entity is seen. Either way
        // the session works on a private copy, which is written back to the store
        // when the fight ends and `persistInventories` allows it.
        const declared = built.data.inventories.get(unit.id);
        const stored = declared ?? getInventory(unit.entityId);
        if (!declared && entity?.inventory && Object.keys(stored).length === 0) {
            Object.assign(stored, entity.inventory);
        }
        inventories.set(unit.id, { ...stored });

        if (Array.isArray(entity?.loot) && entity.loot.length > 0) {
            loot.set(unit.id, entity.loot);
        }
        // Seed every ranged weapon's ammo from the items the entity carries, so a bow
        // with no arrows is honestly out of ammo rather than infinitely supplied.
        // Every item of the ammo's type counts (plain, iron, … arrows alike).
        for (const carried of unit.carriedWeapons) {
            const { ammoItem, ammoType } = carried.state;
            if (!ammoItem && !ammoType) continue;

            const ammo: WeaponAmmo = {
                item: ammoItem ?? undefined,
                item_type: ammoType ?? undefined,
            };
            carried.state.ammo = Math.max(0, countAmmoUnits(stored, ammo));
        }
    }

    sessionCounter += 1;
    const sessionId = `combat_${sessionCounter}`;
    const random = options.random ?? Math.random;

    // The hour of the day the fight happens at: the world clock's hour, unless
    // the fight (or the caller) says otherwise. The sun does not move while two
    // people are hitting each other, so the fight keeps this hour.
    const hour = resolveFightHour(options.hour);
    const timePhase = options.timePhase ?? encounter.timePhase ?? timePhaseForHour(hour);

    const state: CombatState = {
        sessionId,
        encounterId: encounter.id,
        encounterName: encounter.name,
        round: 1,
        turnIndex: 0,
        order: [],
        turnGauges: {},
        units,
        hour,
        timePhase,
        phase: 'active',
        outcome: null,
        log: [],
    };

    // `battle_start` abilities can summon or transform, so the turn queue is
    // planned AFTER they have run — otherwise a unit that joined at the opening
    // would sit out the whole first round.
    const opening: CombatEvent[] = [];
    opening.push(...resolveBattleStartAbilities(state, random));
    reapDefeated(state, opening, random);

    const plan = planTurnOrder(state.units);
    state.order = plan.order;
    state.turnGauges = plan.gauges;
    opening.unshift({ type: 'combat_started', round: 1, order: plan.order });

    const first = plan.order[0] ? findUnit(state, plan.order[0]) : null;
    if (first) opening.push({ type: 'turn_started', unitId: first.id, round: 1 });
    state.log.push(...opening);
    trimLog(state.log, MAX_LOG_ENTRIES);

    sessions.set(sessionId, {
        state,
        elementIndex,
        random,
        inventories,
        loot,
        persistInventories: options.persistInventories ?? true,
        difficulty: options.difficulty ?? 'normal',
    });
    return combatOk(state);
}

/** Returns the current fight state. */
export function getCombatState(sessionId: string): CombatResult<CombatState> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }
    return combatOk(session.state);
}

/**
 * Every action of a unit, tagged with usability and legal targets.
 *
 * Shared by the HUD (`getCombatActions`) and the AI
 * (`getCombatDecisionContext`), so both see the exact same list — the AI never
 * re-validates a rule the service already checked.
 */
function buildActionPreviews(state: CombatState, actor: CombatUnit): CombatActionPreview[] {
    return actor.actions
        .filter((action) => action.kind !== 'flee' || actor.isPlayerControlled)
        .map((action) => {
            const reason = actionAvailability(state, actor, action);
            return {
                action,
                usable: reason === null,
                reason,
                targetIds: reason === null ? legalTargetIds(state, actor, action) : [],
            };
        });
}

/**
 * Lists the actions of a unit with their usability and legal targets.
 *
 * Defaults to the active unit, which is what the HUD shows.
 */
export function getCombatActions(sessionId: string, unitId?: string): CombatResult<CombatActionPreview[]> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state } = session;
    const actor = unitId ? findUnit(state, unitId) : currentUnit(state);
    if (!actor) {
        return combatFail(createCombatError('unit_not_found', `Unit "${unitId ?? 'active'}" was not found.`, { unitId }));
    }

    return combatOk(buildActionPreviews(state, actor));
}

/** Lists the unit ids an action may be aimed at right now. */
export function getCombatTargets(
    sessionId: string,
    actionId: string,
    unitId?: string,
): CombatResult<string[]> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state } = session;
    const actor = unitId ? findUnit(state, unitId) : currentUnit(state);
    if (!actor) {
        return combatFail(createCombatError('unit_not_found', `Unit "${unitId ?? 'active'}" was not found.`, { unitId }));
    }

    const action = actor.actions.find((candidate) => candidate.id === actionId);
    if (!action) {
        return combatFail(createCombatError('action_not_found', `Action "${actionId}" is not known to this unit.`, {
            actionId,
            actorId: actor.id,
        }));
    }

    return combatOk(legalTargetIds(state, actor, action));
}

/**
 * Lists everything a unit carries, with their legal targets.
 *
 * Backs the combat item picker: one entry per item in stock — not only the
 * usable ones, so the player sees the whole bag. Items that cannot be used in
 * combat sort to the end, where the picker draws them dimmed.
 */
export function getCombatInventory(
    sessionId: string,
    unitId?: string,
): CombatResult<CombatInventoryEntry[]> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state } = session;
    const actor = unitId ? findUnit(state, unitId) : currentUnit(state);
    if (!actor) {
        return combatFail(createCombatError('unit_not_found', `Unit "${unitId ?? 'active'}" was not found.`, { unitId }));
    }

    const entries: CombatInventoryEntry[] = Object.entries(getUnitInventory(session, actor))
        .filter(([, quantity]) => quantity > 0)
        .flatMap(([itemId, quantity]) => {
            const item = getItemDefinition(itemId);
            if (!item) return [];

            const usable = canUseInCombat(item);
            return [{
                itemId,
                name: item.name,
                description: item.description,
                quantity,
                usable,
                target: item.target,
                targetIds: usable ? legalItemTargetIds(state, actor, item.target) : [],
            }];
        })
        // Usable items lead; the rest trail at the end. `sort` is stable, so
        // each group keeps the inventory's own order.
        .sort((a, b) => Number(b.usable) - Number(a.usable));

    return combatOk(entries);
}

/**
 * Lists every weapon a unit carries, equipped or not.
 *
 * Backs the weapon tab of the combat picker. Broken weapons stay in the list so
 * the player can see what they lost; they are just not drawable.
 */
export function getCombatWeapons(
    sessionId: string,
    unitId?: string,
): CombatResult<CombatWeaponEntry[]> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state } = session;
    const actor = unitId ? findUnit(state, unitId) : currentUnit(state);
    if (!actor) {
        return combatFail(createCombatError('unit_not_found', `Unit "${unitId ?? 'active'}" was not found.`, { unitId }));
    }

    return combatOk(actor.carriedWeapons.map((carried, index) => {
        // The swing is the weapon's own attack; a throw is a second action and is not shown.
        const swing = carried.actions.find((action) => action.weapon && !action.weapon.throw)
            ?? carried.actions[0];
        const costs = swing ? effectiveActionCost(actor, swing) : { mana: 0, stamina: 0, cooldown: 0 };

        return {
            index,
            weaponId: carried.weaponId,
            name: carried.state.name,
            durability: carried.state.durability,
            maxDurability: carried.state.maxDurability,
            indestructible: carried.state.indestructible,
            power: swing?.power ?? 0,
            accuracy: swing?.accuracy ?? 0,
            manaCost: costs.mana,
            staminaCost: costs.stamina,
            equipped: carried.state === actor.weapon,
            usable: isWeaponUsable(carried),
        };
    }));
}

/**
 * Switches the weapon the active unit has in hand.
 *
 * Costs no turn: the fight stays on the same unit, the swap is logged as a
 * `weapon_equipped` event, and the caller gets the refreshed state back. Only
 * player-controlled units can do it, on their own turn.
 */
export function submitWeaponSwitch(
    sessionId: string,
    index: number,
): CombatResult<CombatTurnResult> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state } = session;
    if (state.phase === 'finished') {
        return combatFail(createCombatError('session_finished', 'This fight is already over.', { sessionId }));
    }

    const actor = currentUnit(state);
    if (!actor) {
        return combatFail(createCombatError('unit_not_found', 'The fight has no active unit.', { sessionId }));
    }

    if (!actor.isPlayerControlled) {
        return combatFail(createCombatError('not_your_turn', 'Only the player can change weapon on this turn.', {
            actorId: actor.id,
        }));
    }

    const carried = actor.carriedWeapons[index];
    if (!carried) {
        return combatFail(createCombatError('weapon_not_found', `No weapon at position ${index} is carried by this unit.`, {
            index,
            actorId: actor.id,
        }));
    }

    if (carried.state === actor.weapon) {
        return combatFail(createCombatError('weapon_already_equipped', `"${carried.state.name}" is already in hand.`, {
            index,
            actorId: actor.id,
        }));
    }

    if (!isWeaponUsable(carried)) {
        return combatFail(createCombatError('weapon_broken', `"${carried.state.name}" is broken.`, {
            index,
            actorId: actor.id,
        }));
    }

    const previousWeaponId = actor.weapon?.id ?? null;
    equipCarriedWeapon(actor, carried);

    const events: CombatEvent[] = [{
        type: 'weapon_equipped',
        unitId: actor.id,
        weaponId: carried.weaponId,
        weaponName: carried.state.name,
        previousWeaponId,
    }];

    state.log.push(...events);
    trimLog(state.log, MAX_LOG_ENTRIES);

    return combatOk({ state, events, outcome: state.outcome });
}

/**
 * Everything the opponent AI needs to decide one turn.
 *
 * The session's `elementIndex` and `random` are module-private, so this seam is
 * what lets the decider (`services/combat/combatAi`) stay a pure function while
 * still reading the same maths and the same RNG stream the real fight uses. It
 * also folds the profile and the difficulty knobs in, so a consideration never
 * has to re-derive them.
 */
export function getCombatDecisionContext(
    sessionId: string,
    unitId?: string,
): CombatResult<AiDecisionContext> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state, elementIndex, random, difficulty } = session;
    const actor = unitId ? findUnit(state, unitId) : currentUnit(state);
    if (!actor) {
        return combatFail(createCombatError('unit_not_found', `Unit "${unitId ?? 'active'}" was not found.`, { unitId }));
    }

    const tuning = resolveAiTuning(difficulty);
    return combatOk({
        state,
        actor,
        previews: buildActionPreviews(state, actor),
        elementIndex,
        random,
        difficulty,
        profile: actor.aiProfile,
        tuning,
        thresholds: effectiveThresholds(actor.aiProfile, tuning),
    });
}

/**
 * What an action would do to one target, without rolling randomness.
 *
 * For the HUD's target preview, so it never advances the fight. Damage comes
 * whole from the damage chain; healing is the action's flat `heal`, which is
 * all the resolver pays out in one go.
 */
export function previewCombatDamage(
    sessionId: string,
    actorUnitId: string,
    actionId: string,
    targetUnitId: string,
): CombatResult<CombatActionImpact> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state, elementIndex, random } = session;
    const actor = findUnit(state, actorUnitId);
    const target = findUnit(state, targetUnitId);
    if (!actor || !target) {
        return combatFail(createCombatError('unit_not_found', 'Attacker or target was not found.', {
            actorUnitId,
            targetUnitId,
        }));
    }

    const action = actor.actions.find((candidate) => candidate.id === actionId);
    if (!action) {
        return combatFail(createCombatError('action_not_found', `Action "${actionId}" is not known to this unit.`, {
            actionId,
            actorId: actor.id,
        }));
    }

    // One preview chain for the whole game: `damagePreview` reads the same inputs
    // a real hit would use, minus the dice.
    return combatOk(previewImpact({
        actor,
        action,
        target,
        units: state.units,
        elementIndex,
        random,
        timePhase: state.timePhase,
        defenderHpFraction: hpFraction(target),
    }));
}

/**
 * Submits the active unit's action and advances the fight.
 *
 * The returned events are only the ones this step produced; `state.log` keeps
 * the whole fight.
 */
export function submitCombatAction(
    sessionId: string,
    request: CombatActionRequest,
): CombatResult<CombatTurnResult> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state, elementIndex, random } = session;
    if (state.phase === 'finished') {
        return combatFail(createCombatError('session_finished', 'This fight is already over.', { sessionId }));
    }

    const actor = currentUnit(state);
    if (!actor) {
        return combatFail(createCombatError('unit_not_found', 'The fight has no active unit.', { sessionId }));
    }

    const action = actor.actions.find((candidate) => candidate.id === request.actionId);
    if (!action) {
        return combatFail(createCombatError('action_not_found', `Action "${request.actionId}" is not known to this unit.`, {
            actionId: request.actionId,
            actorId: actor.id,
        }));
    }

    const availability = actionAvailability(state, actor, action);
    if (availability) {
        return combatFail(createCombatError(
            availability,
            AVAILABILITY_MESSAGES[availability] ?? 'This action cannot be used now.',
            { actionId: action.id, actorId: actor.id },
        ));
    }

    if (action.kind === 'inventory') {
        return submitInventoryAction(session, actor, request);
    }

    const validation = validateTargetRule(state, actor, action, request.targetId);
    if (validation.error) return combatFail(validation.error);

    const events: CombatEvent[] = payCosts(actor, action);
    const resolved = resolveCombatAction({
        state,
        actor,
        action,
        target: validation.target,
        elementIndex,
        random,
        // Ammo is spent against the actor's live inventory, so arrows shot in
        // this fight leave the quiver when it is flushed back to the store.
        unitInventory: getUnitInventory(session, actor),
    });
    events.push(...resolved.events);

    // The actor's own turn ends: its turn-scoped abilities bank the turn and may
    // fire (a soul transforms, a tree summons). A unit killed by its own action
    // (a reflection) does not get a turn end.
    if (!resolved.outcome && actor.status === 'alive') {
        events.push(...resolveUnitTurnEnd(state, actor, random));
    }

    const outcome = resolved.outcome ?? evaluateOutcome(state);
    events.push({ type: 'turn_ended', unitId: actor.id });

    if (outcome) {
        state.phase = 'finished';
        state.outcome = outcome;
        flushUnitInventoriesToStore(session);
        events.push({ type: 'combat_ended', outcome, reason: outcomeReason(outcome) });
        if (outcome === 'victory') events.push(...resolveLootOnVictory(state, random, session.loot));
    } else {
        const advance = advanceToNextUnit(state, random);
        events.push(...advance.events);
        if (advance.unit) {
            events.push({ type: 'turn_started', unitId: advance.unit.id, round: state.round });
        }
    }

    state.log.push(...events);
    trimLog(state.log, MAX_LOG_ENTRIES);

    return combatOk({ state, events, outcome: state.outcome });
}

/**
 * Submits an inventory action: uses an item from the actor's inventory.
 *
 * Items are consumed from the unit's inventory and their effects are applied
 * immediately. The turn ends after use.
 */
function submitInventoryAction(
    session: CombatSession,
    actor: CombatUnit,
    request: CombatActionRequest,
): CombatResult<CombatTurnResult> {
    const { state, random } = session;

    if (!request.itemId) {
        return combatFail(createCombatError('item_not_found', 'No item was specified.', {
            actorId: actor.id,
        }));
    }

    const unitInventory = getUnitInventory(session, actor);
    const itemUse = useItemInCombat(
        state,
        actor,
        unitInventory,
        { item_id: request.itemId, target_id: request.targetId },
        { elementIndex: session.elementIndex, random },
    );

    if (!itemUse.success) {
        const inventoryCode = itemUse.error?.code;
        return combatFail(createCombatError(
            inventoryCode ? ITEM_ERROR_TO_COMBAT_ERROR[inventoryCode] : 'item_not_usable',
            itemUse.error?.message ?? 'Item cannot be used.',
            { itemId: request.itemId, actorId: actor.id, reason: inventoryCode },
        ));
    }

    const events: CombatEvent[] = [
        {
            type: 'action_used',
            actorId: actor.id,
            actionId: 'inventory',
            actionName: itemUse.item_id,
            kind: 'inventory',
            targetIds: itemUse.target_id ? [itemUse.target_id] : [],
        },
        ...itemUse.events,
    ];

    if (actor.status === 'alive') {
        events.push(...resolveUnitTurnEnd(state, actor, random));
    }

    const outcome = evaluateOutcome(state);
    events.push({ type: 'turn_ended', unitId: actor.id });

    if (outcome) {
        state.phase = 'finished';
        state.outcome = outcome;
        flushUnitInventoriesToStore(session);
        events.push({ type: 'combat_ended', outcome, reason: outcomeReason(outcome) });
        if (outcome === 'victory') events.push(...resolveLootOnVictory(state, random, session.loot));
    } else {
        const advance = advanceToNextUnit(state, random);
        events.push(...advance.events);
        if (advance.unit) {
            events.push({ type: 'turn_started', unitId: advance.unit.id, round: state.round });
        }
    }

    state.log.push(...events);
    trimLog(state.log, MAX_LOG_ENTRIES);

    return combatOk({ state, events, outcome: state.outcome });
}

/** Gets a unit's live inventory within one session. */
function getUnitInventory(session: CombatSession, unit: CombatUnit): Record<string, number> {
    return session.inventories.get(unit.id) ?? {};
}

/**
 * Writes every unit's live inventory back to the store.
 *
 * Called whenever a fight ends — victory, defeat, flee or abandon — so items spent
 * during the fight (and any that were added) survive into the next one. The store
 * entry is mutated in place, so a reference taken earlier stays valid.
 *
 * Fights started with `persistInventories: false` skip this entirely: their
 * entities were called up for one battle, and what they carried dies with it.
 */
function flushUnitInventoriesToStore(session: CombatSession): void {
    if (!session.persistInventories) return;

    for (const unit of session.state.units) {
        const unitInventory = session.inventories.get(unit.id);
        if (!unitInventory) continue;

        const stored = getInventory(unit.entityId);
        for (const key of Object.keys(stored)) delete stored[key];
        Object.assign(stored, unitInventory);
    }
}

/**
 * Rolls the defeated enemies' loot when a fight ends in victory.
 *
 * The party's best loot bonus (King's Longsword) multiplies every chance, so the weapon a
 * survivor carries decides how generous the drop is.
 */
function resolveLootOnVictory(
    state: CombatState,
    random: CombatRandom,
    lootTables: Map<string, LootEntry[]>,
): CombatEvent[] {
    const defeated = state.units
        .filter((unit) => unit.side === 'enemies' && unit.status !== 'alive')
        .map((unit) => ({ unit, loot: lootTables.get(unit.id) ?? [] }))
        .filter((entry) => entry.loot.length > 0);

    if (defeated.length === 0) return [];
    return rollCombatLoot(defeated, lootChanceMultiplier(state.units), random);
}

async function getEntityData(entityId: string, entityType: 'character' | 'mob') {
    return entityType === 'mob' ? await getMobData(entityId) : await getCharacterData(entityId);
}

/** Abandons a fight and releases its session. */
export function endCombat(sessionId: string): CombatResult<CombatState> {
    const session = sessions.get(sessionId);
    if (!session) {
        return combatFail(createCombatError('session_not_found', `Session "${sessionId}" was not found.`, { sessionId }));
    }

    const { state } = session;
    state.phase = 'finished';
    flushUnitInventoriesToStore(session);
    sessions.delete(sessionId);
    return combatOk(state);
}

/** Releases every session (tests, returning to the title screen). */
export function clearCombatSessions(): void {
    for (const session of sessions.values()) {
        flushUnitInventoriesToStore(session);
    }

    sessions.clear();
    sessionCounter = 0;
}

/** Lists every authored encounter. */
export function listEncounters(): Promise<CombatEncounter[]> {
    return getAllEncounters();
}

/** Reads one authored encounter, or `null` when it does not exist. */
export function readEncounter(encounterId: string): Promise<CombatEncounter | null> {
    return getEncounter(encounterId);
}
