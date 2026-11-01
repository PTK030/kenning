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

/// Whether apps use the light theme (Windows: `AppsUseLightTheme`), which is
/// what the pages' `prefers-color-scheme` follows.
#[cfg(windows)]
pub fn apps_are_light() -> bool {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
        .and_then(|k| k.get_value::<u32, _>("AppsUseLightTheme"))
        .map(|v| v != 0)
        .unwrap_or(true)
}

#[cfg(not(windows))]
pub fn apps_are_light() -> bool {
    true
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

/// The process of the window that last wrote the clipboard, if any. A
/// clipper running in the background owns the clipboard after a swap; a
/// copy made by the user is owned by the app they are using.
#[cfg(windows)]
#[allow(unsafe_code)]
pub fn clipboard_owner_pid() -> Option<u32> {
    use windows_sys::Win32::System::DataExchange::GetClipboardOwner;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    // SAFETY: takes nothing; returns a window handle, or null when no
    // window owns the clipboard.
    let hwnd = unsafe { GetClipboardOwner() };
    if hwnd.is_null() {
        return None;
    }
    let mut pid = 0u32;
    // SAFETY: `pid` is a live u32; a stale `hwnd` makes the call return 0
    // and leaves `pid` at 0.
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    (pid != 0).then_some(pid)
}

#[cfg(not(windows))]
pub fn clipboard_owner_pid() -> Option<u32> {
    None
}

/// The process of the window in front.
#[cfg(windows)]
#[allow(unsafe_code)]
pub fn foreground_pid() -> Option<u32> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    // SAFETY: takes nothing; may return null (no window in front).
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }
    let mut pid = 0u32;
    // SAFETY: as above.
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    (pid != 0).then_some(pid)
}

#[cfg(not(windows))]
pub fn foreground_pid() -> Option<u32> {
    None
}

/// A process's executable file name, e.g. "chrome.exe".
pub fn process_name(pid: u32) -> Option<String> {
    process_path(pid).and_then(|path| path.rsplit('\\').next().map(str::to_owned))
}

/// A process's executable in full, e.g. "C:\Program Files\…\chrome.exe".
#[cfg(windows)]
#[allow(unsafe_code)]
pub fn process_path(pid: u32) -> Option<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };

    // SAFETY: plain call; returns null when the process is gone or closed
    // to us (limited query rights are enough for the image name).
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut buf = [0u16; 512];
    let mut len = buf.len() as u32;
    // SAFETY: `buf` and `len` are live and `len` holds the buffer's size in
    // characters; the handle is open until the CloseHandle below.
    let ok = unsafe { QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) };
    // SAFETY: `handle` came from OpenProcess and is closed exactly once.
    unsafe { CloseHandle(handle) };
    if ok == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buf[..len as usize]))
}

#[cfg(not(windows))]
pub fn process_path(_pid: u32) -> Option<String> {
    None
}

/// Milliseconds since the last key press or mouse movement, anywhere. A
/// person copies with a key or a click; a program writing the clipboard on
/// its own leaves no input behind it.
#[cfg(windows)]
#[allow(unsafe_code)]
pub fn idle_ms() -> Option<u32> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut info = LASTINPUTINFO {
        cbSize: size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: `info` is live and its cbSize is set, as the call requires.
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return None;
    }
    // SAFETY: takes nothing. Both values are the same 32-bit tick count, so
    // the wrapping difference is right across its 49-day rollover.
    Some(unsafe { GetTickCount() }.wrapping_sub(info.dwTime))
}

#[cfg(not(windows))]
pub fn idle_ms() -> Option<u32> {
    None
}

/// Open Explorer on `path`'s folder with the file selected.
#[cfg(windows)]
pub fn reveal_file(path: &str) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    // Explorer reads its own command line: the path goes in quotes, which
    // a Windows path cannot contain.
    std::process::Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{path}\""))
        .spawn()
        .map(drop)
}

#[cfg(not(windows))]
pub fn reveal_file(_path: &str) -> std::io::Result<()> {
    Err(std::io::Error::other("Showing files is Windows only for now."))
}
