use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct GameEvent {
    pub id: String,
    pub title: String,
    pub description: String,
}
