// Kenning's own right-click menu, in place of the web view's (back, reload,
// save as, print, inspect: none of which belong in an app). It appears only
// where it helps: in text fields (cut, copy, paste, select all), on selected
// text (copy) and on an address (copy the address, without the spaces).
// Anywhere else a right-click does nothing.

import { h } from "./dom";
import { icon, type IconName } from "./icons";
import { EASE_IN, EASE_OUT, move } from "./motion";

export type Item = { label: string; icon: IconName; keys?: string; run: () => void | Promise<void> };

let open: HTMLElement | null = null;

function close() {
  const el = open;
  if (!el) return;
  open = null;
  void move(el, { opacity: 0, scale: 0.98 }, { duration: 0.1, ease: EASE_IN }).then(() => el.remove());
}

function editable(t: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  const el = (t as HTMLElement | null)?.closest?.("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || el.readOnly || el.disabled) return null;
  if (el instanceof HTMLInputElement && !["text", "search", "url", "number", ""].includes(el.type)) return null;
  return el;
}

/** Insert text at the caret, as typing would (so input listeners run). */
function insert(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  field.focus();
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.setRangeText(text, start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function itemsFor(e: MouseEvent): Item[] {
  const field = editable(e.target);
  if (field) {
    const selected = (field.selectionEnd ?? 0) > (field.selectionStart ?? 0);
    const items: Item[] = [];
    if (selected) {
      items.push({ label: "Cut", icon: "scissors", keys: "Ctrl+X", run: () => void document.execCommand("cut") });
      items.push({ label: "Copy", icon: "copy", keys: "Ctrl+C", run: () => void document.execCommand("copy") });
    }
    items.push({
      label: "Paste",
      icon: "clipboard",
      keys: "Ctrl+V",
      run: async () => {
        try {
          insert(field, await navigator.clipboard.readText());
        } catch {
          field.focus();
          document.execCommand("paste");
        }
      },
    });
    if (field.value) items.push({ label: "Select all", icon: "textSelect", keys: "Ctrl+A", run: () => field.select() });
    return items;
  }

  const selection = window.getSelection()?.toString() ?? "";
  if (selection.trim()) {
    return [{ label: "Copy", icon: "copy", keys: "Ctrl+C", run: () => void navigator.clipboard.writeText(selection) }];
  }

  const addr = (e.target as HTMLElement | null)?.closest?.(".addr");
  if (addr?.textContent) {
    const text = addr.textContent.replace(/\s+/g, "");
    return [{ label: "Copy address", icon: "copy", run: () => void navigator.clipboard.writeText(text) }];
  }
  return [];
}

document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  close();
  const items = itemsFor(e);
  if (items.length) showMenu(items, e.clientX, e.clientY);
});

/** The same menu, opened by a button: under it, right edges aligned. */
export function menuFor(button: HTMLElement, items: Item[]) {
  const wasOpen = open !== null;
  close();
  if (wasOpen) return;
  const r = button.getBoundingClientRect();
  // Opened from the keyboard or the mouse alike, the first item takes focus.
  showMenu(items, r.right, r.bottom + 4, true).querySelector<HTMLElement>(".ctx-item")?.focus({ preventScroll: true });
}

function showMenu(items: Item[], px: number, py: number, alignRight = false) {
  const menu = h(
    "div",
    { class: "ctx-menu", role: "menu" },
    items.map((it) =>
      h(
        "button",
        {
          class: "ctx-item",
          role: "menuitem",
          onclick: async () => {
            close();
            await it.run();
          },
        },
        icon(it.icon, 14),
        h("span", {}, it.label),
        it.keys ? h("span", { class: "ctx-keys" }, it.keys) : null,
      ),
    ),
  );
  document.body.appendChild(menu);
  // Keep it on screen.
  const r = menu.getBoundingClientRect();
  const x = Math.min(alignRight ? px - r.width : px, window.innerWidth - r.width - 6);
  const y = Math.min(py, window.innerHeight - r.height - 6);
  menu.style.left = `${Math.max(6, x)}px`;
  menu.style.top = `${Math.max(6, y)}px`;
  if (alignRight) menu.style.transformOrigin = "100% 0";
  open = menu;
  void move(menu, { opacity: [0, 1], scale: [0.97, 1] }, { duration: 0.12, ease: EASE_OUT });
  return menu;
}

// Any click elsewhere, a key, scrolling or leaving the window closes it.
document.addEventListener("pointerdown", (e) => open && !open.contains(e.target as Node) && close(), true);
document.addEventListener("keydown", (e) => e.key === "Escape" && close());
window.addEventListener("blur", close);
window.addEventListener("resize", close);
document.addEventListener("scroll", close, true);
