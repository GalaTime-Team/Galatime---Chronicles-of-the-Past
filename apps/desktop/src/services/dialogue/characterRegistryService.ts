import type { CharacterData } from '../../types/EntityDataType';
import { getCharacterData } from '../entityService';

/**
 * Resolves the permanent data of the characters a dialogue mentions.
 *
 * The dialogue file only ever stores a `character_id`; everything the player
 * sees (display name, and later sprites, voice and animations) is resolved
 * here, so a conversation never duplicates character data.
 *
 * Character files are read asynchronously, but the effect pipeline is
 * synchronous. `primeCharacterRegistry` therefore loads everything a dialogue
 * references up front, after which lookups are synchronous. An id that could
 * not be resolved is remembered as missing, so a dialogue that mentions an
 * unauthored character warns once instead of hitting the disk on every step.
 */

/** A character resolved for display. */
export interface ResolvedCharacter {
    id: string;
    /** Name to show in the dialogue box. */
    display_name: string;
    surname: string | null;
    /** Name and surname together, for menus and history panels. */
    full_name: string;
    /** The underlying entity record, for systems that need more than a name. */
    data: CharacterData;
}

const resolvedCharacters: Map<string, ResolvedCharacter> = new Map();
const missingCharacters: Set<string> = new Set();

/**
 * Loads every character a dialogue references.
 *
 * Ids already resolved or already known to be missing are skipped, so priming
 * the same dialogue twice costs nothing.
 */
export async function primeCharacterRegistry(characterIds: Iterable<string>): Promise<void> {
    const pending = [...new Set(characterIds)].filter(
        (id) => id.length > 0 && !resolvedCharacters.has(id) && !missingCharacters.has(id),
    );

    await Promise.all(pending.map(async (id) => {
        const data = await getCharacterData(id);

        if (!data) {
            missingCharacters.add(id);
            return;
        }

        resolvedCharacters.set(id, {
            id,
            display_name: data.name,
            surname: data.surname ?? null,
            full_name: `${data.name} ${data.surname ?? ''}`.trim(),
            data,
        });
    }));
}

/**
 * Whether the character is in the catalogue.
 *
 * Synchronous by design: it answers from the primed cache. Call
 * `primeCharacterRegistry` first.
 */
export function isKnownCharacter(characterId: string): boolean {
    return resolvedCharacters.has(characterId);
}

/** Display data for a character, or `null` when it was not resolved. */
export function resolveCharacter(characterId: string): ResolvedCharacter | null {
    return resolvedCharacters.get(characterId) ?? null;
}

/** Ids that were successfully resolved. */
export function getKnownCharacterIds(): string[] {
    return [...resolvedCharacters.keys()];
}

/** Drops the resolution cache. Intended for tests and tooling. */
export function clearCharacterRegistry(): void {
    resolvedCharacters.clear();
    missingCharacters.clear();
}
