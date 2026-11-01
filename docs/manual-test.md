# Manual test checklist (Windows)

Run with a throwaway home so your real book is untouched:

```
$env:KENNING_HOME = "$env:TEMP\kenning-manual"
cd apps/desktop; npx tauri dev
```

- [ ] First launch opens the six-step onboarding. Back and Continue slide between steps; the progress bar follows.
- [ ] Step 3: pick "Every time I copy". Step 4: add an address with a name; it appears in the list on the right.
- [ ] Step 6: "Copy a known address" shows the USDC badge; "Copy a lookalike" opens the lookalike window.
- [ ] The badge glides in from the right, its icon draws itself, and it slides back out; a second copy while it shows swaps the content without replaying the entrance.
- [ ] Tray menu shows "Network: off" and "Clipboard: watched".
- [ ] Add an address in the book; copy it from anywhere: corner badge with a check icon, soft chime, countdown bar, focus stays in your app.
- [ ] Hovering the badge stops the bar; leaving resumes it; ✕ closes it.
- [ ] Copy an address that matches its first 6 and last 4 characters: the lookalike window opens on top with differences marked and a lower two-note sound.
- [ ] "Copy the correct address" puts the book address on the clipboard and closes the window.
- [ ] "This is my address" + name saves it; copying it again shows a quiet badge.
- [ ] Copy a password from KeePassXC or 1Password: nothing happens.
- [ ] Switch to "Only when I press the shortcut": copying does nothing; Ctrl+Alt+K shows the badge.
- [ ] Select an address in a browser, Notepad or a terminal (without copying it) and press Ctrl+Alt+D: the details window opens in the middle of the screen with the name, history and (network on) transactions. Ctrl+V afterwards still pastes what you had copied before.
- [ ] Ctrl+Alt+D with nothing selected uses the clipboard and says so; with a lookalike selected, the lookalike window opens instead.
- [ ] In a terminal running a program, Ctrl+Alt+D with nothing selected does not interrupt it.
- [ ] Esc, ✕ or clicking another window closes the details window; "Add to book" saves the address and the window shows it under its new name.
- [ ] Book: "Add address" opens a sheet over the list; pick a picture and a background, a group, save. The row shows the picture on its tile; Esc and Cancel close the sheet; a click beside it closes it only while nothing was changed, and with an emoji picker open it only closes the picker.
- [ ] Clicking a row of the book opens its details in a sheet over the list (no second window): copy, explorer, Edit (the edit sheet, with Remove) and Close; a click beside it closes it, a drag that starts on the address does not.
- [ ] Sidebar: Address book, Check, Journal, Protection at the top, Settings and Shortcuts at the foot; Ctrl+1 to 5 open them in that order, and hovering a row names its key. The current row has a short blue bar at its left edge, and the bar follows Settings when the window is resized.
- [ ] Tray → Pause watching: the tray icon shows a pause sign, and the sidebar shows "Watching paused" above Settings; Resume there removes both and the tray menu says "Pause watching" again. With "Only when I press the shortcut", no card.
- [ ] Settings → Soft sounds off: badges are silent.
- [ ] Journal lists checks, lookalikes and book changes; clicking one opens the same sheet over the journal, with "Add to book" for an address not yet named.
- [ ] Onboarding preferences: "Start with Windows" and "Check for updates" are on; leaving both on, Kenning starts at the next sign-in and, about 15 s after starting, asks github.com for `latest.json` (and nothing else).
- [ ] "Version 0.1.0" at the foot of the sidebar opens "What's new": one status row, then the changelog in the sheet's only scrolling area. "Check now" turns the row into "Checking for updates…", then "Kenning is up to date", or "Could not check for updates" with the reason while the repository is private or has no release. With automatic checks off, "Turn them on" opens Settings.
- [ ] With a newer signed release published (see docs/releasing.md): "Update to X.Y.Z" appears in the sidebar and as the first item of the tray menu; "Install and restart" shows progress, then Kenning closes and opens the new version.
- [ ] Check, Protection, the Journal and the Address book share one layout: the title with the page's one control on the right, a line under it, then the page. Check: "A text" / "Two addresses" switch in the header; "Try an example" under the two fields.
- [ ] Protection: with the guard on, a line under the header says so, with "Turn off"; with it off, a notice with "Turn on". "Run the test" (in the header) counts the decoys under a bar ("Checking the Bitcoin decoy, 2 of 4…"); a clean run says so in one notice. What was caught is listed by day, as in the Journal.
- [ ] With a clipper simulated (e.g. a PowerShell loop writing an address to the clipboard), the test shows "Something on this computer swaps addresses" and "See what happened"; the catch also appears under "What it caught". Clicking it (or Enter on it) opens a sheet with what happened, the facts, why it was taken for a swap and what to do now; "Show the file" opens Explorer with the program selected.
- [ ] Resource Monitor → Network: no connections from kenning.exe with on-chain lookups and update checks off.
- [ ] After 30 s without badges, Task Manager shows no msedgewebview2 processes under Kenning.
