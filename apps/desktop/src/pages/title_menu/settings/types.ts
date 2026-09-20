import type { GameSettings } from '../../../context/GameContext';

export type UpdateSettings = (patch: Partial<GameSettings>) => void;

export interface SettingsPanelProps {
  settings: GameSettings;
  updateSettings: UpdateSettings;
}
