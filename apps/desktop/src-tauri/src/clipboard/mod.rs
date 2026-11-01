//! Clipboard access. Only this module touches the clipboard, and only the
//! Rust side: the web UI has no clipboard permission.
//!
//! * Text longer than [`MAX_TEXT`] is ignored (addresses are short).
//! * Content that the copying app marked as private (password managers) is
//!   ignored before it is read.
//! * Nothing read here is stored; callers keep only validated addresses.
//! * The details shortcut borrows the clipboard to copy the selection, and
//!   puts back what was there (see [`read_selection`]).

#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::{
    clear, read, read_selection, read_within, restore, save, seq, spawn_watcher, write, write_hidden,
};

use serde::Serialize;

/// Longest clipboard text Kenning will look at.
pub const MAX_TEXT: usize = 4096;

#[derive(Debug, PartialEq, Eq)]
pub enum Content {
    Text(String),
    /// The copying app asked clipboard tools to ignore this content.
    Private,
    /// Empty, not text, or too long.
    Nothing,
}

/// One write, as the clipboard guard sees it.
pub struct Snapshot {
    pub seq: Option<u32>,
    /// The process whose window wrote it, if a window did.
    pub owner: Option<u32>,
    pub content: Content,
}

/// Where the details window got its address.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    /// Copied from the selection in the focused app.
    Selection,
    /// Nothing was selected (or the app did not copy it): the clipboard.
    Clipboard,
}

// Other platforms come later; these stubs keep the crate compiling there.
#[cfg(not(windows))]
pub fn read() -> Content {
    Content::Nothing
}

#[cfg(not(windows))]
pub fn read_within(_timeout: std::time::Duration) -> Option<Snapshot> {
    None
}

#[cfg(not(windows))]
pub fn write(_text: &str) -> Result<(), String> {
    Err("clipboard is not supported on this platform yet".into())
}

#[cfg(not(windows))]
pub fn read_selection() -> (Content, Source) {
    (Content::Nothing, Source::Clipboard)
}

#[cfg(not(windows))]
pub fn spawn_watcher(_on_write: impl Fn() + Send + 'static, _on_change: impl Fn() + Send + 'static) {}

#[cfg(not(windows))]
pub type Saved = ();

#[cfg(not(windows))]
pub fn seq() -> Option<u32> {
    None
}

#[cfg(not(windows))]
pub fn write_hidden(_text: &str) -> Result<(), String> {
    Err("clipboard is not supported on this platform yet".into())
}

#[cfg(not(windows))]
pub fn clear() -> Result<(), String> {
    Err("clipboard is not supported on this platform yet".into())
}

#[cfg(not(windows))]
pub fn save() -> Option<Saved> {
    None
}

#[cfg(not(windows))]
pub fn restore(_saved: &Saved) {}
