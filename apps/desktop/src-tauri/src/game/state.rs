use serde::{Deserialize, Serialize};

use crate::game::events::GameEvent;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: String,
    pub name: String,
    pub level: u32,
    pub health: u32,
    pub max_health: u32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub chapter: u32,
    pub location: String,
    pub player: Player,
    pub active_event: Option<GameEvent>,
}
