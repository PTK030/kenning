//! Updates. Kenning asks for the latest release's manifest when you press
//! "Check for updates" and, if you left that on in the onboarding (or turn
//! it on in Settings), when it starts and every 12 hours while it runs, as
//! Firefox does. It installs a new version only
//! when the download carries a valid signature from the release key in
//! `tauri.conf.json`; anything else is refused.
//!
//! The one request goes to `github.com` (the manifest of the latest
//! release of PTK030/kenning); installing downloads the installer from the
//! same release, which GitHub serves from its own download host.
//! It carries nothing of yours: no book, no clipboard, no identifier.

use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::state::AppState;

/// The hosts an update check and an install reach, for the privacy notes.
pub const HOSTS: &[(&str, &str)] = &[(
    "github.com",
    "The latest release's manifest when checking; the signed installer when you install, which GitHub serves from its own download host",
)];

/// A newer version than this one, as the release describes it.
#[derive(Clone, Debug, Serialize)]
pub struct Available {
    version: String,
    current: String,
    /// The release notes (the release's section of the changelog).
    notes: Option<String>,
    date: Option<String>,
}

/// The update found last, ready to install.
#[derive(Default)]
pub struct UpdateState {
    found: Mutex<Option<Update>>,
}

impl Available {
    pub fn version(&self) -> &str {
        &self.version
    }
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn describe(u: &Update) -> Available {
    Available {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone().filter(|b| !b.trim().is_empty()),
        date: u.date.map(|d| d.date().to_string()),
    }
}

/// Ask whether there is a newer version. The answer is kept for installing
/// and announced to the windows ("update") and the tray menu.
pub async fn check(app: &AppHandle) -> Result<Option<Available>, String> {
    let update = app
        .updater()
        .map_err(err)?
        .check()
        .await
        .map_err(|e| format!("Could not check for updates: {e}"))?;
    let info = update.as_ref().map(describe);
    *app.state::<UpdateState>().found.lock().unwrap() = update;
    let _ = app.emit("update", &info);
    crate::tray::refresh(app);
    Ok(info)
}

/// The newer version found by the last check, if any.
pub fn found(app: &AppHandle) -> Option<Available> {
    app.state::<UpdateState>().found.lock().unwrap().as_ref().map(describe)
}

/// Download the update found, verify its signature and install it. The
/// windows hear the progress as "update-progress" (bytes so far, total).
/// On Windows the installer closes Kenning and starts the new version.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let update = app
        .state::<UpdateState>()
        .found
        .lock()
        .unwrap()
        .clone()
        .ok_or("There is no update to install. Check again.")?;
    let mut done = 0u64;
    let progress = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk as u64;
                let _ = progress.emit("update-progress", (done, total));
            },
            || {},
        )
        .await
        .map_err(|e| format!("The update was not installed: {e}"))?;
    app.restart();
}

/// The automatic checks, for as long as Kenning runs: one shortly after it
/// starts (it starts with Windows, so that is after signing in, once the
/// network is up), then every 12 hours. The clock is the wall clock, so a
/// computer that slept for two days checks soon after it wakes. Each round
/// reads the setting again: turning it off stops the checks at once.
pub fn spawn_checks(app: AppHandle) {
    std::thread::spawn(move || {
        const EVERY: Duration = Duration::from_secs(12 * 60 * 60);
        // Offline at sign-in, or no release yet: ask again in an hour, not
        // on every round.
        const RETRY: Duration = Duration::from_secs(60 * 60);
        let mut next = SystemTime::now();
        std::thread::sleep(Duration::from_secs(15));
        loop {
            let on = app.state::<AppState>().kenning.lock().unwrap().config().update_check;
            if on && SystemTime::now() >= next {
                next = SystemTime::now()
                    + match tauri::async_runtime::block_on(check(&app)) {
                        Ok(_) => EVERY,
                        Err(e) => {
                            eprintln!("kenning: {e}");
                            RETRY
                        }
                    };
            }
            std::thread::sleep(Duration::from_secs(10 * 60));
        }
    });
}
