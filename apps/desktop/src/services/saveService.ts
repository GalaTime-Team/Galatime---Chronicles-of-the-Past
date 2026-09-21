import { invoke } from '@tauri-apps/api/core';

export const SAVE_SLOTS = [1, 2, 3, 4, 5] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

const localKey = (slot: SaveSlot) => `galatime.save.${slot}`;

const HARD_CODED_SAVE = {
  name: 'Name',
  elements: 'Elements',
  money: 'Money',
  mainObjective: 'Main objective',
};

function readLocalSave(slot: SaveSlot): string | null {
  try {
    return window.localStorage.getItem(localKey(slot));
  } catch {
    return null;
  }
}

export async function hasSave(slot: SaveSlot): Promise<boolean> {
  try {
    return (await invoke<string | null>('read_save', { slot })) !== null;
  } catch {
    return readLocalSave(slot) !== null;
  }
}

export async function createSave(slot: SaveSlot): Promise<void> {
  const contents = JSON.stringify(HARD_CODED_SAVE);
  try {
    await invoke('write_save', { slot, contents });
    return;
  } catch {
    try {
      window.localStorage.setItem(localKey(slot), contents);
    } catch {
      // Browser storage can be unavailable in restricted preview contexts.
    }
  }
}

export async function deleteSave(slot: SaveSlot): Promise<void> {
  try {
    await invoke('delete_save', { slot });
    return;
  } catch {
    try {
      window.localStorage.removeItem(localKey(slot));
    } catch {
      // Browser storage can be unavailable in restricted preview contexts.
    }
  }
}

/**
 * Opens the OS file explorer at the folder that stores the save files.
 * Returns `false` when there is no Tauri bridge (Vite/browser mode).
 */
export async function revealSavesFolder(): Promise<boolean> {
  try {
    await invoke('reveal_saves_folder');
    return true;
  } catch {
    return false;
  }
}
