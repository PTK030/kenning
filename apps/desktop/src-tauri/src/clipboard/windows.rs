//! Windows clipboard: `AddClipboardFormatListener` on a message-only window
//! (via `clipboard_win::Monitor`), and the formats Windows defines for
//! "please don't monitor this":
//!
//! * `ExcludeClipboardContentFromMonitorProcessing` – present means ignore.
//! * `Clipboard Viewer Ignore` – older convention, same meaning.
//! * `CanIncludeInClipboardHistory` / `CanUploadToCloudClipboard` – a DWORD 0
//!   means the app wants this kept out of history; we respect it too.
//!
//! See <https://learn.microsoft.com/windows/win32/dataxchg/clipboard-formats#cloud-clipboard-and-clipboard-history-formats>.

use std::time::Duration;

use clipboard_win::{Clipboard, Monitor, formats, get, is_format_avail, raw, register_format};

use super::{Content, MAX_TEXT};

const IGNORE_IF_PRESENT: [&str; 2] = [
    "ExcludeClipboardContentFromMonitorProcessing",
    "Clipboard Viewer Ignore",
];
const IGNORE_IF_ZERO: [&str; 2] = ["CanIncludeInClipboardHistory", "CanUploadToCloudClipboard"];

fn is_private() -> bool {
    for name in IGNORE_IF_PRESENT {
        if let Some(f) = register_format(name)
            && is_format_avail(f.get())
        {
            return true;
        }
    }
    for name in IGNORE_IF_ZERO {
        if let Some(f) = register_format(name)
            && is_format_avail(f.get())
        {
            let mut data = Vec::new();
            if raw::get_vec(f.get(), &mut data).is_ok() && data.len() >= 4 && data[..4] == [0, 0, 0, 0] {
                return true;
            }
        }
    }
    false
}

/// Read the clipboard as text, unless it is private, empty or too long.
pub fn read() -> Content {
    // Another process may hold the clipboard for a moment; retry briefly.
    let Ok(_clip) = Clipboard::new_attempts(10) else {
        return Content::Nothing;
    };
    if is_private() {
        return Content::Private;
    }
    if !is_format_avail(formats::CF_UNICODETEXT) {
        return Content::Nothing;
    }
    // Check the size before reading so huge copies are never pulled in.
    if raw::size(formats::CF_UNICODETEXT).is_some_and(|n| n.get() > MAX_TEXT * 2 + 2) {
        return Content::Nothing;
    }
    match get::<String, _>(formats::Unicode) {
        Ok(s) if !s.trim().is_empty() && s.len() <= MAX_TEXT => Content::Text(s),
        _ => Content::Nothing,
    }
}

/// Put `text` on the clipboard. Called only after an explicit click.
pub fn write(text: &str) -> Result<(), String> {
    clipboard_win::set_clipboard_string(text).map_err(|e| e.to_string())
}

/// Call `on_change` on a background thread after every clipboard change.
pub fn spawn_watcher(on_change: impl Fn() + Send + 'static) {
    std::thread::Builder::new()
        .name("clipboard-watcher".into())
        .spawn(move || {
            // The monitor must live on the thread that reads its messages.
            let mut monitor = match Monitor::new() {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("kenning: clipboard watcher unavailable: {e}");
                    return;
                }
            };
            loop {
                match monitor.recv() {
                    Ok(true) => {
                        // Let the copying app finish writing all its formats
                        // (including the "private" markers) before we look.
                        std::thread::sleep(Duration::from_millis(30));
                        on_change();
                    }
                    Ok(false) => return,
                    Err(e) => {
                        eprintln!("kenning: clipboard watcher stopped: {e}");
                        return;
                    }
                }
            }
        })
        .expect("spawn clipboard watcher");
}
