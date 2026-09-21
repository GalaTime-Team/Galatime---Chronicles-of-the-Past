use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::paths;

fn settings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    paths::user_data_dir(app)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = settings_dir(app)?;
    Ok(directory.join("settings.json"))
}

/// Migrates user data written by older builds, which lived in the folder named after the bundle
/// identifier (`com.gabriel.galatime`) instead of the `GT/<game>` layout.
///
/// Files are copied first and only removed from the old folder once the copy is safely on disk, so
/// an interrupted migration can never lose the player's settings — the next run simply repeats it.
/// The old folder is then removed only when it ends up empty (`remove_dir` refuses to touch a
/// non-empty folder), which keeps anything unexpected on disk from being deleted silently.
fn migrate_legacy_data_dir(app: &AppHandle) -> Result<(), String> {
    let target = settings_dir(app)?;
    let legacy = paths::legacy_data_dir(app)?;

    if legacy == target || !legacy.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(&legacy).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source = entry.path();

        if !source.is_file() {
            continue;
        }

        let destination = target.join(entry.file_name());
        // A file already at the destination wins: it is either the copy from an earlier
        // migration or a newer one written after the move.
        if !destination.exists() {
            fs::copy(&source, &destination).map_err(|error| error.to_string())?;
        }

        // Best effort — a locked file only means the folder stays around for the next run.
        let _ = fs::remove_file(&source);
    }

    // Best effort: succeeds only when nothing was left behind.
    let _ = fs::remove_dir(&legacy);

    Ok(())
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
    // Bring data across from the pre-`GT` folder first, otherwise a returning player would look
    // like they had lost every setting.
    migrate_legacy_data_dir(&app)?;
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

/// Opens the OS file explorer at the folder that holds `settings.json`, pre-selecting the
/// file when it already exists. On a first run there is nothing to select yet, so the plain
/// folder is opened instead.
#[tauri::command]
pub fn reveal_settings_folder(app: AppHandle) -> Result<(), String> {
    let directory = settings_dir(&app)?;
    let path = directory.join("settings.json");

    if path.exists() {
        tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|error| error.to_string())
    } else {
        tauri_plugin_opener::open_path(&directory, None::<&str>).map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}
