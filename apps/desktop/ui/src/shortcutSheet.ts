// The shortcut sheet in the main window: every shortcut, grouped by where
// it works, over a blurred backdrop. The help shortcut, Esc or a click
// outside closes it.

import { h } from "./dom";
import { rise, sheetIn, sheetOut } from "./motion";
import { keycaps, shortcuts } from "./shortcuts";
import type { Config } from "./types";

let open: HTMLElement | null = null;

export function sheetOpen(): boolean {
  return open !== null;
}

export function toggleSheet(config: Config) {
  if (open) return void closeSheet();
  const list = shortcuts(config);
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
        list.filter((s) => s.where === g).map((s) => h("div", { class: "keys-row" }, keycaps(s.combo), h("span", {}, s.what))),
      ),
    ),
    h(
      "p",
      { class: "muted small" },
      "Change any of them in ",
      h("a", { href: "#settings", onclick: () => void closeSheet() }, "Settings"),
      ".",
    ),
  );
  const overlay = h("div", { class: "sheet-overlay", onclick: (e: Event) => e.target === overlay && closeSheet() }, card);
  document.body.appendChild(overlay);
  open = overlay;
  sheetIn(overlay, card);
  void rise(card.querySelectorAll(".keys-row"), { y: 6, gap: 0.03, delay: 0.08 });
}

export async function closeSheet() {
  const el = open;
  if (!el) return;
  open = null;
  await sheetOut(el, el.querySelector<HTMLElement>(".sheet-card"));
  el.remove();
}
