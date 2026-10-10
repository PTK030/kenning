//! Windows: the corner badge, the lookalike window and the main window.

use std::sync::atomic::Ordering;
use std::time::Duration;

use kenning_core::Recognition;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::state::{AppState, Badge, BadgeView};
use crate::tray::{self, Tray};

pub const BADGE: &str = "badge";
pub const LOOKALIKE: &str = "lookalike";
pub const MAIN: &str = "main";

/// Logical size of the badge.
const BADGE_W: f64 = 400.0;
const BADGE_H: f64 = 128.0;
/// Gap between the badge and the screen edge / taskbar.
const BADGE_MARGIN: f64 = 12.0;

/// How long a hidden badge window is kept for reuse before it is closed.
/// Closing it lets the WebView2 processes exit, so Kenning at rest costs a
/// few megabytes instead of a browser's worth.
const BADGE_LINGER: Duration = Duration::from_secs(30);

/// Same WebView2 arguments for every window (windows share one browser
/// environment, which requires identical arguments): Tauri's defaults plus
/// autoplay, so the soft sounds play without a click first.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

fn window<'a>(app: &'a AppHandle, label: &str, url: &str) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .additional_browser_args(BROWSER_ARGS)
        .devtools(devtools())
}

/// Developer tools are off, so nobody pokes at the windows with "Inspect".
/// A debug build can still open them with `KENNING_DEVTOOLS=1`.
fn devtools() -> bool {
    cfg!(debug_assertions) && std::env::var_os("KENNING_DEVTOOLS").is_some()
}

/// Create the badge window, hidden. It shows itself once its page has loaded
/// and asked for the badge (see `commands::get_badge`), so it never flashes
/// an empty frame.
fn create_badge(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let w = window(app, BADGE, "badge.html")
        .title("Kenning")
        .inner_size(BADGE_W, BADGE_H)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // Never take focus: the user is in the middle of pasting.
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()?;
    crate::platform::disable_transitions(&w);
    Ok(w)
}

fn place_badge(app: &AppHandle, w: &WebviewWindow) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let x = area.position.x + area.size.width as i32 - ((BADGE_W + BADGE_MARGIN) * scale) as i32;
    let y = area.position.y + area.size.height as i32 - ((BADGE_H + BADGE_MARGIN) * scale) as i32;
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

/// Show the badge for `seconds`, then hide it unless a newer badge replaced it.
pub fn show_badge(app: &AppHandle, content: Badge, seconds: u64) {
    let st = app.state::<AppState>();
    let sounds = st.kenning.lock().unwrap().config().sounds;
    let view = BadgeView {
        content,
        seconds,
        sounds,
    };
    *st.badge.lock().unwrap() = Some(view.clone());

    match app.get_webview_window(BADGE) {
        Some(w) => {
            place_badge(app, &w);
            let _ = app.emit_to(BADGE, "badge", &view);
            let _ = w.show();
        }
        None => match create_badge(app) {
            Ok(w) => place_badge(app, &w),
            Err(e) => {
                eprintln!("kenning: badge window: {e}");
                return;
            }
        },
    }
    schedule_hide(app, Duration::from_secs(seconds));
}

/// Hide the badge after `after`, unless something newer happens first.
pub fn schedule_hide(app: &AppHandle, after: Duration) {
    let generation = app
        .state::<AppState>()
        .badge_generation
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(after);
        if current_generation(&app) == generation {
            hide_badge(&app);
        }
    });
}

/// The pointer is over the badge: stop the countdown.
pub fn pause_badge(app: &AppHandle) {
    app.state::<AppState>()
        .badge_generation
        .fetch_add(1, Ordering::SeqCst);
}

/// Called by the badge page once it has rendered.
pub fn badge_ready(app: &AppHandle) {
    if app.state::<AppState>().badge.lock().unwrap().is_some()
        && let Some(w) = app.get_webview_window(BADGE)
    {
        let _ = w.show();
    }
}

fn current_generation(app: &AppHandle) -> u64 {
    app.state::<AppState>().badge_generation.load(Ordering::SeqCst)
}

/// Fade out and hide the badge; close its window after a quiet spell.
/// A newer badge cancels both steps.
pub fn hide_badge(app: &AppHandle) {
    let Some(w) = app.get_webview_window(BADGE) else {
        return;
    };
    let generation = current_generation(app);
    let _ = app.emit_to(BADGE, "badge-hide", ());
    let app = app.clone();
    std::thread::spawn(move || {
        // Let the exit animation (240 ms, see badge.ts) finish before hiding.
        std::thread::sleep(Duration::from_millis(300));
        if current_generation(&app) != generation {
            return;
        }
        let _ = w.hide();
        *app.state::<AppState>().badge.lock().unwrap() = None;
        std::thread::sleep(BADGE_LINGER);
        if current_generation(&app) == generation {
            let _ = w.close();
        }
    });
}

/// Show the lookalike window. It stays until the user acts on it.
pub fn show_lookalike(app: &AppHandle, r: Recognition) {
    let st = app.state::<AppState>();
    st.lookalike_variant.fetch_add(1, Ordering::SeqCst);
    *st.lookalike.lock().unwrap() = Some(r);
    tray::set(app, Tray::Lookalike);

    if let Some(w) = app.get_webview_window(LOOKALIKE) {
        let _ = app.emit_to(LOOKALIKE, "lookalike", ());
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return;
    }
    // Sized to its content: on-chain lines add a row under each address.
    let network = st.kenning.lock().unwrap().config().network;
    let height = if network { 440.0 } else { 392.0 };
    let built = window(app, LOOKALIKE, "lookalike.html")
        .title("Kenning: not the address you know")
        .inner_size(640.0, height)
        // Kenning draws its own title bar (ui/src/titlebar.ts).
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .center()
        .focused(true)
        .build();
    if let Err(e) = built {
        eprintln!("kenning: lookalike window: {e}");
    }
}

pub fn close_lookalike(app: &AppHandle) {
    *app.state::<AppState>().lookalike.lock().unwrap() = None;
    tray::set(app, Tray::Rest);
    if let Some(w) = app.get_webview_window(LOOKALIKE) {
        let _ = w.close();
    }
}

/// Open (or focus) the main window on a given tab.
pub fn open_main(app: &AppHandle, tab: &str) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = app.emit_to(MAIN, "navigate", tab);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return;
    }
    let built = window(app, MAIN, &format!("index.html#{tab}"))
        .title("Kenning")
        .inner_size(880.0, 640.0)
        .decorations(false)
        // Small enough for a laptop beside other windows, large enough that
        // no step of the onboarding has to scroll.
        .min_inner_size(720.0, 600.0)
        .center()
        .build();
    if let Err(e) = built {
        eprintln!("kenning: main window: {e}");
    }
}
