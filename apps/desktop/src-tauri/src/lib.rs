mod commands;
mod data;
mod game;
mod paths;
mod utils;

use std::path::PathBuf;
use tauri::{image::Image, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let icon_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/icon.png");
            let icon = Image::from_path(icon_path)?;

            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(icon)?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::game::get_initial_game_state,
            commands::saves::read_save,
            commands::saves::write_save,
            commands::saves::delete_save,
            commands::saves::reveal_saves_folder,
            commands::settings::read_settings,
            commands::settings::write_settings,
            commands::settings::reveal_settings_folder,
            commands::settings::exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
