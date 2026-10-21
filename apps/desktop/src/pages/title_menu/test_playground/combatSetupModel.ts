/**
 * Setup model for the Test Playground's combat tab.
 *
 * The tab does not ship a hardcoded fight: the player fills one slot per roster
 * position on both sides and marks which of those characters they play. This
 * module owns the shape of that setup and the projection from it onto a
 * `CombatEncounter`, so the setup screen and the panel stay free of combat
 * plumbing.
 *
 * The projection is only a *description* of the fight. `CombatEncounter` runs it
 * and `services/combatService` builds the units, so nothing here duplicates how a
 * combatant is put together.
 */

import { MAX_UNITS_PER_LINE } from '../../../constants/CombatConstants';
import { getEntityImages } from '../../../services/entityImageService';
import { fetchAllCharacters, fetchAllMobs } from '../../../controllers/entityController';
import type { CharacterData, MobData } from '../../../types/EntityDataType';
import type { EntityInventoryState } from '../../../types/InventoryType';
import type {
    CombatEncounter,
    CombatEncounterMember,
    CombatEntityType,
    CombatLine,
    CombatSide,
    CombatUnit,
} from '../../../types/CombatType';

/** Sides of a fight, in the order the setup lays them out. */
export const SETUP_SIDES: readonly CombatSide[] = ['allies', 'enemies'];

/** Battle lines, in the order the setup lays them out. */
export const SETUP_LINES: readonly CombatLine[] = ['front', 'rear'];

/** Slots drawn per line. Mirrors the formation board, which is what caps a fight. */
export const SLOTS_PER_LINE = MAX_UNITS_PER_LINE;

/** One catalogue entity as the picker offers it. */
export interface CatalogueEntity {
    entityId: string;
    entityType: CombatEntityType;
    /** Name the UI shows; characters carry their surname, mobs their own name. */
    name: string;
    spriteUrl?: string;
    data: CharacterData | MobData;
}

/** A filled roster position. */
export interface SetupSlot {
    entityId: string;
    entityType: CombatEntityType;
    /**
     * Set by the control mark: the player plays this character themselves.
     *
     * Everything unmarked belongs to the computer, which is what makes the battle
     * screen drop its action HUD while they act.
     */
    controlled: boolean;
    /**
     * What the character carries into this one fight, item id to quantity.
     *
     * Declared here rather than read from a store: playground entities are called
     * up for a single battle, so their stock is whatever the setup says and it
     * lives only as long as the fight does.
     */
    inventory: EntityInventoryState;
    /**
     * Catalogue weapon ids the character carries into this fight; the first is equipped.
     *
     * `null` means the setup has not touched it: the character fights with its own
     * weapon, exactly as the entity defines it.
     */
    weapons: string[] | null;
}

/** One line of one side: a fixed row of positions, empty ones included. */
export type SetupLine = Array<SetupSlot | null>;

/** Both lines of one side. */
export type SetupLanes = Record<CombatLine, SetupLine>;

/** The whole setup: both sides, each with its front and rear rows. */
export type CombatSetup = Record<CombatSide, SetupLanes>;

/** Key a catalogue entry is indexed by, so a slot can look its entity up again. */
export function catalogueKey(entityType: CombatEntityType, entityId: string): string {
    return `${entityType}:${entityId}`;
}

/** A setup with every position empty. */
export function createEmptySetup(): CombatSetup {
    const emptyLine = (): SetupLine => Array.from({ length: SLOTS_PER_LINE }, () => null);

    return {
        allies: { front: emptyLine(), rear: emptyLine() },
        enemies: { front: emptyLine(), rear: emptyLine() },
    };
}

/** Rewrites one position, keeping the rest of the setup untouched. */
function updateSlot(
    setup: CombatSetup,
    side: CombatSide,
    line: CombatLine,
    index: number,
    update: (slot: SetupSlot | null) => SetupSlot | null,
): CombatSetup {
    return {
        ...setup,
        [side]: {
            ...setup[side],
            [line]: setup[side][line].map((slot, position) => (position === index ? update(slot) : slot)),
        },
    };
}

/** The character standing in a position, or `null` when it is empty. */
export function slotAt(
    setup: CombatSetup,
    side: CombatSide,
    line: CombatLine,
    index: number,
): SetupSlot | null {
    return setup[side][line][index] ?? null;
}

/** Places an entity in a position. New picks start unmarked and empty-handed. */
export function fillSlot(
    setup: CombatSetup,
    side: CombatSide,
    line: CombatLine,
    index: number,
    entity: CatalogueEntity,
): CombatSetup {
    const slot: SetupSlot = {
        entityId: entity.entityId,
        entityType: entity.entityType,
        controlled: false,
        inventory: {},
        weapons: null,
    };

    return updateSlot(setup, side, line, index, () => slot);
}

/**
 * The weapon ids a position's character would carry if the player changed nothing:
 * the entity's own catalogue weapon, when it has one.
 */
export function defaultWeaponIds(entity: CatalogueEntity): string[] {
    const weapon = entity.data.weapon;
    return typeof weapon === 'string' ? [weapon] : [];
}

