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
