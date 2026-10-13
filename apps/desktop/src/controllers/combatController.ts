/**
 * Combat API the rest of the app talks to.
 *
 * A thin facade over `services/combatService`, matching the endpoints described
 * in the development plan (`start`, `state`, `actions`, `targets`, `action`,
 * `end`) as plain functions instead of HTTP routes — the app runs the backend
 * in process.
 *
 * Every function returns a `CombatResult` rather than throwing, so callers
 * branch on a stable error code instead of catching exceptions.
 */

import {
    clearCombatSessions,
    endCombat,
    getCombatActions,
    getCombatDecisionContext,
    getCombatInventory,
    getCombatState,
    getCombatTargets,
    getCombatWeapons,
    listEncounters,
    readEncounter,
    startCombat,
    submitCombatAction,
    submitWeaponSwitch,
    type CombatInventoryEntry,
    type CombatWeaponEntry,
} from '../services/combatService';
import type { AiDecisionContext } from '../types/AiType';
import type {
    CombatActionPreview,
    CombatActionRequest,
    CombatEncounter,
    CombatResult,
    CombatState,
    CombatTurnResult,
    StartCombatOptions,
} from '../types/CombatType';

/** One usable item as the combat picker offers it. */
export type { CombatInventoryEntry, CombatWeaponEntry } from '../services/combatService';

/** Starts a fight from an authored encounter. */
export function startCombatEncounter(
    encounterId: string,
    options: StartCombatOptions = {},
): Promise<CombatResult<CombatState>> {
    return startCombat(encounterId, options);
}

/** Current state of a fight, including every unit and the turn order. */
export function fetchCombatState(sessionId: string): CombatResult<CombatState> {
    return getCombatState(sessionId);
}

/** The active unit's actions, with usability and legal targets. */
export function fetchCombatActions(sessionId: string, unitId?: string): CombatResult<CombatActionPreview[]> {
    return getCombatActions(sessionId, unitId);
}

/**
 * Everything the opponent AI needs to decide one turn.
 *
 * Bundles the unit's previews, the session's element index and RNG, and the
 * difficulty knobs, so the decider stays a pure function of this context.
 */
export function fetchCombatDecisionContext(
    sessionId: string,
    unitId?: string,
): CombatResult<AiDecisionContext> {
    return getCombatDecisionContext(sessionId, unitId);
}

/** Legal targets for one action. */
export function fetchCombatTargets(
    sessionId: string,
    actionId: string,
    unitId?: string,
): CombatResult<string[]> {
    return getCombatTargets(sessionId, actionId, unitId);
}

/** The items the active unit may use right now, with their legal targets. */
export function fetchCombatInventory(
    sessionId: string,
    unitId?: string,
): CombatResult<CombatInventoryEntry[]> {
    return getCombatInventory(sessionId, unitId);
}

/** The weapons the active unit carries, equipped or not. */
export function fetchCombatWeapons(
    sessionId: string,
    unitId?: string,
): CombatResult<CombatWeaponEntry[]> {
    return getCombatWeapons(sessionId, unitId);
}

/** Switches the weapon in hand. Costs no turn, so the fight stays on the same unit. */
export function takeCombatWeaponSwitch(
    sessionId: string,
    index: number,
): CombatResult<CombatTurnResult> {
    return submitWeaponSwitch(sessionId, index);
}

/** Submits the active unit's action and advances the fight. */
export function takeCombatAction(
    sessionId: string,
    request: CombatActionRequest,
): CombatResult<CombatTurnResult> {
    return submitCombatAction(sessionId, request);
}

/** Abandons a fight and releases its session. */
export function endCombatSession(sessionId: string): CombatResult<CombatState> {
    return endCombat(sessionId);
}

/** Lists every authored encounter. */
export function fetchCombatEncounters(): Promise<CombatEncounter[]> {
    return listEncounters();
}

/** Reads one authored encounter. */
export function fetchCombatEncounter(encounterId: string): Promise<CombatEncounter | null> {
    return readEncounter(encounterId);
}

/** Releases every fight session (tests, returning to the title screen). */
export function clearCombatSessionStore(): void {
    clearCombatSessions();
}
