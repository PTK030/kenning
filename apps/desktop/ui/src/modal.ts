// A sheet over the main window: the page behind it dimmed and out of reach
// of Tab and the mouse, the card springing in. Escape closes it, once any
// picker or drop-down inside has had the key. A click beside it is the
// caller's to answer (`onOutside`): a sheet to read closes, a form only
// while nothing in it was changed, so a slip of the mouse never throws away
// what was typed.

import { h } from "./dom";
import { sheetIn, sheetOut } from "./motion";

/** How many sheets are open: the page stays out of reach until the last closes. */
let depth = 0;

export interface Modal {
  /** Fade it out and remove it; focus goes back where it was unless told not to. */
  close: (restoreFocus?: boolean) => Promise<void>;
}

export function modal(card: HTMLElement, onEscape: () => void, onOutside?: () => void): Modal {
  const before = document.activeElement as HTMLElement | null;
  const app = document.getElementById("app");
  const overlay = h("div", { class: "sheet-overlay" }, card);
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onEscape();
  };
  overlay.addEventListener("keydown", keys);
  // A click beside the card, pressed and released there: a drag that began
  // inside (selecting the address) is not one, and nor is a click that only
  // puts away an open picker or drop-down.
  let outside = false;
  overlay.addEventListener("pointerdown", (e) => {
    outside = e.target === overlay && !document.querySelector(".emoji-pop, .dd-list:not([hidden])");
  });
  overlay.addEventListener("click", (e) => {
    if (outside && e.target === overlay) onOutside?.();
    outside = false;
  });
  document.body.appendChild(overlay);
  depth++;
  if (app) app.inert = true;
  sheetIn(overlay, card);

  let closed = false;
  return {
    close: async (restoreFocus = true) => {
      if (closed) return;
      closed = true;
      overlay.removeEventListener("keydown", keys);
      if (--depth === 0 && app) app.inert = false;
      await sheetOut(overlay, card);
      overlay.remove();
      if (restoreFocus) before?.focus();
    },
  };
}
