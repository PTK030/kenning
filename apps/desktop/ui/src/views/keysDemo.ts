// What each shortcut does, acted out in miniature under the keys in the
// onboarding: press Alt+C and a small lookalike window has its button
// pressed; press Ctrl+3 and the highlight moves to the third section.

import { clear, h } from "../dom";
import { icon } from "../icons";
import { badgeEnter, detailsEnter, fillBadge, fillDetails, fillLookalike, lookalikeEnter } from "../alerts";
import { EASE_IN, EASE_OUT, move, POP, SPRING } from "../motion";
import { titlebar } from "../titlebar";
import { KNOWN_RECOGNITION, LOOKALIKE_RECOGNITION } from "./demo";
import { DEFAULT_KEYS, keycaps, type Shortcut } from "../shortcuts";

const SECTIONS = ["Address book", "Check", "Protection", "Journal", "Settings"];

type Later = (fn: () => void, ms: number) => void;

/** The real badge (alerts.ts) for the address you know, arriving as the
 *  real one does, its bar counting down. */
function badge(): HTMLElement {
  const card = h("div");
  const bar = fillBadge(card, { kind: "recognition", recognition: KNOWN_RECOGNITION, seconds: 3, sounds: false });
  badgeEnter(card);
  void move(bar, { scaleX: [1, 0] }, { duration: 2.6, ease: "linear" });
  return h("div", { class: "hud-badge" }, card);
}

/** The real lookalike window (alerts.ts), its title bar a picture of one. */
function look(): { el: HTMLElement; fix: HTMLElement; dismiss: HTMLElement } {
  const bar = titlebar({ title: "Not the address you know", sign: "alert", onClose: () => undefined }).el;
  for (const el of [bar, ...bar.querySelectorAll("[data-tauri-drag-region]")]) el.removeAttribute("data-tauri-drag-region");
  const card = h("div");
  fillLookalike(card, { recognition: LOOKALIKE_RECOGNITION, variant: 0, sounds: false }, DEFAULT_KEYS, {}, false);
  const el = h("div", { class: "hud-look", inert: true }, h("div", { class: "look-window" }, bar, card));
  lookalikeEnter(card, 0);
  return { el, fix: card.querySelector<HTMLElement>(".actions .primary")!, dismiss: card.querySelector<HTMLElement>(".actions .dismiss")! };
}

/** Act out `s` inside `box`. `key` is the key pressed (for Ctrl+1…5). */
export function actOut(box: HTMLElement, s: Shortcut, key: string, later: Later) {
  switch (s.id) {
    case "check":
      clear(box, badge());
      break;

    case "details": {
      // The real details window (alerts.ts), its on-chain row answered as
      // a lookup would answer it.
      const bar = titlebar({ title: "Address details", sign: "search", onClose: () => undefined }).el;
      for (const el of [bar, ...bar.querySelectorAll("[data-tauri-drag-region]")]) el.removeAttribute("data-tauri-drag-region");
      const card = h("div");
      const facts = fillDetails(card, { recognition: KNOWN_RECOGNITION, source: "selection", network: true }, {}, false);
      facts.paintChain({
        state: "ok",
        summary: "1,204+ transactions · Ethereum via Blockscout",
        active: true,
        onchain: {
          network: "Ethereum",
          source: "Blockscout",
          active: true,
          transactions: 1204,
          transactions_capped: true,
          contract: false,
          verified: null,
          name: null,
          fetched_at: new Date().toISOString(),
        },
      });
      clear(box, h("div", { class: "hud-details", inert: true }, h("div", { class: "details-window k-mine" }, bar, card)));
      detailsEnter(card);
      break;
    }

    case "fix": {
      const l = look();
      clear(box, l.el);
      later(() => {
        l.fix.classList.add("pressed");
        void move(l.fix, { scale: [1, 0.94, 1] }, { duration: 0.22 });
      }, 380);
      later(async () => {
        await move(l.el, { opacity: 0, y: -8 }, { duration: 0.2, ease: EASE_IN });
        clear(box, badge());
      }, 680);
      break;
    }

    case "dismiss": {
      const l = look();
      clear(box, l.el);
      later(async () => {
        l.dismiss.classList.add("pressed");
        await move(l.el, { opacity: 0, y: 18, scale: 0.97 }, { duration: 0.26, ease: EASE_IN });
        const note = h("p", { class: "mini-note" }, "Closed. Nothing was copied.");
        clear(box, note);
        void move(note, { opacity: [0, 1] }, { duration: 0.25 });
      }, 420);
      break;
    }

    case "tabs": {
      const n = Math.min(SECTIONS.length, Math.max(1, Number(key) || 1)) - 1;
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
