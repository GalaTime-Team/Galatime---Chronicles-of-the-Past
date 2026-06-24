import type { GameState } from "../types/game.types";
import { callCommand } from "./apiClient";

export async function getInitialGameState(playerName: string): Promise<GameState> {
  return callCommand<GameState>("get_initial_game_state", { playerName });
}
