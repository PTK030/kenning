//! What happens when something is copied or the shortcut is pressed.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use kenning_core::journal::Action;
use kenning_core::{ClipboardMode, Recognition, State, extract};
use tauri::{AppHandle, Emitter, Manager};

use crate::clipboard::{self, Content, Source};
use crate::state::{AppState, Badge, DetailsView};
use crate::ui;
use crate::{onchain, tray};

/// A clipboard change in watch mode. Silent unless the clipboard holds
/// exactly one address.
pub fn on_clipboard_change(app: &AppHandle) {
    let st = app.state::<AppState>();
    if st.paused.load(Ordering::SeqCst) {
        return;
    }
    if st.quiet_until.lock().unwrap().is_some_and(|t| Instant::now() < t) {
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
    let _ = app.emit_to(crate::ui::MAIN, "shortcut", "check");
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

/// The details shortcut: copy the selection in the focused app (or use the
/// clipboard when nothing is selected) and show everything known about the
/// address in it, in the middle of the screen. Nothing is added to history:
/// selecting is not copying.
pub fn on_details_shortcut(app: &AppHandle) {
    let _ = app.emit_to(crate::ui::MAIN, "shortcut", "details");
    let st = app.state::<AppState>();
    // A second press while the first is still copying would save the
    // selection as "the old clipboard" and put that back instead.
    if st.grabbing.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    // Waiting for the shortcut's keys to come up must not hold the event loop.
    std::thread::spawn(move || {
        let st = app.state::<AppState>();
        *st.quiet_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(3));
        let (content, source) = clipboard::read_selection();
        *st.quiet_until.lock().unwrap() = Some(Instant::now() + Duration::from_millis(400));
        st.grabbing.store(false, Ordering::SeqCst);
        show_details_for(&app, content, source);
    });
}

fn show_details_for(app: &AppHandle, content: Content, source: Source) {
    let none = match source {
        Source::Selection | Source::Book => "No address in the selection.",
        Source::Clipboard => "Nothing selected, and no address on the clipboard.",
    };
    let text = match content {
        Content::Text(t) => t,
        Content::Private => {
            return info(app, "Skipped: the app that copied this marked it private.");
        }
        Content::Nothing => return info(app, none),
    };
    let address =
        extract::single(&text).or_else(|| extract::extract(&text).into_iter().next().map(|f| f.address));
    drop(text);
    let Some(address) = address else {
        return info(app, none);
    };

    let st = app.state::<AppState>();
    let result = {
        let k = st.kenning.lock().unwrap();
        let r = k.recognize(&address);
        let action = if r.state == State::Lookalike {
            Action::LookalikeShown
        } else {
            Action::Checked
        };
        k.journal(action, &r).map(|()| (r, k.config().network))
    };
    let (r, network) = match result {
        Ok(found) => found,
        Err(e) => return info(app, &format!("Could not check: {e}")),
    };
    // A lookalike gets its warning window: the details are all there, with
    // the fix one key away.
    if r.state == State::Lookalike {
        return present(app, r);
    }
    let lookup = lookup_targets(&r);
    ui::hide_badge(app);
    ui::show_details(
        app,
        DetailsView {
            recognition: r,
            source,
            network,
        },
    );
    onchain::spawn_lookup(app, lookup);
}

/// A row of the address book was clicked: show its details. Browsing your
/// own book is not a check, so nothing goes into the journal.
pub fn show_book_details(app: &AppHandle, address: kenning_core::Address) {
    let st = app.state::<AppState>();
    let (r, network) = {
        let k = st.kenning.lock().unwrap();
        (k.recognize(&address), k.config().network)
    };
    let lookup = lookup_targets(&r);
    ui::show_details(
        app,
        DetailsView {
            recognition: r,
            source: Source::Book,
            network,
        },
    );
    onchain::spawn_lookup(app, lookup);
}

/// The addresses whose on-chain facts a window about `r` shows.
fn lookup_targets(r: &Recognition) -> Vec<kenning_core::Address> {
    let mut lookup = vec![r.address.clone()];
    if let Some(m) = &r.lookalike {
        lookup.push(m.known.clone());
    }
    lookup
}

/// Route a recognition to the right surface: lookalikes get a window,
/// everything else a quiet badge.
pub fn present(app: &AppHandle, r: Recognition) {
    // On-chain facts (when the network is on) fill in after the window shows.
    let lookup = lookup_targets(&r);
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
