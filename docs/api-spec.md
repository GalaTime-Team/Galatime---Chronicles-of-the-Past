# IPC API Spec

## get_initial_game_state

- Command: get_initial_game_state
- Input:
  - playerName: string
- Output:
  - chapter: number
  - location: string
  - player:
    - id: string
    - name: string
    - level: number
    - health: number
    - maxHealth: number
  - activeEvent (optional):
    - id: string
    - title: string
    - description: string
