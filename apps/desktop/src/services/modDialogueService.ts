import { invoke } from '@tauri-apps/api/core';
import * as yaml from 'js-yaml';
import type { DialogueDefinition } from '../types/DialogueType';

/**
 * Reads dialogue content supplied by mods placed in the game's user-data
 * `mods/dialogues/` folder (desktop/Tauri builds only).
 *
 * In Vite/browser mode there is no Tauri bridge, so every call degrades to
 * "no mods available" and the built-in dialogues are used unchanged.
 */

const modDialogueCache: Map<string, DialogueDefinition> = new Map();
let modIdsCache: string[] | null = null;

function isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Lists the dialogue ids contributed by mods. Cached for the session. */
export async function listModDialogueIds(): Promise<string[]> {
    if (modIdsCache) {
        return modIdsCache;
    }
    if (!isTauri()) {
        modIdsCache = [];
        return modIdsCache;
    }
    try {
        const ids = await invoke<string[]>('list_mod_dialogue_ids');
        modIdsCache = ids;
        return ids;
    } catch {
        modIdsCache = [];
        return modIdsCache;
    }
}

/** Reads and parses one mod dialogue. Returns `null` when unavailable/invalid. */
export async function loadModDialogue(dialogueId: string): Promise<DialogueDefinition | null> {
    const cached = modDialogueCache.get(dialogueId);
    if (cached) {
        return cached;
    }
    if (!isTauri()) {
        return null;
    }
    try {
        const raw = await invoke<string | null>('read_mod_dialogue', { id: dialogueId });
        if (!raw) {
            return null;
        }
        const parsed = yaml.load(raw) as unknown as DialogueDefinition;
        if (!parsed) {
            return null;
        }
        modDialogueCache.set(dialogueId, parsed);
        return parsed;
    } catch (error) {
        console.error(`Error loading mod dialogue "${dialogueId}":`, error);
        return null;
    }
}

/** Drops all mod caches (useful after editing mods on disk). */
export function clearModDialogueCache(): void {
    modDialogueCache.clear();
    modIdsCache = null;
}

/** Opens the OS file explorer at the mods folder (desktop only). */
export async function revealModsFolder(): Promise<boolean> {
    if (!isTauri()) {
        return false;
    }
    try {
        await invoke('reveal_mods_folder');
        return true;
    } catch {
        return false;
    }
}