// The corner badge: a quiet confirmation of what was copied. It has a close
// button and a bar showing how long it stays; hovering holds it.
// It glides in from the screen edge on a soft spring, its icon draws itself,
// and it slips back out the same way. A newer badge replaces the content in
// place instead of replaying the entrance.

import { badgeEnter, badgeLeave, badgeSwap, fillBadge } from "./alerts";
import { $, clear } from "./dom";
import { ipc, on } from "./ipc";
import { cue, playFor } from "./sound";
import type { BadgeView } from "./types";
import "./guard";

const root = $("#badge");
let bar: HTMLElement | null = null;
let total = 0;
let remaining = 0;
let startedAt = 0;
/** Whether the card is on screen (entered and not yet leaving). */
let shown = false;

function render(view: BadgeView | null) {
  if (!view) {
    root.className = "";
    clear(root);
    shown = false;
    return;
  }
  // The card itself is built in alerts.ts, where the onboarding's picture
  // of it comes from too.
  bar = fillBadge(root, view, {
    close: () => void ipc.hideBadge(),
    act: (id) => void ipc.guardAction(id).catch(() => {}),
  });
  if (view.sounds) {
    if (view.kind === "alert") playFor("lookalike");
    else if (view.kind === "recognition") playFor(view.recognition.state);
    // A note in the corner is a toast too: heard like the window's toasts.
    else cue("tick");
  }

  total = remaining = view.seconds * 1000;
  const fresh = !shown;
  shown = true;
  whenVisible(() => (fresh ? enter() : swap()));
}

/** The window may still be hidden when the event arrives; start once it shows. */
function whenVisible(run: () => void) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    document.removeEventListener("visibilitychange", go);
    requestAnimationFrame(run);
  };
  if (document.visibilityState === "visible") go();
  else {
    document.addEventListener("visibilitychange", go);
    setTimeout(go, 400);
  }
}

function enter() {
  badgeEnter(root);
  runBar();
}

/** A newer badge while one is showing: a small nudge and the new content. */
function swap() {
  badgeSwap(root);
  runBar();
}

function leave() {
  shown = false;
  void badgeLeave(root);
}

/** Animate the bar from its current width to empty over `remaining` ms. */
function runBar() {
  if (!bar) return;
  startedAt = performance.now();
  bar.style.transition = "none";
  bar.style.transform = `scaleX(${remaining / total})`;
  void bar.offsetWidth;
  bar.style.transition = `transform ${remaining}ms linear`;
  bar.style.transform = "scaleX(0)";
}

root.addEventListener("mouseenter", () => {
  if (!bar || !total) return;
  remaining = Math.max(0, remaining - (performance.now() - startedAt));
  bar.style.transition = "none";
  bar.style.transform = `scaleX(${remaining / total})`;
  root.classList.add("held");
  void ipc.badgePause();
});

root.addEventListener("mouseleave", () => {
  if (!bar || !total) return;
  root.classList.remove("held");
  remaining = Math.max(remaining, 800);
  runBar();
  void ipc.badgeResume(Math.round(remaining));
});

void on<BadgeView>("badge", render);
void on<null>("badge-hide", leave);
void ipc.getBadge().then(render);
