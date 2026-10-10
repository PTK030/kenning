// Every keyboard shortcut in Kenning, in one list: the onboarding teaches
// them, the main window's "?" sheet shows them, and the main window acts on
// the ones that belong to it.

import { h } from "./dom";

export type Shortcut = {
  id: string;
  /** Keys as shown, e.g. ["Ctrl", "Alt", "K"]. */
  keys: string[];
  what: string;
  where: "Anywhere" | "Lookalike window" | "Kenning window";
  /** Whether a set of held keys counts as this shortcut. */
  matches: (held: Set<string>) => boolean;
};

const has = (held: Set<string>, ...keys: string[]) => keys.every((k) => held.has(k));

export function shortcuts(global: string): Shortcut[] {
  const globalKeys = global.split("+").map(keyName);
  return [
    { id: "check", keys: globalKeys, what: "Check what you copied", where: "Anywhere", matches: (k) => has(k, ...globalKeys) },
    { id: "fix", keys: ["Enter"], what: "Copy the correct address", where: "Lookalike window", matches: (k) => k.size === 1 && k.has("Enter") },
    { id: "dismiss", keys: ["Esc"], what: "Dismiss the window", where: "Lookalike window", matches: (k) => k.size === 1 && k.has("Esc") },
    { id: "tabs", keys: ["Ctrl", "1 … 5"], what: "Switch section", where: "Kenning window", matches: (k) => k.has("Ctrl") && ["1", "2", "3", "4", "5"].some((d) => k.has(d)) },
    { id: "add", keys: ["Ctrl", "N"], what: "Add an address", where: "Kenning window", matches: (k) => has(k, "Ctrl", "N") },
    { id: "find", keys: ["Ctrl", "F"], what: "Check text for addresses", where: "Kenning window", matches: (k) => has(k, "Ctrl", "F") },
    { id: "help", keys: ["?"], what: "Show these shortcuts", where: "Kenning window", matches: (k) => k.has("?") },
  ];
}

/** One name per key, whatever the event or the config string says. */
export function keyName(raw: string): string {
  const k = raw.trim();
  const map: Record<string, string> = {
    Control: "Ctrl",
    CommandOrControl: "Ctrl",
    CmdOrCtrl: "Ctrl",
    Option: "Alt",
    Escape: "Esc",
    " ": "Space",
  };
  if (map[k]) return map[k];
  return k.length === 1 ? k.toUpperCase() : k;
}

/** Keycaps for a shortcut, e.g. [Ctrl] [Alt] [K]. */
export function keycaps(keys: string[], size: "small" | "big" = "small"): HTMLElement {
  return h("span", { class: `keycaps ${size}` }, keys.map((k) => h("kbd", { "data-key": k }, k)));
}
