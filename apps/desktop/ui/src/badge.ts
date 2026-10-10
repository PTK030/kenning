// The corner badge: a quiet confirmation of what was copied. It has a close
// button and a bar showing how long it stays; hovering holds it.

import { short, STATE_WORD } from "./address";
import { $, clear, h } from "./dom";
import { icon, STATE_ICON } from "./icons";
import { ipc, on } from "./ipc";
import { playFor } from "./sound";
import type { BadgeView } from "./types";

const root = $("#badge");
let bar: HTMLElement | null = null;
let total = 0;
let remaining = 0;
let startedAt = 0;

function render(view: BadgeView | null) {
  root.classList.remove("in", "out");
  root.className = "";
  if (!view) {
    clear(root);
    return;
  }

  const close = h("button", { class: "close", "aria-label": "Close", title: "Close", onclick: () => ipc.hideBadge() }, icon("x", 14));
  bar = h("div", { class: "bar" });

  if (view.kind === "info") {
    root.classList.add("k-info");
    clear(
      root,
      h("div", { class: "tile" }, icon("info", 20)),
      h("div", { class: "text" }, h("div", { class: "headline" }, h("span", { class: "name" }, view.text))),
      close,
      h("div", { class: "track" }, bar),
    );
  } else {
    const r = view.recognition;
    root.classList.add(`k-${r.state}`);
    clear(
      root,
      h("div", { class: "tile" }, icon(STATE_ICON[r.state], 20)),
      h(
        "div",
        { class: "text" },
        h("div", { class: "headline" }, h("span", { class: "name" }, r.headline), h("span", { class: "word" }, STATE_WORD[r.state])),
        h("div", { class: "detail" }, r.detail),
        h("div", { class: "detail" }, h("span", { class: "addr" }, short(r.address.text))),
      ),
      close,
      h("div", { class: "track" }, bar),
    );
    if (view.sounds) playFor(r.state);
  }

  total = remaining = view.seconds * 1000;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.classList.add("in");
      runBar();
    }),
  );
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
void on<null>("badge-hide", () => root.classList.add("out"));
void ipc.getBadge().then(render);
