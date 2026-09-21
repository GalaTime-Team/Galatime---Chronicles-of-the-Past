//! Single source of truth for where the game keeps its user data on disk.
//!
//! Tauri's own `app_data_dir()` resolves to `<data_dir>/<bundle identifier>`, which would drop the
//! player's files into a folder named after the reverse-DNS identifier (`com.gabriel.galatime`).
//! That identifier is the right *identity* for the installer, code signing and the OS uninstall
//! entry — but it is not how games lay their files out on disk. Games conventionally use a
//! publisher folder that groups every title from the same studio, with the game's display name
//! underneath:
//!
//! ```text
//! Windows:  %APPDATA%\GT\Galatime - Chronicles of the Past\
//! macOS:    ~/Library/Application Support/GT/Galatime - Chronicles of the Past/
//! Linux:    ~/.local/share/GT/Galatime - Chronicles of the Past/
//! ```
//!
//! The bundle identifier in `tauri.conf.json` is therefore left untouched: only the data directory
//! is overridden here, so the `GT` folder is free to host future games alongside this one.
//!
//! Roaming data is used (rather than local data) because settings and save games are small and
//! are exactly the kind of thing a player expects to follow their profile between machines.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Publisher-level folder that groups every GT game's user data.
pub const PUBLISHER_DIR: &str = "GT";

/// Resolves — and creates — the game's user-data directory: `<publisher>/<game name>`.
///
/// The game name comes from `productName` in `tauri.conf.json`, so renaming the game there renames
/// the folder too; there is no second place to keep in sync.
pub fn user_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().data_dir().map_err(|error| error.to_string())?;
    let directory = root.join(PUBLISHER_DIR).join(&app.package_info().name);

    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    Ok(directory)
}

/// The pre-`GT` layout, kept around only so existing installs can be migrated once.
pub fn legacy_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}
