// Settings: every shortcut with a recorder. Click it, press the keys you
// want, and they are checked at once: a modifier is required, keys that
// already mean something (copy, paste, Alt+F4…) and duplicates are turned
// down with the reason. Esc cancels. Nothing applies until Save.

import { clear, h } from "../dom";
import { move, POP } from "../motion";
import { comboOf, DEFAULT_DETAILS, DEFAULT_GLOBAL, DEFAULT_KEYS, keycaps, problem, shortcuts, type KeyId, type Shortcut } from "../shortcuts";
import { cue } from "../sound";
import type { Config } from "../types";

export function shortcutSection(c: Config): HTMLElement {
  const list = h("div", { class: "shortcut-list" });
  let stopRecording: (() => void) | null = null;

  const set = (id: KeyId, combo: string) => {
    if (id === "check") c.shortcut = combo;
    else if (id === "details") c.details_shortcut = combo;
    else c.keys = { ...c.keys, [id]: combo };
  };

  const recorder = (s: Shortcut, error: HTMLElement) => {
    const button = h("button", { class: "recorder", type: "button", "aria-label": `Change the shortcut for ${s.what}` }, keycaps(s.combo));
    button.addEventListener("click", () => {
      stopRecording?.();
      clear(error);
      button.classList.add("recording");
      clear(button, h("span", { class: "rec-hint" }, "Press the new keys"));

      const stop = () => {
        window.removeEventListener("keydown", onKey, true);
        button.classList.remove("recording");
        stopRecording = null;
      };
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
          stop();
          clear(button, keycaps(s.combo));
          return;
        }
        const combo = comboOf(e);
        if (!combo) {
          // Only modifiers so far: show them while the user finds the key.
          const held = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean).join("+");
          clear(button, held ? keycaps(held) : h("span", { class: "rec-hint" }, "Press the new keys"));
          return;
        }
        stop();
        const why = problem(s.id as KeyId, combo, shortcuts(c));
        if (why) {
          clear(button, keycaps(s.combo));
          clear(error, h("span", {}, keycaps(combo), " ", why));
          void move(button, { x: [0, -5, 5, -3, 3, 0] }, { duration: 0.35 });
          if (c.sounds) cue("off");
          return;
        }
        set(s.id as KeyId, combo);
        s.combo = combo;
        clear(button, keycaps(combo));
        void move(button, { scale: [0.94, 1] }, POP);
        if (c.sounds) cue("tick");
      };
      window.addEventListener("keydown", onKey, true);
      stopRecording = () => {
        stop();
        clear(button, keycaps(s.combo));
      };
    });
    return button;
  };

  const paint = () => {
    clear(
      list,
      shortcuts(c).map((s) => {
        const error = h("div", { class: "shortcut-error", role: "alert" });
        return h(
          "div",
          { class: "shortcut-row" },
          h("span", { class: "what" }, h("strong", {}, s.what), h("span", { class: "muted" }, s.where)),
          s.editable ? recorder(s, error) : h("span", { class: "fixed" }, keycaps(s.combo)),
          error,
        );
      }),
    );
  };
  paint();

  return h(
    "div",
    { class: "set-shortcuts" },
    list,
    h(
      "button",
      {
        class: "link muted",
        onclick: () => {
          c.shortcut = DEFAULT_GLOBAL;
          c.details_shortcut = DEFAULT_DETAILS;
          c.keys = { ...DEFAULT_KEYS };
          paint();
        },
      },
      "Reset to defaults",
    ),
  );
}
