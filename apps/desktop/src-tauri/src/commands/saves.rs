use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::paths;

/// Folder under the game's user-data directory that holds every save slot.
///
/// Saves get their own subfolder so the data directory root stays tidy and save games are never
/// mixed in with `settings.json`.
const SAVES_DIR: &str = "saves";

/// Resolves — and creates — the folder that holds the save slots.
fn saves_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = paths::user_data_dir(app)?.join(SAVES_DIR);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    Ok(directory)
}

fn save_path(app: &AppHandle, slot: u8) -> Result<PathBuf, String> {
    if !(1..=5).contains(&slot) {
        return Err("Save slot must be between 1 and 5".to_string());
    }

    Ok(saves_dir(app)?.join(format!("save_{slot}.json")))
}

/// Migrates saves written by older builds, which sat in the root of the user-data directory next
/// to `settings.json`.
///
/// Slots are moved one at a time so an interrupted migration can only ever leave a slot pending
/// rather than lose it — the next run simply repeats it. A file already in `saves/` wins: it is
/// either the copy from an earlier migration or a newer save written after the move.
fn migrate_root_saves(app: &AppHandle) -> Result<(), String> {
    let directory = saves_dir(app)?;
    let root = paths::user_data_dir(app)?;

    for slot in 1..=5u8 {
        let source = root.join(format!("save_{slot}.json"));

        if !source.is_file() {
            continue;
        }

        let destination = directory.join(format!("save_{slot}.json"));

        if !destination.exists() {
            fs::copy(&source, &destination).map_err(|error| error.to_string())?;
        }

        // Best effort — a locked file only means the stale copy stays behind for the next run.
        let _ = fs::remove_file(&source);
    }

    Ok(())
}

#[tauri::command]
pub fn read_save(app: AppHandle, slot: u8) -> Result<Option<String>, String> {
    // Bring saves across from the pre-`saves/` layout first, otherwise a returning player would
    // look like they had no save games at all.
    migrate_root_saves(&app)?;

    match fs::read_to_string(save_path(&app, slot)?) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn write_save(app: AppHandle, slot: u8, contents: String) -> Result<(), String> {
    fs::write(save_path(&app, slot)?, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_save(app: AppHandle, slot: u8) -> Result<(), String> {
    let path = save_path(&app, slot)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// Opens the OS file explorer at the `saves` folder, pre-selecting `save_<slot>.json` when it
/// exists. Opens the plain folder on a first run.
#[tauri::command]
pub fn reveal_saves_folder(app: AppHandle) -> Result<(), String> {
    migrate_root_saves(&app)?;

    let directory = saves_dir(&app)?;
    let path = directory.join("save_1.json");

    if path.exists() {
        tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|error| error.to_string())
    } else {
        tauri_plugin_opener::open_path(&directory, None::<&str>).map_err(|error| error.to_string())
    }
}
