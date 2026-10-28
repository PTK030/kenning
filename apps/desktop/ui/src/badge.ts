// The corner badge: a quiet confirmation of what was copied. It has a close
// button and a bar showing how long it stays; hovering holds it.
// It glides in from the screen edge on a soft spring, its icon draws itself,
// and it slips back out the same way. A newer badge replaces the content in
// place instead of replaying the entrance.

import { detailLine, short, STATE_WORD } from "./address";
import { $, clear, h } from "./dom";
import { icon, STATE_ICON } from "./icons";
import { ipc, on } from "./ipc";
import { draw, EASE_IN, move, POP, rise, SPRING } from "./motion";
import { onchainLine } from "./onchain";
import { playFor } from "./sound";
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
  root.className = "";
  if (!view) {
    clear(root);
    shown = false;
    return;
  }

  const close = h("button", { class: "close", "aria-label": "Close", title: "Close", onclick: () => ipc.hideBadge() }, icon("x", 14));
  bar = h("div", { class: "bar" });

  if (view.kind === "alert") {
    // The guard caught something: red, a sentence that says what, and the
    // one thing to do about it.
    root.classList.add("k-alert");
    const action = view.action;
    clear(
      root,
      h("div", { class: "tile" }, icon("alert", 20)),
      h(
        "div",
        { class: "text" },
        h("div", { class: "headline" }, h("span", { class: "name" }, view.title)),
        h("div", { class: "detail" }, view.text),
        action &&
          h(
            "button",
            {
              class: "act",
              onclick: () => {
                void ipc.guardAction(action.id).catch(() => {});
              },
            },
            action.label,
          ),
      ),
      close,
      h("div", { class: "track" }, bar),
    );
    if (view.sounds) playFor("lookalike");
  } else if (view.kind === "info") {
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
        h("div", { class: "detail" }, ...detailLine(r.detail)),
        h("div", { class: "detail" }, h("span", { class: "addr" }, short(r.address.text))),
        onchainLine(r.address.text),
      ),
      close,
      h("div", { class: "track" }, bar),
    );
    if (view.sounds) playFor(r.state);
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
  void move(root, { opacity: [0, 1], x: [18, 0], scale: [0.965, 1] }, SPRING);
  const tile = root.querySelector(".tile");
  void move(tile, { scale: [0.55, 1], rotate: [-14, 0] }, { ...POP, delay: 0.05 });
  draw(tile?.querySelector("svg") ?? null, { delay: 0.1 });
  void rise(root.querySelectorAll(".text > *"), { y: 6, delay: 0.07, gap: 0.04 });
  runBar();
}

/** A newer badge while one is showing: a small nudge and the new content. */
function swap() {
  void move(root, { opacity: 1, x: 0, scale: [0.975, 1] }, POP);
  draw(root.querySelector<SVGSVGElement>(".tile svg"), { duration: 0.4 });
  void rise(root.querySelectorAll(".text > *"), { y: 5, gap: 0.03 });
  runBar();
}

function leave() {
  shown = false;
  void move(root, { opacity: 0, x: 14, scale: 0.98 }, { duration: 0.24, ease: EASE_IN });
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
