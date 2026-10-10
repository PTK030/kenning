use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize};
use std::time::Instant;

use kenning_core::{AddressKey, Kenning, Recognition};
use serde::Serialize;

/// What the corner badge shows.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Badge {
    Recognition { recognition: Box<Recognition> },
    Info { text: String },
}

/// The badge as the page receives it: content plus how long it stays, so
/// the countdown bar matches the real timer.
#[derive(Clone, Debug, Serialize)]
pub struct BadgeView {
    #[serde(flatten)]
    pub content: Badge,
    pub seconds: u64,
    pub sounds: bool,
}

pub struct AppState {
    pub kenning: Mutex<Kenning>,
    /// Watching is paused from the tray menu.
    pub paused: AtomicBool,
    pub badge: Mutex<Option<BadgeView>>,
    /// Incremented on every badge so an old timer never hides a newer badge.
    pub badge_generation: AtomicU64,
    pub lookalike: Mutex<Option<Recognition>>,
    /// Rotates the lookalike window's layout so it never looks routine.
    pub lookalike_variant: AtomicUsize,
    /// Last address seen on the clipboard. Apps often write the clipboard
    /// more than once per copy; the repeat must not count as a second copy.
    pub last_copy: Mutex<Option<(AddressKey, Instant)>>,
}

impl AppState {
    pub fn new(kenning: Kenning) -> Self {
        AppState {
            kenning: Mutex::new(kenning),
            paused: AtomicBool::new(false),
            badge: Mutex::new(None),
            badge_generation: AtomicU64::new(0),
            lookalike: Mutex::new(None),
            lookalike_variant: AtomicUsize::new(0),
            last_copy: Mutex::new(None),
        }
    }
}
