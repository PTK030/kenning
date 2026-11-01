// A short confirmation in the window's corner ("Saved", "Imported 4"), with
// the badge's countdown bar. It lives outside <main>, so a redraw of the
// view does not take it away.

import { h } from "./dom";
import { icon } from "./icons";
import { EASE_IN, move, SPRING } from "./motion";
import { cue } from "./sound";

const SHOWN_MS = 3200;

let layer: HTMLElement | null = null;
/** The Sounds setting: each toast is heard as well as seen when it is on. */
let sounds = false;

export function toastSounds(on: boolean) {
  sounds = on;
}

export function toast(text: string, kind: "ok" | "error" = "ok") {
  if (!layer?.isConnected) {
    layer = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.appendChild(layer);
  }
  const bar = h("i", { class: "bar" });
  const el = h("div", { class: `toast ${kind}` }, h("span", { class: "ic" }, icon(kind === "ok" ? "check" : "alert", 16)), h("span", {}, text), bar);
  layer.appendChild(el);
  if (sounds) cue(kind === "ok" ? "tick" : "fail");
  void move(el, { opacity: [0, 1], y: [12, 0], scale: [0.97, 1] }, SPRING);
  void move(bar, { scaleX: [1, 0] }, { duration: SHOWN_MS / 1000, ease: "linear" });
  setTimeout(async () => {
    await move(el, { opacity: 0, y: 6 }, { duration: 0.18, ease: EASE_IN });
    el.remove();
  }, SHOWN_MS);
}
