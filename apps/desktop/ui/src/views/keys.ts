// "Your keys": press each shortcut for real. Held keys appear as large
// keycaps, a recognised combination names its action, and the shortcut is
// ticked off. The global check (Ctrl+Alt+K) is caught by Windows before
// the page sees it, so Kenning reports it back and the real badge shows.
// Every shortcut can be changed later in Settings.

import { clear, h } from "../dom";
import { icon } from "../icons";
import { on } from "../ipc";
import { draw, EASE_IN, EASE_OUT, move, rise } from "../motion";
import { comboOf, keycaps, keyOf, normalize, shortcuts, type Shortcut } from "../shortcuts";
import { cue } from "../sound";
import { actOut } from "./keysDemo";
import type { Config } from "../types";

export function keysStep(opts: {
  config: Config;
  sounds: () => boolean;
  later: (fn: () => void, ms: number) => void;
  /** Every shortcut tried: the onboarding suggests moving on. */
  onComplete: () => void;
  own: (stop: () => void) => void;
}) {
  const list = shortcuts(opts.config);
  const tried = new Set<string>();
  const rows = new Map<string, HTMLElement>();

  const groups = ["Anywhere", "Lookalike window", "Kenning window"] as const;
  const table = h(
    "div",
    { class: "keys-list" },
    groups.map((g) =>
      h(
        "section",
        {},
        h("h3", {}, g),
        list
          .filter((s) => s.where === g)
          .map((s) => {
            const row = h("div", { class: "keys-row" }, keycaps(s.combo), h("span", {}, s.what), h("span", { class: "tick" }));
            rows.set(s.id, row);
            return row;
          }),
      ),
    ),
  );
  const count = h("span");
  const paintCount = () => (count.textContent = `${tried.size} of ${list.length} tried.`);
  paintCount();

  // ---- The keys on the right -------------------------------------------
  // A key appears once when pressed, sits down while held and springs back
  // when released; the set fades out after a pause. One line below names
  // the action, or says what to do.
  const caps = h("div", { class: "hud-caps" });
  const HINT = "Press any shortcut from the list";
  const DONE = "That is all of them. Press Enter to go on.";
  const slot = h("p", { class: "hud-slot" }, h("span", { class: "hint" }, HINT));
  // Under the name, the shortcut acted out in miniature.
  const stage = h("div", { class: "hud-demo" });
  const hud = h("div", { class: "hud" }, caps, slot, stage);

  const MODS = ["Ctrl", "Alt", "Shift", "Win"];
  const held = new Set<string>();
  const capEls = new Map<string, HTMLElement>();
  let idle = 0;

  const say = (node: HTMLElement) => {
    clear(slot, node);
    void move(node, { opacity: [0, 1], y: [4, 0] }, { duration: 0.22, ease: EASE_OUT });
  };

  const press = (k: string) => {
    // A new chord after everything was released starts from a clean row.
    if (held.size === 0 && capEls.size) {
      clear(caps);
      capEls.clear();
    }
    held.add(k);
    // Show the modifiers held and the latest key only: holding Ctrl and
    // pressing several letters replaces the letter instead of adding one.
    if (!MODS.includes(k)) {
      for (const [key, old] of capEls) {
        if (!MODS.includes(key) && !held.has(key)) {
          old.remove();
          capEls.delete(key);
        }
      }
    }
    let el = capEls.get(k);
    if (!el) {
      el = h("kbd", {}, k);
      capEls.set(k, el);
      caps.appendChild(el);
      // Opacity only: the press itself (the "down" class) is the movement.
      void move(el, { opacity: [0, 1] }, { duration: 0.16, ease: EASE_OUT });
    }
    el.classList.add("down");
    caps.classList.toggle("many", capEls.size > 3);
  };

  const release = (k: string) => {
    held.delete(k);
    capEls.get(k)?.classList.remove("down");
  };

  const recognise = (s: Shortcut, key = "") => {
    say(h("strong", {}, s.what));
    actOut(stage, s, key, opts.later);
    if (!tried.has(s.id)) {
      tried.add(s.id);
      if (opts.sounds()) opts.later(() => cue("tick"), 90);
      const row = rows.get(s.id)!;
      row.classList.add("done");
      const tick = row.querySelector(".tick")!;
      tick.replaceChildren(icon("check", 14));
      void move(tick, { scale: [0.6, 1] }, { duration: 0.25, ease: EASE_OUT });
      draw(tick.querySelector("svg"), { duration: 0.3 });
      paintCount();
      if (tried.size === list.length) opts.later(opts.onComplete, 600);
    }
    // Light the matching row in the list for a moment.
    const row = rows.get(s.id)!;
    row.classList.add("flash");
    opts.later(() => row.classList.remove("flash"), 500);
  };

  /** After a quiet moment with nothing held, fade the keys and bring the hint back. */
  const settle = () => {
    clearTimeout(idle);
    idle = window.setTimeout(async () => {
      if (held.size) return settle();
      // Fade the keys themselves, never the row: an opacity left on the
      // row would hide every key pressed after this.
      await move([...caps.children, ...stage.children], { opacity: 0 }, { duration: 0.25, ease: EASE_IN });
      clear(caps);
      clear(stage);
      capEls.clear();
      say(h("span", { class: "hint" }, tried.size === list.length ? DONE : HINT));
    }, 2600);
  };

  const down = (e: KeyboardEvent) => {
    const onButton = (e.target as HTMLElement | null)?.closest("button");
    if (e.key === "Tab" || (onButton && (e.key === "Enter" || e.key === " "))) return;
    // These keys would otherwise move on, open the find bar, or do nothing useful here.
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    clearTimeout(idle);
    const k = keyOf(e);
    if (e.ctrlKey && k !== "Ctrl" && !held.has("Ctrl")) press("Ctrl");
    press(k);
    if (opts.sounds()) cue("key");
    const combo = comboOf(e);
    if (!combo) return;
    const tabs = e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-5]$/.test(k);
    const hit = tabs ? list.find((s) => s.id === "tabs") : list.find((s) => s.editable && normalize(s.combo) === normalize(combo));
    if (hit) recognise(hit, k);
  };
  const up = (e: KeyboardEvent) => {
    release(keyOf(e));
    if (!e.ctrlKey) release("Ctrl");
    if (!e.altKey) release("Alt");
    if (!e.shiftKey) release("Shift");
    settle();
  };

  // Capture phase, so the onboarding's own Enter / arrow keys stay quiet here.
  document.addEventListener("keydown", down, true);
  document.addEventListener("keyup", up, true);
  opts.own(() => {
    document.removeEventListener("keydown", down, true);
    document.removeEventListener("keyup", up, true);
    clearTimeout(idle);
  });
  const unlisten = on<null>("shortcut", () => {
    const s = list.find((x) => x.id === "check")!;
    const keys = s.combo.split("+");
    keys.forEach(press);
    recognise(s);
    opts.later(() => {
      keys.forEach(release);
      settle();
    }, 220);
  });
  opts.own(() => void unlisten.then((f) => f()));

  opts.later(() => {
    // Focus would still be on Continue, and Enter would leave the step.
    (document.activeElement as HTMLElement | null)?.blur();
    void rise(table.querySelectorAll(".keys-row"), { y: 8, gap: 0.05, delay: 0.1 });
  }, 0);

  return {
    copy: [
      h("h1", {}, "Your keys."),
      h("p", { class: "lead" }, "Press each one now and watch it light up."),
      table,
      h("p", { class: "keys-count muted" }, count, " You can change any of them in Settings."),
    ],
    visual: hud,
  };
}
