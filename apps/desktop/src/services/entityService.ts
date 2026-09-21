import * as yaml from "js-yaml";
import type { CharacterData, MobData } from "../types/EntityDataType";

const characterCache: Map<string, CharacterData> = new Map();
const mobCache: Map<string, MobData> = new Map();
let charactersGlob: Record<string, () => Promise<{ default: string }>> | null = null;
let mobsGlob: Record<string, () => Promise<{ default: string }>> | null = null;

async function initializeCharactersGlob() {
    if (charactersGlob === null) {
        charactersGlob = import.meta.glob(
            "../data/entities/characters/*.yaml",
            { query: '?raw' }
        ) as Record<string, () => Promise<{ default: string }>>;
    }
}

async function initializeMobsGlob() {
    if (mobsGlob === null) {
        mobsGlob = import.meta.glob(
            "../data/entities/mobs/*.yaml",
            { query: '?raw' }
        ) as Record<string, () => Promise<{ default: string }>>;
    }
}

export async function getCharacterData(characterId: string): Promise<CharacterData | null> {
    try {
        if (characterCache.has(characterId)) {
            return characterCache.get(characterId) ?? null;
        }

        await initializeCharactersGlob();

        if (!charactersGlob) return null;

        const globPath = `../data/entities/characters/${characterId}.yaml`;
        const loaderFn = charactersGlob[globPath];

        if (!loaderFn) {
            console.warn(`Character file not found: ${characterId}`);
            return null;
        }

        const module = await loaderFn();
        const content = module.default as string;
        const parsed = yaml.load(content) as unknown as CharacterData;

        characterCache.set(characterId, parsed);
        return parsed;
    } catch (error) {
        console.error(`Error loading character data for ${characterId}:`, error);
        return null;
    }
}

export async function getAllCharactersData(): Promise<CharacterData[]> {
    await initializeCharactersGlob();

    if (!charactersGlob) return [];

    const allIds = Object.keys(charactersGlob).map(path =>
        path.replace("../data/entities/characters/", "").replace(".yaml", "").replace("?raw", "")
    );

    const characters = await Promise.all(allIds.map(id => getCharacterData(id)));
    return characters.filter((c): c is CharacterData => c !== null);
}

export async function getMobData(mobId: string): Promise<MobData | null> {
    try {
        if (mobCache.has(mobId)) {
            return mobCache.get(mobId) ?? null;
        }

        await initializeMobsGlob();

        if (!mobsGlob) return null;

        const globPath = `../data/entities/mobs/${mobId}.yaml`;
        const loaderFn = mobsGlob[globPath];

        if (!loaderFn) {
            console.warn(`Mob file not found: ${mobId}`);
            return null;
        }

        const module = await loaderFn();
        const content = module.default as string;
        const parsed = yaml.load(content) as unknown as MobData;

        mobCache.set(mobId, parsed);
        return parsed;
    } catch (error) {
        console.error(`Error loading mob data for ${mobId}:`, error);
        return null;
    }
}

export async function getAllMobsData(): Promise<MobData[]> {
    await initializeMobsGlob();

    if (!mobsGlob) return [];

    const allIds = Object.keys(mobsGlob).map(path =>
        path.replace("../data/entities/mobs/", "").replace(".yaml", "").replace("?raw", "")
    );

    const mobs = await Promise.all(allIds.map(id => getMobData(id)));
    return mobs.filter((m): m is MobData => m !== null);
}
