# Manual test checklist (Windows)

Run with a throwaway home so your real book is untouched:

```
$env:KENNING_HOME = "$env:TEMP\kenning-manual"
cd apps/desktop; npx tauri dev
```

- [ ] First launch opens the welcome screen; "Start" with "Every time I copy" selected.
- [ ] Tray menu shows "Network: off" and "Clipboard: watched".
- [ ] Add an address in the book; copy it from anywhere: corner badge with a check icon, soft chime, countdown bar, focus stays in your app.
- [ ] Hovering the badge stops the bar; leaving resumes it; ✕ closes it.
- [ ] Copy an address that matches its first 6 and last 4 characters: the lookalike window opens on top with differences marked and a lower two-note sound.
- [ ] "Copy the correct address" puts the book address on the clipboard and closes the window.
- [ ] "This is my address" + name saves it; copying it again shows a quiet badge.
- [ ] Copy a password from KeePassXC or 1Password: nothing happens.
- [ ] Switch to "Only when I press the shortcut": copying does nothing; Ctrl+Alt+K shows the badge.
- [ ] Settings → Soft sounds off: badges are silent.
- [ ] Journal lists checks, lookalikes and book changes.
- [ ] Resource Monitor → Network: no connections from kenning.exe.
- [ ] After 30 s without badges, Task Manager shows no msedgewebview2 processes under Kenning.
