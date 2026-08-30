import { createContext, useContext, useState, ReactNode } from 'react';
import { DEFAULT_AUDIO_VOLUMES, DEFAULT_MUSIC_TRACK_ID } from '../constants/AudioConstants';
import { Difficulty } from '../constants/DifficultyConstants';

interface GameState {
  settings: {
    difficulty: Difficulty;
    fightingTooltipVisible?: boolean;
    audio: {
      master: number;
      music: number;
      sfx: number;
      ambient: number;
    };
    currentMusicTrackId: string;
  },
  player?: {
    hp: { current: number; max: number };
    mana: { current: number; max: number };
    stamina: { current: number; max: number };
  };
}

interface GameContextType {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

const defaultState: GameState = {
  settings: {
    difficulty: 'normal' as Difficulty,
    fightingTooltipVisible: true,
    audio: DEFAULT_AUDIO_VOLUMES,
    currentMusicTrackId: DEFAULT_MUSIC_TRACK_ID,
  },
  player: {
    hp: { current: 800, max: 1000 },
    mana: { current: 400, max: 600 },
    stamina: { current: 500, max: 700 },
  },
};

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(defaultState);

  return (
    <GameContext.Provider value={{ gameState, setGameState }}>
      {children}
    </GameContext.Provider>
  );
}

// Custom hook for easy consumption
export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}