/** Rewrites which weapons the character in a position carries. */
export function setSlotWeapons(
    setup: CombatSetup,
    side: CombatSide,
    line: CombatLine,
    index: number,
    weapons: string[],
): CombatSetup {
    return updateSlot(setup, side, line, index, (slot) => (
        slot ? { ...slot, weapons: [...weapons] } : slot
    ));
}

/** Empties a position. */
export function clearSlot(
    setup: CombatSetup,
    side: CombatSide,
    line: CombatLine,
    index: number,
): CombatSetup {
    return updateSlot(setup, side, line, index, () => null);
}

/** Flips the control mark: the player takes the character over, or lets it go. */
export function toggleControlled(
    setup: CombatSetup,
    side: CombatSide,
    line: CombatLine,
    index: number,
): CombatSetup {
    return updateSlot(setup, side, line, index, (slot) => (
        slot ? { ...slot, controlled: !slot.controlled } : slot
    ));
}

/** Rewrites what the character in a position carries into the fight. */
export function setSlotInventory(
    setup: CombatSetup,
    side: CombatSide,
    line: CombatLine,
    index: number,
    inventory: EntityInventoryState,
): CombatSetup {
    return updateSlot(setup, side, line, index, (slot) => (
        slot ? { ...slot, inventory: { ...inventory } } : slot
    ));
}

/** Filled positions on one side, front and rear together. */
export function countSide(setup: CombatSetup, side: CombatSide): number {
    return SETUP_LINES.reduce(
        (total, line) => total + setup[side][line].filter((slot) => slot !== null).length,
        0,
    );
}

/** Whether the setup can be fought: both sides need at least one character. */
export function isSetupValid(setup: CombatSetup): boolean {
    return SETUP_SIDES.every((side) => countSide(setup, side) > 0);
}

/** Folds a name down to letters and digits so ids and labels compare alike. */
function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Catalogue entries matching a typed id or name. An empty query browses everything. */
export function filterCatalogue(
    catalogue: readonly CatalogueEntity[],
    query: string,
    limit = 40,
): CatalogueEntity[] {
    const needle = normalize(query);
    const matches = needle === ''
        ? catalogue
        : catalogue.filter((entry) => (
            normalize(entry.entityId).includes(needle) || normalize(entry.name).includes(needle)
        ));

    return matches.slice(0, limit);
}

/**
 * Sprite a combat unit is drawn with, resolved from the bundled sprite index.
 *
 * The sprite is chosen based on the unit's side: allies (left) face right, enemies (right)
 * face left. Characters use sprites from their `combat/` subfolder, mobs use sprites from
 * their root folder. Falls back to any sprite in the `combat` folder when the exact
 * facing sprite doesn't exist, and finally to the first available sprite (usually
 * `tsp/neutral.png`) when the entity has no combat sprites at all.
 */
export function resolveUnitSprite(unit: CombatUnit): string | undefined {
    const images = getEntityImages({ type: unit.entityType, id: unit.entityId, name: unit.name });
    const facing = unit.side === 'allies' ? 'right' : 'left';

    const byFacing = images.find((image) => image.name.includes(facing));
    if (byFacing) return byFacing.url;

    return images.find((image) => image.url.includes('/combat/'))?.url ?? images[0]?.url;
}

/** Reads the whole entity catalogue — characters and mobs — ready for the picker. */
export async function loadEntityCatalogue(): Promise<CatalogueEntity[]> {
    const [characters, mobs] = await Promise.all([fetchAllCharacters(), fetchAllMobs()]);

    const entries: CatalogueEntity[] = [
        ...characters.map((character) => ({
            entityId: character.id,
            entityType: 'character' as const,
            name: [character.name, character.surname].filter(Boolean).join(' '),
            spriteUrl: getEntityImages({ type: 'character', id: character.id, name: character.name })[0]?.url,
            data: character,
        })),
        ...mobs.map((mob) => ({
            entityId: mob.id,
            entityType: 'mob' as const,
            name: mob.name,
            spriteUrl: getEntityImages({ type: 'mob', id: mob.id, name: mob.name })[0]?.url,
            data: mob,
        })),
    ];

    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Projects a setup onto an authored encounter.
 *
 * Positions are compacted per line, so a line with a hole in the middle still
 * deploys without a gap — the same numbering `services/combatService.buildUnits`
 * uses when it turns members into units.
 */
export function buildEncounter(setup: CombatSetup, encounterName: string): CombatEncounter {
    const roster = (side: CombatSide): CombatEncounterMember[] => SETUP_LINES.flatMap((line) => (
        setup[side][line]
            .filter((slot): slot is SetupSlot => slot !== null)
            .map((slot) => ({
                entityId: slot.entityId,
                entityType: slot.entityType,
                line,
                isPlayerControlled: slot.controlled,
                inventory: { ...slot.inventory },
                ...(slot.weapons ? { weapons: [...slot.weapons] } : {}),
            }))
    ));

    return {
        id: 'playground',
        name: encounterName,
        allies: roster('allies'),
        enemies: roster('enemies'),
    };
}
