use std::fs;

use tauri::{AppHandle, Manager};

fn settings_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = settings_dir(app)?;
    Ok(directory.join("settings.json"))
}

/// Migrates the legacy `settings.txt` → `settings.json` if no `.json` file exists yet.
fn migrate_legacy_settings(app: &AppHandle) -> Result<(), String> {
    let directory = settings_dir(app)?;
    let json_path = directory.join("settings.json");
    let txt_path = directory.join("settings.txt");

    if json_path.exists() || !txt_path.exists() {
        return Ok(());
    }

    // Move the old file to the new location.
    fs::rename(&txt_path, &json_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> Result<Option<String>, String> {
    // Ensure any pre-existing .txt file is moved to .json before reading.
    migrate_legacy_settings(&app)?;

    let path = settings_path(&app)?;
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn write_settings(app: AppHandle, contents: String) -> Result<(), String> {
    let path = settings_path(&app)?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}
