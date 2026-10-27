//! The global shortcuts: one checks the clipboard on demand, the other
//! shows the details of the selected address.

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::flow;
use crate::state::AppState;

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let details = app
                .state::<AppState>()
                .kenning
                .lock()
                .unwrap()
                .config()
                .details_shortcut
                .clone();
            if details.parse::<Shortcut>().is_ok_and(|d| d == *shortcut) {
                flow::on_details_shortcut(app);
            } else {
                flow::on_shortcut(app);
            }
        })
        .build()
}

/// Replace whatever shortcuts are registered with `check` and `details`.
/// Registers every one it can and reports the first that failed.
pub fn register(app: &AppHandle, check: &str, details: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    let mut first_error = None;
    for shortcut in [check, details] {
        if let Err(e) = gs.register(shortcut) {
            first_error.get_or_insert(format!("could not register shortcut `{shortcut}`: {e}"));
        }
    }
    first_error.map_or(Ok(()), Err)
}
