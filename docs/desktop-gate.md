# Desktop shell decision: Tauri 2

The plan left Tauri 2 vs Electron open until a spike on Windows. The spike
measured the four criteria with the real app (`target/debug/kenning.exe`,
Windows 11, temporary `KENNING_HOME`), driven by a PowerShell harness that
writes to the clipboard and inspects windows through Win32.

| Criterion | Target | Result |
|---|---|---|
| Badge does not steal focus | never | Kenning never became the foreground window in 21 copies |
| Lookalike window over other apps | always on top | `WS_EX_TOPMOST` set, visible over the browser and editor. Windows' focus-steal protection keeps keyboard focus in the app you were using, which is the behaviour we want while someone is pasting |
| Memory at rest | < 60 MB | 8 MB private in total. The badge's webview is closed 30 s after its last use, so no WebView2 process stays alive |
| Reaction to a copy | < 200 ms | 44–47 ms to a visible badge while the badge webview is warm; about 350–400 ms for the first badge after a quiet spell (a new WebView2 renderer) |

Verdict: Tauri 2 passes. The cold badge is slower than the target. The trade
for 8 MB at rest instead of about 210 MB with a resident webview (measured in
the first run of the spike) is deliberate. An Electron shell would keep
Chromium resident and could not get under the memory target.

Other findings from the spike, fixed in the code:

* Some apps (and .NET's `Clipboard.SetText`) write the clipboard twice per
  copy. Repeats of the same address within one second are ignored.
* Clipboard content marked `ExcludeClipboardContentFromMonitorProcessing` is
  skipped before it is read.
