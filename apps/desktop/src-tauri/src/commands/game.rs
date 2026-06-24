use crate::game;

#[tauri::command]
pub fn get_initial_game_state(player_name: String) -> game::state::GameState {
    game::state::GameState {
        chapter: 1,
        location: "Ruinas de Eryndor".to_string(),
        player: game::state::Player {
            id: "hero-001".to_string(),
            name: player_name,
            level: 1,
            health: 100,
            max_health: 100,
        },
        active_event: Some(game::events::GameEvent {
            id: "evt-001".to_string(),
            title: "First Echo".to_string(),
            description: "An old memory calls your name from the stone corridor.".to_string(),
        }),
    }
}
