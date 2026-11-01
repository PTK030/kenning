// A question before something that cannot be undone, in the same sheet as
// the shortcut list instead of the browser's confirm(). Enter confirms, Esc
// or a click outside cancels.

import { h } from "./dom";
import { sheetIn, sheetOut } from "./motion";

export function confirmSheet(opts: { title: string; body: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const before = document.activeElement as HTMLElement | null;
    const close = async (answer: boolean) => {
      document.removeEventListener("keydown", keys, true);
      resolve(answer);
      await sheetOut(overlay, card);
      overlay.remove();
      before?.focus();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        void close(false);
      }
    };
    const yes = h("button", { class: `btn primary${opts.danger ? " danger" : ""}`, onclick: () => void close(true) }, opts.confirm);
    const card = h(
      "div",
      { class: "sheet-card confirm", role: "alertdialog", "aria-modal": "true", "aria-label": opts.title },
      h("h2", {}, opts.title),
      h("p", { class: "muted" }, opts.body),
      h("div", { class: "sheet-actions" }, h("button", { class: "btn", onclick: () => void close(false) }, "Cancel"), yes),
    );
    const overlay = h("div", { class: "sheet-overlay", onclick: (e: Event) => e.target === overlay && void close(false) }, card);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", keys, true);
    yes.focus();
    sheetIn(overlay, card);
  });
}
