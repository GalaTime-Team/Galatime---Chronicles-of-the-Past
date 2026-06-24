import { create } from "zustand";
import type { GameState } from "../types/game.types";

interface GameStore {
  gameState: GameState | null;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setGameState: (gameState: GameState) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  loading: false,
  setLoading: (loading) => set({ loading }),
  setGameState: (gameState) => set({ gameState }),
}));
