export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    title: 'game.difficulty.easy.label',
    description: 'game.difficulty.easy.description',
  },
  normal: {
    id: 'normal',
    title: 'game.difficulty.normal.label',
    description: 'game.difficulty.normal.description',
  },
  hard: {
    id: 'hard',
    title: 'game.difficulty.hard.label',
    description: 'game.difficulty.hard.description',
  },
  hardcore: {
    id: 'hardcore',
    title: 'game.difficulty.hardcore.label',
    description: 'game.difficulty.hardcore.description',
  },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;
export type DifficultyItem = typeof DIFFICULTIES[Difficulty];