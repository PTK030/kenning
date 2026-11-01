//! Kenning tray app. Know what you copied.

// No console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod commands;
mod flow;
mod guard;
mod hotkey;
mod icon;
mod onchain;
mod platform;
mod state;
mod tray;
mod ui;
mod update;

use kenning_core::Kenning;
use tauri::RunEvent;
use tauri_plugin_autostart::MacosLauncher;

use crate::state::AppState;

/// The Kenning directory. A development build keeps its own,
/// `~/.kenning-dev`, so trying things out never touches the real book;
/// `KENNING_HOME` still wins.
fn open() -> kenning_core::Result<Kenning> {
    if cfg!(debug_assertions) && std::env::var_os("KENNING_HOME").is_none_or(|v| v.is_empty()) {
        return Kenning::open_at(kenning_core::default_home()?.with_file_name(".kenning-dev"));
    }
    Kenning::open()
}

fn main() {
    let kenning = match open() {
        Ok(k) => k,
        Err(e) => {
            eprintln!("kenning: {e}");
            std::process::exit(1);
        }
    };
    let onboarded = kenning.config().onboarded;
    let shortcut = kenning.config().shortcut.clone();
    let details_shortcut = kenning.config().details_shortcut.clone();

    let app = tauri::Builder::default()
        // A second launch focuses the running instance instead of starting
        // a second clipboard watcher.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            ui::open_main(app, "book");
        }))
        .plugin(hotkey::plugin())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new(kenning))
        .manage(update::UpdateState::default())
        .invoke_handler(tauri::generate_handler![
            commands::overview,
            commands::get_badge,
            commands::hide_badge,
            commands::badge_pause,
            commands::badge_resume,
            commands::get_lookalike,
            commands::copy_correct,
            commands::mark_mine,
            commands::dismiss_lookalike,
            commands::get_details,
            commands::fit_details,
            commands::fit_lookalike,
            commands::close_details,
            commands::copy_details_address,
            commands::add_details_address,
            commands::open_explorer,
            commands::list_books,
            commands::recognize_text,
            commands::compare_addresses,
            commands::add_entry,
            commands::edit_entry,
            commands::rename_group,
            commands::remove_entry,
            commands::journal,
            commands::save_config,
            commands::finish_onboarding,
            commands::clear_history,
            commands::import_csv,
            commands::export_csv,
            commands::open_book_file,
            commands::reload,
            commands::open_main,
            commands::get_onchain,
            commands::lookup_onchain,
            commands::set_network,
            commands::guard_events,
            commands::run_clipboard_test,
            commands::guard_action,
            commands::update_check,
            commands::update_found,
            commands::update_install,
            commands::main_ready,
            commands::set_paused,
            commands::show_caught_file,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            sync_autostart(&handle);
            tray::create(&handle)?;
            if let Err(e) = hotkey::register(&handle, &shortcut, &details_shortcut) {
                eprintln!("kenning: {e}");
            }
            let (guard_handle, watcher_handle) = (handle.clone(), handle.clone());
            clipboard::spawn_watcher(
                move || guard::on_write(&guard_handle),
                move || flow::on_clipboard_change(&watcher_handle),
            );
            if !onboarded {
                ui::open_main(&handle, "welcome");
            }
            update::spawn_checks(handle.clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Kenning");

    app.run(|_app, event| {
        // A tray app keeps running when its windows close.
        if let RunEvent::ExitRequested { api, code, .. } = event
            && code.is_none()
        {
            api.prevent_exit();
        }
    });
}

/// "Start with Windows" lives in the registry (the installer's finish page
/// sets it too): the settings take what is really there, so the switch in
/// Settings and in the onboarding shows what Windows will do.
fn sync_autostart(app: &tauri::AppHandle) {
    use tauri::Manager;
    use tauri_plugin_autostart::ManagerExt as _;
    let Ok(on) = app.autolaunch().is_enabled() else {
        return;
    };
    let st = app.state::<state::AppState>();
    let mut k = st.kenning.lock().unwrap();
    if k.config().autostart != on {
        let mut config = k.config().clone();
        config.autostart = on;
        if let Err(e) = k.set_config(config) {
            eprintln!("kenning: autostart setting: {e}");
        }
    }
}
