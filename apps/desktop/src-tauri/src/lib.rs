mod commands;
mod data;
mod game;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![commands::game::get_initial_game_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
