export interface Player {
  id: string;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
}

export interface GameState {
  chapter: number;
  location: string;
  player: Player;
  activeEvent?: GameEvent;
}
