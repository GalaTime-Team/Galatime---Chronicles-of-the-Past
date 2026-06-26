import { createContext, useContext, useState, ReactNode } from 'react';
import { Difficulty } from '../constants/DifficultyConstants';

interface GameState {
  settings: {
    difficulty: Difficulty;
    fightingTooltipVisible?: boolean;
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