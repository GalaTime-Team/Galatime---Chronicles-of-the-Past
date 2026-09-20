import { invoke } from '@tauri-apps/api/core';
import type { GameSettings } from '../context/GameContext';

const SETTINGS_STORAGE_KEY = 'galatime.settings.v1';

function readLocalSettings(): Partial<GameSettings> | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<GameSettings>) : null;
  } catch {
    return null;
  }
}

function writeLocalSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export async function loadSettings(): Promise<Partial<GameSettings> | null> {
  try {
    const contents = await invoke<string | null>('read_settings');
    if (contents) {
      return JSON.parse(contents) as Partial<GameSettings>;
    }
  } catch {
    // Vite/browser mode has no Tauri command bridge.
  }

  return readLocalSettings();
}

export async function saveSettings(settings: GameSettings): Promise<void> {
  try {
    await invoke('write_settings', { contents: JSON.stringify(settings) });
    return;
  } catch {
    // Fall back to localStorage in the browser and when the command is unavailable.
  }

  writeLocalSettings(settings);
}
