// The lookalike window: shows exactly what matches and what differs, offers
// one big fix ("Copy the correct address") and one small way out ("This is
// mine"). It never closes by itself. Its content is built in alerts.ts,
// where the onboarding's picture of it comes from too.

import { fillLookalike, LOOKALIKE_LEAVE, lookalikeEnter } from "./alerts";
import { $, clear, h } from "./dom";
import { ipc, on } from "./ipc";
import { LEAVE, move } from "./motion";
import { titlebar } from "./titlebar";
import { DEFAULT_KEYS, matches } from "./shortcuts";
import type { Keys } from "./types";
import { playFor } from "./sound";
import type { LookalikeView } from "./types";
import "./guard";

const root = $("#lookalike");
/** Which of the three entrances played, so the window leaves by it. */
let shownVariant = 0;
/** The window's keys, from the config (Alt+C and Alt+D by default). */
let keys: Keys = DEFAULT_KEYS;
$("#chrome").replaceWith(
  titlebar({ title: "Not the address you know", sign: "alert", onClose: () => ipc.dismissLookalike() }).el,
);

function render(view: LookalikeView | null) {
  if (!view?.recognition.lookalike) {
    clear(root, h("p", { class: "muted" }, "Nothing to compare."));
    return;
  }
  fillLookalike(root, view, keys, {
    copy: () => ipc.copyCorrect(),
    mine: (label) => ipc.markMine(label),
    dismiss: () => void ipc.dismissLookalike(),
  });
  // Focus the window, not the button: a stray Enter while you were typing
  // must not act on a warning. The fix has its own key.
  root.focus();
  if (view.sounds) playFor("lookalike");
  shownVariant = view.variant % 3;
  fit(true);
  // The window shows once it has its height: the entrance waits for that.
  const variant = shownVariant;
  whenVisible(() => lookalikeEnter(root, variant));
}

/** Run `go` once the window is on screen (at most 400 ms from now). */
function whenVisible(go: () => void) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    document.removeEventListener("visibilitychange", run);
    requestAnimationFrame(go);
  };
  if (document.visibilityState === "visible") run();
  else {
    document.addEventListener("visibilitychange", run);
    setTimeout(run, 400);
  }
}

/** Size the window to the page (it is created hidden, and shows once it
 *  has its height). Layout is measured right away, even while hidden. */
function fit(reveal: boolean) {
  void ipc.fitLookalike(Math.ceil(document.body.getBoundingClientRect().height), reveal);
}

// An on-chain answer adds a line, the "This is mine" form changes a row.
new ResizeObserver(() => fit(false)).observe(document.body);

document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement | null)?.closest("input")) return;
  if (matches(e, keys.fix)) {
    e.preventDefault();
    root.querySelector<HTMLButtonElement>(".actions .primary")?.click();
  } else if (matches(e, keys.dismiss)) {
    e.preventDefault();
    void ipc.dismissLookalike();
  }
});

void on<null>("lookalike", () => void ipc.getLookalike().then(render));
// Closing, by any way (dismissed, the right address copied, marked as
// yours): the window leaves by the way it came in, then the shell closes it.
void on<null>("leave", () => void move(root, LOOKALIKE_LEAVE[shownVariant], LEAVE));
root.tabIndex = -1;
void ipc
  .overview()
  .then((o) => (keys = { ...DEFAULT_KEYS, ...o.config.keys }))
  .catch(() => undefined)
  .finally(() => void ipc.getLookalike().then(render));
