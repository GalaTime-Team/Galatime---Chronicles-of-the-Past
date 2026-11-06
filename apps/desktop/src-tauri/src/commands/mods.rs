use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::paths;

/// Top-level folder under the game's user-data directory that holds every mod.
const MODS_DIR: &str = "mods";

/// Subfolder that holds dialogue overrides/additions.
const DIALOGUES_SUBDIR: &str = "dialogues";

fn mods_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = paths::user_data_dir(app)?.join(MODS_DIR);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    // Drop a short guide the first time the folder is created so players know
    // where to put their YAML files and which schema to follow.
    let readme = directory.join("README.txt");
    if !readme.exists() {
        let _ = fs::write(
            &readme,
            "Galatime mods\n\
             =============\n\
             \n\
             Drop YAML files into the subfolders below to override or add game\n\
             content. Files are read at runtime, so you only need to restart the\n\
             game (or reload the scene) after editing them.\n\
             \n\
             dialogues/  - Dialogue definitions (*.yaml / *.yml). A file whose\n\
             name matches an existing dialogue id overrides it; any other name\n\
             adds a new dialogue. See the built-in data/dialogues/*.yaml files\n\
             for the exact schema.\n\
             \n\
             Invalid files are skipped and logged; the game keeps running with\n\
             the built-in content.\n",
        );
    }

    Ok(directory)
}

fn dialogues_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = mods_dir(app)?.join(DIALOGUES_SUBDIR);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

/// Lists the dialogue ids provided by mods (file stems of `*.yaml`/`*.yml`).
#[tauri::command]
pub fn list_mod_dialogue_ids(app: AppHandle) -> Result<Vec<String>, String> {
    let directory = dialogues_dir(&app)?;
    let mut ids = Vec::new();

    if let Ok(entries) = fs::read_dir(&directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let is_yaml = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("yaml") || ext.eq_ignore_ascii_case("yml"))
                .unwrap_or(false);

            if is_yaml {
                if let Some(stem) = path.file_stem() {
                    ids.push(stem.to_string_lossy().to_string());
                }
            }
        }
    }

    ids.sort();
    Ok(ids)
}

/// Reads one mod dialogue as raw YAML text. Returns `None` when it does not exist.
#[tauri::command]
pub fn read_mod_dialogue(app: AppHandle, id: String) -> Result<Option<String>, String> {
    if id.is_empty()
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
        || id.contains(':')
    {
        return Err("Invalid dialogue id".to_string());
    }

    let directory = dialogues_dir(&app)?;
    for extension in ["yaml", "yml"] {
        let path = directory.join(format!("{id}.{extension}"));
        match fs::read_to_string(&path) {
            Ok(contents) => return Ok(Some(contents)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        }
    }

    Ok(None)
}

/// Opens the OS file explorer at the mods folder.
#[tauri::command]
pub fn reveal_mods_folder(app: AppHandle) -> Result<(), String> {
    let directory = mods_dir(&app)?;
    tauri_plugin_opener::open_path(&directory, None::<&str>).map_err(|error| error.to_string())
}