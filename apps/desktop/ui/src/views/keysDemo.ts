// What each shortcut does, acted out in miniature under the keys in the
// onboarding: press Alt+C and a small lookalike window has its button
// pressed; press Ctrl+3 and the highlight moves to the third section.

import { clear, h } from "../dom";
import { icon } from "../icons";
import { draw, EASE_IN, EASE_OUT, move, POP, SPRING } from "../motion";
import { keycaps, type Shortcut } from "../shortcuts";

const SECTIONS = ["Address book", "Check", "Journal", "Settings", "What it reads"];

type Later = (fn: () => void, ms: number) => void;

function badge(title: string, line: string): HTMLElement {
  const bar = h("i", { class: "bar" });
  const el = h(
    "div",
    { class: "sbx-badge mine" },
    h("span", { class: "tile" }, icon("checkCircle", 18)),
    h("span", { class: "t" }, h("b", {}, title), h("span", {}, line)),
    bar,
  );
  void move(el, { opacity: [0, 1], x: [24, 0] }, SPRING);
  draw(el.querySelector(".tile svg"), { delay: 0.08 });
  void move(bar, { scaleX: [1, 0] }, { duration: 2.6, ease: "linear" });
  return el;
}

function look(): { el: HTMLElement; fix: HTMLElement } {
  const fix = h("span", { class: "mini-fix" }, icon("copy", 12), "Copy the correct address");
  const el = h(
    "div",
    { class: "mini-look" },
    h("div", { class: "top" }, icon("alert", 14), h("b", {}, "Not your Binance address")),
    h("code", {}, "0x28C6 C0", h("mark", {}, "aa AAaA AAaa"), " … 1d60"),
    h("div", { class: "row" }, fix, h("span", { class: "mini-link" }, "Dismiss")),
  );
  void move(el, { opacity: [0, 1], y: [10, 0] }, SPRING);
  return { el, fix };
}

/** Act out `s` inside `box`. `key` is the key pressed (for Ctrl+1…5). */
export function actOut(box: HTMLElement, s: Shortcut, key: string, later: Later) {
  switch (s.id) {
    case "check":
      clear(box, badge("Binance deposits", "Checked: in your book"));
      break;

    case "fix": {
      const l = look();
      clear(box, l.el);
      later(() => {
        l.fix.classList.add("pressed");
        void move(l.fix, { scale: [1, 0.94, 1] }, { duration: 0.22 });
      }, 380);
      later(async () => {
        await move(l.el, { opacity: 0, y: -8 }, { duration: 0.2, ease: EASE_IN });
        clear(box, badge("Binance deposits", "Copied the correct address"));
      }, 680);
      break;
    }

    case "dismiss": {
      const l = look();
      clear(box, l.el);
      later(async () => {
        l.el.querySelector(".mini-link")?.classList.add("pressed");
        await move(l.el, { opacity: 0, y: 18, scale: 0.97 }, { duration: 0.26, ease: EASE_IN });
        const note = h("p", { class: "mini-note" }, "Closed. Nothing was copied.");
        clear(box, note);
        void move(note, { opacity: [0, 1] }, { duration: 0.25 });
      }, 420);
      break;
    }

    case "tabs": {
      const n = Math.min(5, Math.max(1, Number(key) || 1)) - 1;
      const pill = h("span", { class: "mini-pill" });
      const items = SECTIONS.map((t, i) => h("li", { class: i === n ? "on" : "" }, h("kbd", {}, String(i + 1)), t));
      const nav = h("ul", { class: "mini-nav" }, pill, items);
      clear(box, nav);
      // Glide from wherever it was last time (or the top) to the section.
      const from = Number(box.dataset.tab ?? 0);
      box.dataset.tab = String(n);
      pill.style.transform = `translateY(${from * 26}px)`;
      void move(pill, { y: [from * 26, n * 26] }, SPRING);
      break;
    }

    case "add": {
      const field = h("span", { class: "mini-field focus" }, h("i", { class: "caret" }), h("span", { class: "ph" }, "Paste an address"));
      const form = h(
        "div",
        { class: "mini-form" },
        h("small", {}, "Address"),
        field,
        h("small", {}, "Name"),
        h("span", { class: "mini-field" }, h("span", { class: "ph" }, "e.g. Binance deposits")),
      );
      clear(box, form);
      void move(form, { opacity: [0, 1], y: [10, 0] }, SPRING);
      break;
    }

    case "find": {
      const typed = h("span", {});
      const rows = h(
        "ul",
        { class: "mini-results" },
        ["Binance deposits", "Cold wallet", "Payroll Safe"].map((t) => h("li", {}, t)),
      );
      const search = h("div", { class: "mini-search" }, h("span", { class: "mini-field focus" }, icon("search", 12), typed, h("i", { class: "caret" })), rows);
      clear(box, search);
      void move(search, { opacity: [0, 1], y: [10, 0] }, SPRING);
      [..."Bin"].forEach((ch, i) =>
        later(() => {
          typed.textContent += ch;
          if (i === 2) {
            const others = [...rows.children].slice(1);
            void move(others, { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }, { duration: 0.25, ease: EASE_OUT });
          }
        }, 220 + i * 140),
      );
      break;
    }

    case "help": {
      const sheet = h(
        "div",
        { class: "mini-sheet" },
        h("b", {}, "Keyboard shortcuts"),
        [
          ["Alt+C", "Copy the correct address"],
          ["Alt+N", "Add an address"],
          ["Ctrl+F", "Search the book"],
        ].map(([k, t]) => h("div", {}, keycaps(k), h("span", {}, t))),
      );
      clear(box, sheet);
      void move(sheet, { opacity: [0, 1], scale: [0.94, 1] }, POP);
      break;
    }
  }
}
