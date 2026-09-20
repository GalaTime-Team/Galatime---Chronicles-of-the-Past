import { invoke } from '@tauri-apps/api/core';
import type { GameSettings } from '../context/GameContext';

const SETTINGS_STORAGE_KEY = 'galatime.settings.v1';

/**
 * Picks only the fields that belong to the current `GameSettings` interface,
 * discarding any legacy/unknown properties that may have leaked into the
 * persisted JSON (e.g. from older builds that saved extra data).
 */
function pickSettings(raw: GameSettings): GameSettings {
  return {
    saveName: raw.saveName,
    difficulty: raw.difficulty,
    fightingTooltipVisible: raw.fightingTooltipVisible,
    actionsTooltipVisible: raw.actionsTooltipVisible,
    showNowPlayingMusic: raw.showNowPlayingMusic,
    audio: { ...raw.audio },
    currentMusicTrackId: raw.currentMusicTrackId,
    controls: raw.controls,
    display: { ...raw.display },
    language: raw.language,
  };
}

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
  const safe = pickSettings(settings);
  try {
    await invoke('write_settings', { contents: JSON.stringify(safe) });
    return;
  } catch {
    // Fall back to localStorage in the browser and when the command is unavailable.
  }

  writeLocalSettings(safe);
}
