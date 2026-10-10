//! Small OS queries.

/// Whether the taskbar uses the light theme (Windows: `SystemUsesLightTheme`).
#[cfg(windows)]
pub fn taskbar_is_light() -> bool {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
        .and_then(|k| k.get_value::<u32, _>("SystemUsesLightTheme"))
        .map(|v| v != 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn taskbar_is_light() -> bool {
    false
}

/// Turn off the system's own show and hide animation for a window, so the
/// page's animation is the only one and the two never fight.
#[cfg(windows)]
#[allow(unsafe_code)]
pub fn disable_transitions(w: &tauri::WebviewWindow) {
    use windows_sys::Win32::Graphics::Dwm::{DWMWA_TRANSITIONS_FORCEDISABLED, DwmSetWindowAttribute};

    let Ok(hwnd) = w.hwnd() else {
        return;
    };
    let on: i32 = 1;
    // SAFETY: `hwnd` is a live window owned by this process, and the
    // attribute takes a 4-byte BOOL that outlives the call.
    unsafe {
        DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_TRANSITIONS_FORCEDISABLED as u32,
            (&raw const on).cast(),
            size_of::<i32>() as u32,
        );
    }
}

#[cfg(not(windows))]
pub fn disable_transitions(_w: &tauri::WebviewWindow) {}
