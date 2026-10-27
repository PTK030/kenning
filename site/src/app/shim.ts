// Runs inside the hero's demo frames, before the desktop app's own window
// script (apps/desktop/ui). It stands in for Kenning's Rust side with Tauri's
// IPC mock: the frame shows whatever the page around it sends, and reports
// back what was clicked. The window code itself is the app's, unchanged.

import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

mockWindows(document.body.dataset.window ?? "main");

let badge: unknown = null;
let lookalike: unknown = null;
const tell = (event: string) => parent.postMessage({ kenning: event }, location.origin);

mockIPC(
  (cmd, args) => {
    switch (cmd) {
      case "get_badge":
        return badge;
      case "get_lookalike":
        return lookalike;
      case "overview":
        return { config: { keys: {} } };
      case "get_onchain":
        return {};
      case "hide_badge":
        return tell("hide-badge");
      case "copy_correct":
        return tell("copy-correct");
      case "dismiss_lookalike":
        return tell("dismiss");
      case "mark_mine":
        if (!String((args as { label?: string })?.label ?? "").trim()) throw "Give it a name.";
        return tell("mark-mine");
      default:
        return null;
    }
  },
  { shouldMockEvents: true },
);

addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || typeof e.data !== "object") return;
  if ("badge" in e.data) {
    badge = e.data.badge;
    void emit(badge ? "badge" : "badge-hide", badge);
  }
  if ("lookalike" in e.data) {
    lookalike = e.data.lookalike;
    void emit("lookalike", null);
  }
  // The hero presses the fix itself when nobody does: the button dips as
  // under a finger, then its own click handler runs.
  if (e.data.press) {
    const button = document.querySelector<HTMLButtonElement>(".actions .primary");
    if (!button) return;
    button
      .animate([{ transform: "none" }, { transform: "scale(0.95)", filter: "brightness(1.25)" }, { transform: "none" }], {
        duration: 260,
        easing: "ease-out",
      })
      .finished.then(() => button.click());
  }
});

// The windows focus themselves when they open. On a web page that would pull
// the keyboard (and the scroll position) away from the reader, so a frame
// only takes focus once someone has clicked into it.
const focus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (options?: FocusOptions) {
  if (document.hasFocus()) focus.call(this, { ...options, preventScroll: true });
};
