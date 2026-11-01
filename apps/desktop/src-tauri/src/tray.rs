//! Tray icon and menu. The menu always states the two facts people ask
//! about first: whether Kenning uses the network, and how it reads the
//! clipboard. While watching is paused, the icon says so too.

use std::sync::atomic::Ordering;
use std::time::Duration;

use kenning_core::ClipboardMode;
use tauri::image::Image;
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::icon::{self, IconState};
use crate::state::AppState;
use crate::{flow, ui};

const TRAY_ID: &str = "kenning";
const ICON_SIZE: u32 = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tray {
    Rest,
    Recognized,
    Lookalike,
}

/// Watching the clipboard, but paused from the menu or the window.
fn paused(app: &AppHandle) -> bool {
    let st = app.state::<AppState>();
    let watch = st.kenning.lock().unwrap().config().clipboard == ClipboardMode::Watch;
    watch && st.paused.load(Ordering::SeqCst)
}

fn image(state: Tray, paused: bool) -> Image<'static> {
    let s = match state {
        Tray::Rest if paused => IconState::Paused,
        Tray::Rest => IconState::Rest,
        Tray::Recognized => IconState::Recognized,
        Tray::Lookalike => IconState::Lookalike,
    };
    Image::new_owned(icon::render(s, ICON_SIZE, ink()), ICON_SIZE, ICON_SIZE)
}

/// Icon colour matching the taskbar: graphite on a light taskbar, light on a
/// dark one (the Windows 11 default).
fn ink() -> [u8; 3] {
    if crate::platform::taskbar_is_light() {
        [0x16, 0x20, 0x2A]
    } else {
        [0xE6, 0xED, 0xF3]
    }
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(image(Tray::Rest, false))
        .tooltip("Kenning")
        .menu(&menu(app)?)
        .show_menu_on_left_click(true)
        .on_menu_event(on_menu)
        .build(app)?;
    Ok(())
}

/// Rebuild the menu after settings or pause state change, and the resting
/// icon with it (a lookalike on screen keeps its own).
pub fn refresh(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
    if app.state::<AppState>().lookalike.lock().unwrap().is_none() {
        set(app, Tray::Rest);
    }
}

pub fn set(app: &AppHandle, state: Tray) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_icon(Some(image(state, paused(app))));
    }
}

/// Pause or resume watching, from the menu or the main window, which is
/// told so it can show (or drop) its "Watching paused" card.
pub fn set_paused(app: &AppHandle, on: bool) {
    app.state::<AppState>().paused.store(on, Ordering::SeqCst);
    refresh(app);
    let _ = app.emit_to(ui::MAIN, "paused", on);
}

/// Filled dot for about a second, then back to rest (unless a lookalike is open).
pub fn flash(app: &AppHandle) {
    set(app, Tray::Recognized);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1100));
        let open_lookalike = app.state::<AppState>().lookalike.lock().unwrap().is_some();
        if !open_lookalike {
            set(&app, Tray::Rest);
        }
    });
}

fn menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let st = app.state::<AppState>();
    let (mode, shortcut) = {
        let k = st.kenning.lock().unwrap();
        (k.config().clipboard, k.config().shortcut.clone())
    };
    let paused = st.paused.load(Ordering::SeqCst);

    let clipboard_text = match (mode, paused) {
        (ClipboardMode::Watch, false) => "Clipboard: watched".to_owned(),
        (ClipboardMode::Watch, true) => "Clipboard: paused".to_owned(),
        (ClipboardMode::Shortcut, _) => format!("Clipboard: shortcut only ({shortcut})"),
    };
    let info = |id: &str, text: &str| MenuItem::with_id(app, id, text, false, None::<&str>);
    let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);

    let menu = Menu::new(app)?;
    // A newer version found: said first, since it is the one thing to do.
    if let Some(u) = crate::update::found(app) {
        menu.append(&item("update", &format!("Update to Kenning {}…", u.version()))?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    let network = st.kenning.lock().unwrap().config().network;
    menu.append(&item(
        "network",
        if network {
            "Network: on (turn off)"
        } else {
            "Network: off"
        },
    )?)?;
    menu.append(&info("clipboard", &clipboard_text)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&item("check", "Check clipboard now")?)?;
    if mode == ClipboardMode::Watch {
        menu.append(&item(
            "pause",
            if paused {
                "Resume watching"
            } else {
                "Pause watching"
            },
        )?)?;
    }
    menu.append(&item("book", "Address book…")?)?;
    menu.append(&item("journal", "Journal…")?)?;
    menu.append(&item("settings", "Settings…")?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&item("quit", "Quit Kenning")?)?;
    Ok(menu)
}

fn on_menu(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "check" => flow::on_shortcut(app),
        "network" => {
            let st = app.state::<AppState>();
            let on = !st.kenning.lock().unwrap().config().network;
            if on {
                // Turning the network on is a decision; explain it first.
                ui::open_main(app, "settings");
            } else {
                let mut config = st.kenning.lock().unwrap().config().clone();
                config.network = false;
                let _ = st.kenning.lock().unwrap().set_config(config);
                st.onchain.reset();
                refresh(app);
            }
        }
        "pause" => {
            let on = !app.state::<AppState>().paused.load(Ordering::SeqCst);
            set_paused(app, on);
        }
        "book" => ui::open_main(app, "book"),
        "journal" => ui::open_main(app, "journal"),
        "settings" => ui::open_main(app, "settings"),
        "update" => ui::open_main(app, "update"),
        "quit" => app.exit(0),
        _ => {}
    }
}
