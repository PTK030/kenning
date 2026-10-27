// Every keyboard shortcut in Kenning, in one place: what each does, where
// it works, how a key press is named, and which combinations are allowed.
// The onboarding teaches them, the "?" sheet lists them, Settings records
// new ones, and the windows act on them.

import { h } from "./dom";
import type { Config, Keys } from "./types";

export type KeyId = "check" | "details" | keyof Keys;
export type Where = "Anywhere" | "Lookalike window" | "Kenning window";

export type Shortcut = {
  id: KeyId | "tabs";
  /** As stored and shown, e.g. "Ctrl+Alt+K". */
  combo: string;
  what: string;
  where: Where;
  editable: boolean;
};

/** Actions are Alt and a letter, like the buttons of a Windows dialog;
 *  moving around is Ctrl. None of them is something you press while typing
 *  or chatting (Ctrl+Enter sends a message in most apps). */
export const DEFAULT_KEYS: Keys = { fix: "Alt+C", dismiss: "Alt+D", add: "Alt+N", find: "Ctrl+F", help: "Ctrl+/" };
export const DEFAULT_GLOBAL = "Ctrl+Alt+K";
export const DEFAULT_DETAILS = "Ctrl+Alt+D";

export function shortcuts(c: Pick<Config, "shortcut" | "details_shortcut" | "keys">): Shortcut[] {
  const k = { ...DEFAULT_KEYS, ...c.keys };
  return [
    { id: "check", combo: c.shortcut, what: "Check what you copied", where: "Anywhere", editable: true },
    { id: "details", combo: c.details_shortcut || DEFAULT_DETAILS, what: "Show details of the selected address", where: "Anywhere", editable: true },
    { id: "fix", combo: k.fix, what: "Copy the correct address", where: "Lookalike window", editable: true },
    { id: "dismiss", combo: k.dismiss, what: "Dismiss the window", where: "Lookalike window", editable: true },
    { id: "tabs", combo: "Ctrl+1…4", what: "Switch section", where: "Kenning window", editable: false },
    { id: "add", combo: k.add, what: "Add an address", where: "Kenning window", editable: true },
    { id: "find", combo: k.find, what: "Search the book", where: "Kenning window", editable: true },
    { id: "help", combo: k.help, what: "Show all shortcuts", where: "Kenning window", editable: true },
  ];
}

const MODIFIERS = ["Ctrl", "Alt", "Shift"] as const;

/** The name of the key in an event, independent of Shift and the layout's
 *  symbols where possible: KeyK is "K", Digit1 is "1", Slash is "/". */
export function keyOf(e: KeyboardEvent): string {
  const code = e.code;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad") && /\d$/.test(code)) return code.slice(-1);
  const named: Record<string, string> = {
    Slash: "/",
    Backslash: "\\",
    Period: ".",
    Comma: ",",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
    Space: "Space",
    Escape: "Esc",
    NumpadEnter: "Enter",
    ControlLeft: "Ctrl",
    ControlRight: "Ctrl",
    AltLeft: "Alt",
    AltRight: "Alt",
    ShiftLeft: "Shift",
    ShiftRight: "Shift",
    MetaLeft: "Win",
    MetaRight: "Win",
  };
  return named[code] ?? e.key;
}

/** "Ctrl+Shift+K" for an event, or null while only modifiers are held. */
export function comboOf(e: KeyboardEvent): string | null {
  const key = keyOf(e);
  if ((MODIFIERS as readonly string[]).includes(key) || key === "Win") return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean) as string[];
  return [...mods, key].join("+");
}

/** Same keys, whatever the order or case. */
export function normalize(combo: string): string {
  return combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("+");
}

export function matches(e: KeyboardEvent, combo: string): boolean {
  const c = comboOf(e);
  return c !== null && normalize(c) === normalize(combo);
}

/** Keys already meaning something everywhere: clipboard, undo, Windows. */
const RESERVED: Record<string, string> = {
  "Ctrl+C": "copy",
  "Ctrl+V": "paste",
  "Ctrl+X": "cut",
  "Ctrl+A": "select all",
  "Ctrl+Z": "undo",
  "Ctrl+Y": "redo",
  "Alt+F4": "closing windows",
  "Ctrl+Shift+Esc": "Task Manager",
  "Ctrl+Esc": "the Start menu",
  "Alt+Tab": "switching windows",
  "Ctrl+Alt+Delete": "Windows security",
  "Alt+Space": "the window menu",
  "Alt+Esc": "switching windows",
  "Ctrl+N": "a new window in the web view",
  "Ctrl+T": "a new tab in the web view",
  "Ctrl+W": "closing a window",
  "Ctrl+Shift+N": "a private window in the web view",
  "Ctrl+Shift+T": "reopening a tab in the web view",
  "Ctrl+P": "printing",
  "Ctrl+R": "reloading",
  "Ctrl+S": "saving",
  "F5": "reloading",
  "Ctrl+Enter": "sending a message in most apps",
};

/** Polish letters typed with AltGr, which Windows reports as Ctrl+Alt. */
const ALTGR_LETTERS = new Set(["A", "C", "E", "L", "N", "O", "S", "X", "Z"]);

/** Why a combination cannot be used for `id`, or null when it is fine. */
export function problem(id: KeyId, combo: string, current: Shortcut[]): string | null {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!mods.includes("Ctrl") && !mods.includes("Alt")) {
    return "Use Ctrl or Alt with it, so typing never triggers it by accident.";
  }
  for (const [reserved, meaning] of Object.entries(RESERVED)) {
    if (normalize(reserved) === normalize(combo)) return `${combo} already means ${meaning}.`;
  }
  if (mods.includes("Ctrl") && !mods.includes("Alt") && !mods.includes("Shift") && /^[1-4]$/.test(key)) {
    return "Ctrl+1 to Ctrl+4 switch sections.";
  }
  if (id === "check" || id === "details") {
    if (mods.length < 2) return "It works in every app, so give it two modifiers, like Ctrl+Alt+K.";
    if (mods.includes("Ctrl") && mods.includes("Alt") && !mods.includes("Shift") && ALTGR_LETTERS.has(key)) {
      return `Ctrl+Alt+${key} is AltGr+${key} on a Polish keyboard, which types a letter.`;
    }
  }
  const taken = current.find((s) => s.id !== id && s.editable && normalize(s.combo) === normalize(combo));
  if (taken) return `Already used for “${taken.what}”.`;
  return null;
}

/** Keycaps for a combination, e.g. [Ctrl] [Alt] [K]. */
export function keycaps(combo: string, size: "small" | "big" = "small"): HTMLElement {
  return h("span", { class: `keycaps ${size}` }, combo.split("+").map((k) => h("kbd", {}, k)));
}
