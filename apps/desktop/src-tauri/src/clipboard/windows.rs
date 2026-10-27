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

use std::time::{Duration, Instant};

use clipboard_win::{Clipboard, Monitor, formats, get, is_format_avail, raw, register_format};

use super::{Content, MAX_TEXT, Source};
use crate::platform;

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

/// Most Kenning will hold on to while it borrows the clipboard. A bigger
/// clipboard (a large image, say) is left alone and the selection is not
/// copied.
const MAX_SAVED: usize = 32 * 1024 * 1024;

/// What was on the clipboard, format by format, in the order the copying
/// app offered them.
type Saved = Vec<(u32, Vec<u8>)>;

/// Formats whose data is a handle (bitmaps, metafiles, palettes) or private
/// to the app that wrote it: they cannot be copied as bytes. Windows
/// rebuilds the bitmap ones from CF_DIB, which is kept.
fn is_handle_format(format: u32) -> bool {
    const HANDLES: [u32; 8] = [2, 3, 9, 14, 0x80, 0x82, 0x83, 0x8E];
    HANDLES.contains(&format) || (0x200..=0x3FF).contains(&format)
}

fn save() -> Option<Saved> {
    let _clip = Clipboard::new_attempts(10).ok()?;
    let mut saved = Vec::new();
    let mut total = 0;
    for format in raw::EnumFormats::new() {
        if is_handle_format(format) {
            continue;
        }
        let mut data = Vec::new();
        if raw::get_vec(format, &mut data).is_ok() {
            total += data.len();
            if total > MAX_SAVED {
                return None;
            }
            saved.push((format, data));
        }
    }
    Some(saved)
}

fn restore(saved: &Saved) {
    let Ok(_clip) = Clipboard::new_attempts(10) else {
        eprintln!("kenning: could not put the clipboard back");
        return;
    };
    let _ = raw::empty();
    for (format, data) in saved {
        let _ = raw::set_without_clear(*format, data);
    }
}

/// Wait (briefly) until `done` is true, polling every 10 ms.
fn wait_for(timeout: Duration, done: impl Fn() -> bool) -> bool {
    let deadline = Instant::now() + timeout;
    while !done() {
        if Instant::now() > deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    true
}

/// Copy the selection in the focused app and read it, then put back what
/// was on the clipboard before. When nothing gets copied (nothing selected,
/// or the app ignores Ctrl+Insert), the clipboard is read as it is.
///
/// The old clipboard is held in memory only for the restore, never parsed,
/// including content an app marked as private: its markers go back with it.
pub fn read_selection() -> (Content, Source) {
    let clipboard = || (read(), Source::Clipboard);
    // The shortcut's own keys must be up first: Ctrl+Insert with Alt still
    // held is Ctrl+Alt+Insert, which copies nothing.
    if !wait_for(Duration::from_millis(1500), || !platform::modifiers_held()) {
        return clipboard();
    }
    let Some(saved) = save() else {
        return clipboard();
    };
    let before = raw::seq_num();
    if !platform::press_copy() {
        return clipboard();
    }
    if !wait_for(Duration::from_millis(600), || raw::seq_num() != before) {
        return clipboard();
    }
    // Let the app finish writing all its formats, as the watcher does.
    std::thread::sleep(Duration::from_millis(40));
    let content = read();
    restore(&saved);
    (content, Source::Selection)
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
