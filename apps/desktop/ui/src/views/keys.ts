// "Your keys": press each shortcut for real. Held keys appear as large
// keycaps, a recognised combination names its action, and the shortcut is
// ticked off. The global check (Ctrl+Alt+K) is caught by Windows before
// the page sees it, so Kenning reports it back and the real badge shows.

import { clear, h } from "../dom";
import { icon } from "../icons";
import { on } from "../ipc";
import { draw, move, POP, rise, SPRING } from "../motion";
import { keycaps, keyName, shortcuts, type Shortcut } from "../shortcuts";

export function keysStep(opts: { shortcut: string; later: (fn: () => void, ms: number) => void; own: (stop: () => void) => void }) {
  const list = shortcuts(opts.shortcut);
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
            const row = h("div", { class: "keys-row" }, keycaps(s.keys), h("span", {}, s.what), h("span", { class: "tick" }));
            rows.set(s.id, row);
            return row;
          }),
      ),
    ),
  );
  const count = h("p", { class: "keys-count muted" });
  const paintCount = () => (count.textContent = `${tried.size} of ${list.length} tried`);
  paintCount();

  // ---- The heads-up display on the right --------------------------------
  const caps = h("div", { class: "hud-caps" });
  const action = h("div", { class: "hud-action" });
  const hint = h("p", { class: "hud-hint" }, "Press any shortcut from the list");
  const hud = h("div", { class: "hud" }, caps, action, hint);

  const held = new Set<string>();
  let idle = 0;

  const paintHeld = () => {
    clear(caps, [...held].map((k) => h("kbd", {}, k)));
    hint.hidden = held.size > 0 || action.childElementCount > 0;
    void move(caps.lastElementChild, { y: [6, 0], scale: [0.9, 1] }, POP);
  };

  const recognise = (s: Shortcut) => {
    clear(action, h("span", { class: "hud-tag" }, s.where), h("strong", {}, s.what));
    hint.hidden = true;
    void move(action, { opacity: [0, 1], y: [10, 0] }, SPRING);
    if (!tried.has(s.id)) {
      tried.add(s.id);
      const row = rows.get(s.id)!;
      row.classList.add("done");
      const tick = row.querySelector(".tick")!;
      tick.replaceChildren(icon("check", 14));
      void move(tick, { scale: [0.3, 1] }, POP);
      draw(tick.querySelector("svg"), { duration: 0.3 });
      paintCount();
      void move(count, { scale: [1.08, 1] }, POP);
    }
    // Light the matching caps in the list for a moment.
    const row = rows.get(s.id)!;
    row.classList.add("flash");
    opts.later(() => row.classList.remove("flash"), 500);
  };

  const settle = () => {
    clearTimeout(idle);
    idle = window.setTimeout(() => {
      held.clear();
      clear(caps);
      clear(action);
      hint.hidden = false;
    }, 1600);
  };

  const down = (e: KeyboardEvent) => {
    const onButton = (e.target as HTMLElement | null)?.closest("button");
    if (e.key === "Tab" || (onButton && (e.key === "Enter" || e.key === " "))) return;
    const k = keyName(e.key);
    if (["Ctrl", "Alt", "Shift", "Meta"].includes(k) === false && e.ctrlKey) held.add("Ctrl");
    held.add(k);
    // These keys would otherwise move on, open the find bar, or do nothing useful here.
    e.preventDefault();
    e.stopPropagation();
    paintHeld();
    const hit = list.find((s) => s.matches(held));
    if (hit) recognise(hit);
    settle();
  };
  const up = (e: KeyboardEvent) => {
    held.delete(keyName(e.key));
    if (!e.ctrlKey) held.delete("Ctrl");
    if (!e.altKey) held.delete("Alt");
    if (!e.shiftKey) held.delete("Shift");
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
    held.clear();
    s.keys.forEach((k) => held.add(k));
    paintHeld();
    recognise(s);
    settle();
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
      count,
    ],
    visual: hud,
  };
}
