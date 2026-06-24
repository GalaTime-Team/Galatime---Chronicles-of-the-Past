export interface Player {
  id: string;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
}

export interface Item {
  id: string;
  name: string;
  quantity: number;
}

export interface GameState {
  currentChapter: number;
  player: Player;
  inventory: Item[];
}
