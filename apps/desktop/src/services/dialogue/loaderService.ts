import * as yaml from 'js-yaml';
import type { DialogueDefinition } from '../../types/DialogueType';

/**
 * Locates and parses dialogue files.
 *
 * Follows the same lazy-glob pattern as `entityService`: files are discovered
 * at build time, read as raw text and parsed on first use, then cached. A
 * missing or malformed file returns `null` so the caller can report it as a
 * dialogue error instead of an exception escaping into the UI.
 */

/** Parsed dialogues, keyed by dialogue id. */
const dialogueCache: Map<string, DialogueDefinition> = new Map();

let dialoguesGlob: Record<string, () => Promise<{ default: string }>> | null = null;

const DIALOGUES_GLOB_PREFIX = '../../data/dialogues/';

/** Discovers the dialogue files once, on first load. */
async function initializeDialoguesGlob(): Promise<void> {
    if (dialoguesGlob === null) {
        dialoguesGlob = import.meta.glob(
            '../../data/dialogues/*.yaml',
            { query: '?raw' },
        ) as Record<string, () => Promise<{ default: string }>>;
    }
}

/**
 * Loads and parses one dialogue.
 *
 * Returns `null` when the file does not exist or cannot be parsed; the id is
 * derived from the file name, so a mismatch between the file name and the
 * declared `dialogue_id` is a validation concern, not a loading one.
 */
export async function loadDialogue(dialogueId: string): Promise<DialogueDefinition | null> {
    try {
        const cached = dialogueCache.get(dialogueId);
        if (cached) {
            return cached;
        }

        await initializeDialoguesGlob();

        if (!dialoguesGlob) {
            return null;
        }

        const loaderFn = dialoguesGlob[`${DIALOGUES_GLOB_PREFIX}${dialogueId}.yaml`];

        if (!loaderFn) {
            console.warn(`Dialogue file not found: ${dialogueId}`);
            return null;
        }

        const module = await loaderFn();
        const parsed = yaml.load(module.default as string) as unknown as DialogueDefinition;

        dialogueCache.set(dialogueId, parsed);
        return parsed;
    } catch (error) {
        console.error(`Error loading dialogue "${dialogueId}":`, error);
        return null;
    }
}

/** Every dialogue id available on disk. */
export async function listDialogueIds(): Promise<string[]> {
    await initializeDialoguesGlob();

    if (!dialoguesGlob) {
        return [];
    }

    return Object.keys(dialoguesGlob).map((path) =>
        path.replace(DIALOGUES_GLOB_PREFIX, '').replace('.yaml', ''),
    );
}

/**
 * Drops the parse cache.
 *
 * Only useful in tests that need a fresh read, or in tooling that edits a
 * dialogue while the dev server is running.
 */
export function clearDialogueCache(): void {
    dialogueCache.clear();
}
