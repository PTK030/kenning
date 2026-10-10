//! Clipboard access. Only this module touches the clipboard, and only the
//! Rust side: the web UI has no clipboard permission.
//!
//! * Text longer than [`MAX_TEXT`] is ignored (addresses are short).
//! * Content that the copying app marked as private (password managers) is
//!   ignored before it is read.
//! * Nothing read here is stored; callers keep only validated addresses.

#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::{read, spawn_watcher, write};

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

// Other platforms come later; these stubs keep the crate compiling there.
#[cfg(not(windows))]
pub fn read() -> Content {
    Content::Nothing
}

#[cfg(not(windows))]
pub fn write(_text: &str) -> Result<(), String> {
    Err("clipboard is not supported on this platform yet".into())
}

#[cfg(not(windows))]
pub fn spawn_watcher(_on_change: impl Fn() + Send + 'static) {}
