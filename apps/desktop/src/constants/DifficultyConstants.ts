export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    title: 'game.settings.difficulty.easy.label',
    description: 'game.settings.difficulty.easy.description',
  },
  normal: {
    id: 'normal',
    title: 'game.settings.difficulty.normal.label',
    description: 'game.settings.difficulty.normal.description',
  },
  hard: {
    id: 'hard',
    title: 'game.settings.difficulty.hard.label',
    description: 'game.settings.difficulty.hard.description',
  },
  hardcore: {
    id: 'hardcore',
    title: 'game.settings.difficulty.hardcore.label',
    description: 'game.settings.difficulty.hardcore.description',
  },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;
export type DifficultyItem = typeof DIFFICULTIES[Difficulty];