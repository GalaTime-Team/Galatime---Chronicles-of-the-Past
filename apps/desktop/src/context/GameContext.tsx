import { createContext, useContext, useState, ReactNode } from 'react';
import { Difficulty } from '../constants/DifficultyConstants';

interface GameState {
  settings: {
    difficulty: Difficulty;
    fightingTooltipVisible?: boolean;
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
  },
  player: {
    hp: { current: 1000, max: 1000 },
    mana: { current: 500, max: 500 },
    stamina: { current: 700, max: 700 },
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