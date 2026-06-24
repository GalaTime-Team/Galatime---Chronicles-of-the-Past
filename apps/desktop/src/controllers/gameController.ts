import { getInitialGameState } from "../services/gameService";
import { useGameStore } from "../stores/gameStore";

export async function startGame(playerName: string): Promise<void> {
  const state = await getInitialGameState(playerName);
  useGameStore.getState().setGameState(state);
}
