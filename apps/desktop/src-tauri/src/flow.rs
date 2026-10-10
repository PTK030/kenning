//! What happens when something is copied or the shortcut is pressed.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use kenning_core::journal::Action;
use kenning_core::{ClipboardMode, Recognition, State, extract};
use tauri::{AppHandle, Emitter, Manager};

use crate::clipboard::{self, Content};
use crate::state::{AppState, Badge};
use crate::ui;
use crate::{onchain, tray};

/// A clipboard change in watch mode. Silent unless the clipboard holds
/// exactly one address.
pub fn on_clipboard_change(app: &AppHandle) {
    let st = app.state::<AppState>();
    if st.paused.load(Ordering::SeqCst) {
        return;
    }
    if st.kenning.lock().unwrap().config().clipboard != ClipboardMode::Watch {
        return;
    }
    let Content::Text(text) = clipboard::read() else {
        return;
    };
    let Some(address) = extract::single(&text) else {
        return;
    };
    drop(text);
    if is_repeat(&st, &address) {
        return;
    }

    let result = st.kenning.lock().unwrap().observe(&address);
    match result {
        Ok(r) => present(app, r),
        Err(e) => eprintln!("kenning: {e}"),
    }
}

/// Whether this is the same copy notified twice.
fn is_repeat(st: &AppState, address: &kenning_core::Address) -> bool {
    const WINDOW: Duration = Duration::from_secs(1);
    let key = address.key();
    let mut last = st.last_copy.lock().unwrap();
    let repeat = last
        .as_ref()
        .is_some_and(|(k, at)| *k == key && at.elapsed() < WINDOW);
    *last = Some((key, Instant::now()));
    repeat
}

/// The global shortcut (or "Check clipboard now"): always answers, even
/// when there is nothing to recognise.
pub fn on_shortcut(app: &AppHandle) {
    let _ = app.emit_to(crate::ui::MAIN, "shortcut", ());
    let text = match clipboard::read() {
        Content::Text(t) => t,
        Content::Private => {
            return info(app, "Skipped: the app that copied this marked it private.");
        }
        Content::Nothing => return info(app, "No address on the clipboard."),
    };
    let address =
        extract::single(&text).or_else(|| extract::extract(&text).into_iter().next().map(|f| f.address));
    drop(text);
    let Some(address) = address else {
        return info(app, "No address on the clipboard.");
    };

    let st = app.state::<AppState>();
    let result = {
        let mut k = st.kenning.lock().unwrap();
        k.observe(&address).and_then(|r| {
            if r.state != State::Lookalike {
                k.journal(Action::Checked, &r)?;
            }
            Ok(r)
        })
    };
    match result {
        Ok(r) => present(app, r),
        Err(e) => info(app, &format!("Could not check: {e}")),
    }
}

/// Route a recognition to the right surface: lookalikes get a window,
/// everything else a quiet badge.
pub fn present(app: &AppHandle, r: Recognition) {
    // On-chain facts (when the network is on) fill in after the window shows.
    let mut lookup = vec![r.address.clone()];
    if let Some(m) = &r.lookalike {
        lookup.push(m.known.clone());
    }
    if r.state == State::Lookalike {
        ui::hide_badge(app);
        ui::show_lookalike(app, r);
    } else {
        let seconds = badge_seconds(app, r.state);
        ui::show_badge(
            app,
            Badge::Recognition {
                recognition: Box::new(r),
            },
            seconds,
        );
        tray::flash(app);
    }
    onchain::spawn_lookup(app, lookup);
}

pub fn info(app: &AppHandle, text: &str) {
    let seconds = badge_seconds(app, State::Mine);
    ui::show_badge(
        app,
        Badge::Info {
            text: text.to_owned(),
        },
        seconds,
    );
}

fn badge_seconds(app: &AppHandle, state: State) -> u64 {
    let base = app
        .state::<AppState>()
        .kenning
        .lock()
        .unwrap()
        .config()
        .badge_seconds as u64;
    // A new address stays longer: it is the one worth a second look.
    if state == State::New { base + 4 } else { base }
}
