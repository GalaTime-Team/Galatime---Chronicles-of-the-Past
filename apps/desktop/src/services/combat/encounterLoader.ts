/**
 * Encounter catalogue loader.
 *
 * Reads the authored fights from `data/combat/encounters/*.yaml`. Like the other
 * content loaders this is raw YAML parsed with `js-yaml` and cached, so the
 * roster is validated once per session.
 */

import * as yaml from 'js-yaml';
import {
    type CombatEncounter,
    type CombatEncounterMember,
    type CombatEntityType,
    type CombatLine,
} from '../../types/CombatType';
import { asRecord, readString } from '../../utils/combatUtils';

const ENCOUNTERS_GLOB_PREFIX = '../../data/combat/encounters/';

type RawYamlLoader = Record<string, () => Promise<{ default: string }>>;

let encountersGlob: RawYamlLoader | null = null;
const encounterCache = new Map<string, CombatEncounter>();

async function initializeGlob(): Promise<void> {
    if (encountersGlob === null) {
        encountersGlob = import.meta.glob('../../data/combat/encounters/*.yaml', { query: '?raw' }) as RawYamlLoader;
    }
}

function normalizeLine(value: unknown): CombatLine {
    return readString(value, '') === 'rear' ? 'rear' : 'front';
}

function normalizeEntityType(value: unknown): CombatEntityType {
    return readString(value, '') === 'mob' ? 'mob' : 'character';
}

function normalizeMember(raw: unknown): CombatEncounterMember | null {
    const record = asRecord(raw);
    if (!record) return null;

    const entityId = readString(record.entity_id, '');
    if (!entityId) return null;

    const member: CombatEncounterMember = {
        entityId,
        entityType: normalizeEntityType(record.entity_type),
        line: normalizeLine(record.line),
    };

    const name = readString(record.name, '');
    if (name) member.name = name;

    if (typeof record.is_player_controlled === 'boolean') {
        member.isPlayerControlled = record.is_player_controlled;
    }

    if (typeof record.hp === 'number' && Number.isFinite(record.hp) && record.hp > 0) {
        member.hp = record.hp;
    }

    return member;
}

function normalizeMembers(raw: unknown): CombatEncounterMember[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(normalizeMember)
        .filter((member): member is CombatEncounterMember => member !== null);
}

function normalizeEncounter(raw: unknown, fallbackId: string): CombatEncounter | null {
    const record = asRecord(raw);
    if (!record) return null;

    const id = readString(record.id, fallbackId);
    const allies = normalizeMembers(record.allies);
    const enemies = normalizeMembers(record.enemies);
    if (allies.length === 0 && enemies.length === 0) return null;

    const encounter: CombatEncounter = {
        id,
        name: readString(record.name, id),
        allies,
        enemies,
    };

    const description = readString(record.description, '');
    if (description) encounter.description = description;

    return encounter;
}

/** Loads one encounter by id, or `null` when it does not exist. */
export async function getEncounter(encounterId: string): Promise<CombatEncounter | null> {
    if (encounterCache.has(encounterId)) return encounterCache.get(encounterId) ?? null;

    await initializeGlob();
    const loader = encountersGlob?.[`${ENCOUNTERS_GLOB_PREFIX}${encounterId}.yaml`];
    if (!loader) return null;

    try {
        const module = await loader();
        const encounter = normalizeEncounter(yaml.load(module.default), encounterId);
        if (!encounter) return null;
        encounterCache.set(encounterId, encounter);
        return encounter;
    } catch (error) {
        console.error(`Failed to load encounter "${encounterId}":`, error);
        return null;
    }
}

/** Loads every authored encounter, ordered by file name. */
export async function getAllEncounters(): Promise<CombatEncounter[]> {
    await initializeGlob();
    if (!encountersGlob) return [];

    const ids = Object.keys(encountersGlob)
        .map((path) => path.replace(ENCOUNTERS_GLOB_PREFIX, '').replace('.yaml', ''))
        .sort((a, b) => a.localeCompare(b));

    const encounters = await Promise.all(ids.map((id) => getEncounter(id)));
    return encounters.filter((encounter): encounter is CombatEncounter => encounter !== null);
}

/** Clears bundled-data caches for tests and development reloads. */
export function clearEncounterCache(): void {
    encounterCache.clear();
}
