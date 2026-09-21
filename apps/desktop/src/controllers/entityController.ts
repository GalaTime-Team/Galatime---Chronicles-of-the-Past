import {
    getAllCharactersData,
    getAllMobsData,
    getCharacterData,
    getMobData,
} from "../services/entityService";
import type { CharacterData, MobData } from "../types/EntityDataType";

export async function fetchAllCharacters(): Promise<CharacterData[]> {
    return getAllCharactersData();
}

export async function fetchCharacter(id: string): Promise<CharacterData | null> {
    return getCharacterData(id);
}

export async function fetchAllMobs(): Promise<MobData[]> {
    return getAllMobsData();
}

export async function fetchMob(id: string): Promise<MobData | null> {
    return getMobData(id);
}
