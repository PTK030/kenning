// The "?" sheet in the main window: every shortcut, grouped by where it
// works, over a blurred backdrop. Esc, "?" or a click outside closes it.

import { h } from "./dom";
import { EASE_IN, move, rise, SPRING } from "./motion";
import { keycaps, shortcuts } from "./shortcuts";

let open: HTMLElement | null = null;

export function sheetOpen(): boolean {
  return open !== null;
}

export function toggleSheet(globalShortcut: string) {
  if (open) return void closeSheet();
  const list = shortcuts(globalShortcut);
  const groups = ["Anywhere", "Lookalike window", "Kenning window"] as const;
  const card = h(
    "div",
    { class: "sheet-card", role: "dialog", "aria-label": "Keyboard shortcuts" },
    h("h2", {}, "Keyboard shortcuts"),
    groups.map((g) =>
      h(
        "section",
        {},
        h("h3", {}, g),
        list.filter((s) => s.where === g).map((s) => h("div", { class: "keys-row" }, keycaps(s.keys), h("span", {}, s.what))),
      ),
    ),
    h("p", { class: "muted small" }, "Press ? or Esc to close."),
  );
  const overlay = h("div", { class: "sheet-overlay", onclick: (e: Event) => e.target === overlay && closeSheet() }, card);
  document.body.appendChild(overlay);
  open = overlay;
  void move(overlay, { opacity: [0, 1] }, { duration: 0.2 });
  void move(card, { opacity: [0, 1], y: [18, 0], scale: [0.97, 1] }, SPRING);
  void rise(card.querySelectorAll(".keys-row"), { y: 6, gap: 0.03, delay: 0.08 });
}

export async function closeSheet() {
  const el = open;
  if (!el) return;
  open = null;
  await move(el, { opacity: 0 }, { duration: 0.16, ease: EASE_IN });
  el.remove();
}
