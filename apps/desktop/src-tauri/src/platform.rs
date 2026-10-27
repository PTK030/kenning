//! Small OS queries, and the few Win32 calls Kenning makes itself.

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

/// Whether Ctrl, Alt, Shift or Win is held down right now.
#[cfg(windows)]
#[allow(unsafe_code)]
pub fn modifiers_held() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    };

    [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN].into_iter().any(|vk| {
        // SAFETY: plain query of the key state, no pointers involved.
        let state = unsafe { GetAsyncKeyState(i32::from(vk)) };
        state as u16 & 0x8000 != 0
    })
}

#[cfg(not(windows))]
pub fn modifiers_held() -> bool {
    false
}

/// Press Ctrl+Insert in the focused app: "copy" in nearly every Windows
/// app, including terminals, where Ctrl+C would interrupt the program when
/// nothing is selected.
#[cfg(windows)]
#[allow(unsafe_code)]
pub fn press_copy() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
        KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY, VK_CONTROL, VK_INSERT,
    };

    let key = |vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    // Insert is an extended key; without the flag it reads as numpad 0.
    let inputs = [
        key(VK_CONTROL, 0),
        key(VK_INSERT, KEYEVENTF_EXTENDEDKEY),
        key(VK_INSERT, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP),
        key(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    // SAFETY: `inputs` is a live array of fully initialised keyboard INPUTs
    // and the size passed is the size of one element.
    let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32) };
    sent == inputs.len() as u32
}

#[cfg(not(windows))]
pub fn press_copy() -> bool {
    false
}
