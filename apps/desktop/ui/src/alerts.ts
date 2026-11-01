// The badge and the lookalike window, built in one place: the real windows
// use these, and so do the onboarding's pictures of them, so a picture can
// never show something the app does not. Each fills a root it is given and
// leaves the window's own business (timers, keys, sounds) to its caller.

import { addressPlain, addressWithDiff, chainChip, detailLine, OWNER_CHOICES, short, STATE_WORD } from "./address";
import { dropdown } from "./dropdown";
import { factList, type FactList } from "./facts";
import { clear, h } from "./dom";
import { emojiMark } from "./emoji";
import { icon, STATE_ICON } from "./icons";
import { draw, EASE_IN, move, POP, rise, settling, SPRING } from "./motion";
import { onchainLine } from "./onchain";
import { keycaps } from "./shortcuts";
import type { BadgeView, DetailsView, KnownKind, Keys, LookalikeView, Owner, Source } from "./types";

// ---- The badge --------------------------------------------------------------

export type BadgeHandlers = {
  close?: () => void;
  /** The alert's button ("restore", "clear"). */
  act?: (id: "restore" | "clear") => void;
};

/** Fill `root` with the badge for `view`. Returns its countdown bar. */
export function fillBadge(root: HTMLElement, view: BadgeView, on: BadgeHandlers = {}): HTMLElement {
  root.className = "badge-card";
  const close = h("button", { class: "close", "aria-label": "Close", title: "Close", onclick: () => on.close?.() }, icon("x", 14));
  const bar = h("div", { class: "bar" });

  if (view.kind === "alert") {
    // The guard caught something: red, a sentence that says what, and the
    // one thing to do about it.
    root.classList.add("k-alert");
    const action = view.action;
    clear(
      root,
      h("div", { class: "tile" }, icon("alert", 20)),
      h(
        "div",
        { class: "text" },
        h("div", { class: "headline" }, h("span", { class: "name" }, view.title)),
        h("div", { class: "detail" }, view.text),
        action && h("button", { class: "act", onclick: () => on.act?.(action.id) }, action.label),
      ),
      close,
      h("div", { class: "track" }, bar),
    );
  } else if (view.kind === "info") {
    root.classList.add("k-info");
    clear(
      root,
      h("div", { class: "tile" }, icon("info", 20)),
      h("div", { class: "text" }, h("div", { class: "headline" }, h("span", { class: "name" }, view.text))),
      close,
      h("div", { class: "track" }, bar),
    );
  } else {
    const r = view.recognition;
    root.classList.add(`k-${r.state}`);
    clear(
      root,
      h("div", { class: "tile" }, icon(STATE_ICON[r.state], 20)),
      h(
        "div",
        { class: "text" },
        h(
          "div",
          { class: "headline" },
          // Only a book entry has a picture, so a lookalike never wears a familiar one.
          r.emoji && emojiMark(r.emoji, 18),
          h("span", { class: "name" }, r.headline),
          h("span", { class: "word" }, STATE_WORD[r.state]),
        ),
        h("div", { class: "detail" }, ...detailLine(r.detail)),
        h("div", { class: "detail" }, h("span", { class: "addr" }, short(r.address.text))),
        onchainLine(r.address.text),
      ),
      close,
      h("div", { class: "track" }, bar),
    );
  }
  return bar;
}

/** The badge arriving: a soft glide in, its icon drawing itself. */
export function badgeEnter(root: HTMLElement) {
  void move(root, { opacity: [0, 1], x: [18, 0], scale: [0.965, 1] }, SPRING);
  const tile = root.querySelector(".tile");
  void move(tile, { scale: [0.55, 1], rotate: [-14, 0] }, { ...POP, delay: 0.05 });
  draw(tile?.querySelector("svg") ?? null, { delay: 0.1 });
  void rise(root.querySelectorAll(".text > *"), { y: 6, delay: 0.07, gap: 0.04 });
}

/** A newer badge while one is showing: a small nudge and the new content. */
export function badgeSwap(root: HTMLElement) {
  void move(root, { opacity: 1, x: 0, scale: [0.975, 1] }, POP);
  draw(root.querySelector<SVGSVGElement>(".tile svg"), { duration: 0.4 });
  void rise(root.querySelectorAll(".text > *"), { y: 5, gap: 0.03 });
}

/** The badge going: out the way it came. */
export function badgeLeave(root: HTMLElement): Promise<void> {
  return move(root, { opacity: 0, x: 14, scale: 0.98 }, { duration: 0.24, ease: EASE_IN });
}

// ---- The lookalike window ---------------------------------------------------

const WHO: Record<KnownKind, string> = {
  mine: "Your address",
  team: "Team address",
  contact: "Your contact",
  public: "Public label",
  history: "Copied earlier",
};

export type LookalikeHandlers = {
  copy?: () => Promise<unknown>;
  mine?: (label: string) => Promise<unknown>;
  dismiss?: () => void;
};

/** Fill `root` with the lookalike window's content for `view`. `ids` gives
 *  the headline and detail the ids the window's dialog points at; a picture
 *  of the window in another page leaves them off. */
export function fillLookalike(root: HTMLElement, view: LookalikeView, keys: Keys, on: LookalikeHandlers = {}, ids = true) {
  const r = view.recognition;
  const m = r.lookalike;
  root.className = `look-card v${view.variant % 3}`;
  if (!m) {
    clear(root, h("p", { class: "muted" }, "Nothing to compare."));
    return;
  }
  const error = h("div", { class: "error", role: "alert" });
  const fail = (e: unknown) => (error.textContent = e instanceof Error ? e.message : String(e));

  const copyButton = h(
    "button",
    { class: "btn primary", onclick: () => void on.copy?.().catch(fail) },
    icon("copy", 16),
    "Copy the correct address",
    keycaps(keys.fix),
  );
  const actions = h("div", { class: "actions" });
  const showMineForm = () => {
    const input = h("input", { type: "text", placeholder: "Name for this address", "aria-label": "Name for this address" });
    const save = () => void on.mine?.(input.value).catch(fail);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
    });
    clear(actions, copyButton, h("span", { class: "spacer" }), h("div", { class: "mine-form" }, input, h("button", { class: "btn", onclick: save }, "Save as mine")));
    input.focus();
  };
  clear(
    actions,
    copyButton,
    h("button", { class: "btn secondary", onclick: showMineForm }, "This is my address"),
    h("span", { class: "spacer" }),
    h("button", { class: "link dismiss", title: `Dismiss (${keys.dismiss})`, onclick: () => on.dismiss?.() }, "Dismiss"),
  );

  clear(
    root,
    h(
      "div",
      { class: "head" },
      h("div", { class: "sign" }, icon("alert", 22)),
      h(
        "div",
        {},
        h("h1", { class: "headline", ...(ids ? { id: "headline" } : {}) }, r.headline),
        h("p", { class: "detail", ...(ids ? { id: "detail" } : {}) }, ...detailLine(r.detail), chainChip(r.address.chain)),
      ),
    ),
    h(
      "div",
      { class: "rows" },
      h(
        "div",
        { class: "row copied" },
        h("div", { class: "who" }, "You copied", h("small", {}, "differences marked")),
        h("div", {}, addressWithDiff(r.grouped, m.candidate_spans), onchainLine(r.address.text)),
      ),
      h(
        "div",
        { class: "row known" },
        h("div", { class: "who" }, WHO[m.known_kind], m.known_label && h("small", {}, m.known_label)),
        h("div", {}, addressWithDiff(m.known_grouped, m.known_spans), onchainLine(m.known.text)),
      ),
    ),
    actions,
    error,
  );
}

/** Three entrances, so the window never becomes routine. Each ends the
 *  same way: the differing characters light up one run after another. */
export function lookalikeEnter(root: HTMLElement, variant: number) {
  const sign = root.querySelector(".sign");
  const card = root.querySelector(".rows");
  settling();
  if (variant === 0) {
    void move(root, { opacity: [0, 1], y: [-14, 0] }, SPRING);
    void move(sign, { rotate: [0, -10, 8, -4, 0] }, { duration: 0.55, delay: 0.15 });
    void move(card, { opacity: [0, 1], y: [10, 0] }, { ...SPRING, delay: 0.08 });
  } else if (variant === 1) {
    void move(root, { opacity: [0, 1], scale: [0.97, 1] }, SPRING);
    void move(sign, { scale: [0.6, 1] }, { ...POP, delay: 0.05 });
    void move(card, { opacity: [0, 1], y: [-10, 0] }, { ...SPRING, delay: 0.1 });
  } else {
    void move(root, { opacity: [0, 1], x: [-18, 0] }, SPRING);
    void move(sign, { scale: [0.7, 1], rotate: [-12, 0] }, { ...POP, delay: 0.05 });
    void move(card, { opacity: [0, 1], x: [-10, 0] }, { ...SPRING, delay: 0.1 });
  }
  draw(sign?.querySelector("svg") ?? null, { delay: 0.12, duration: 0.5 });
  void rise(root.querySelectorAll(".head > div:last-child > *"), { y: 6, delay: 0.06 });
  // The differences land by colour alone, one run after another: moving
  // them would re-render the dotted underline and make it jump at the end.
  root.classList.remove("lit");
  root.querySelectorAll<HTMLElement>(".addr .diff").forEach((d, i) => (d.style.transitionDelay = `${i * 30}ms`));
  setTimeout(() => root.classList.add("lit"), 380);
  void rise(root.querySelector(".actions"), { y: 8, delay: 0.4 });
}

/** How each entrance leaves: by the way it came. */
export const LOOKALIKE_LEAVE = [{ opacity: 0, y: -14 }, { opacity: 0, scale: 0.97 }, { opacity: 0, x: -18 }] as const;

// ---- The details window -----------------------------------------------------

const SOURCE_LINE: Record<Source, string> = {
  selection: "From your selection",
  clipboard: "Nothing was selected, so this is from the clipboard",
};

export type DetailsHandlers = {
  copy?: () => Promise<unknown>;
  /** Add to the book; the window redraws with what comes back. */
  add?: (label: string, owner: Owner) => Promise<unknown>;
  explorer?: () => Promise<unknown>;
  close?: () => void;
  /** The content changed height (the add form, an error). */
  changed?: () => void;
};

/** Fill `root` with the details window's content for `view`. Returns its
 *  facts, whose on-chain rows fill in as answers arrive. */
export function fillDetails(root: HTMLElement, view: DetailsView, on: DetailsHandlers = {}, ids = true): FactList {
  const r = view.recognition;
  root.className = `details-card k-${r.state}`;
  const known = r.state === "mine" || r.state === "team" || r.state === "contact";

  const error = h("div", { class: "error", role: "alert" });
  const fail = (e: unknown) => {
    error.textContent = e instanceof Error ? e.message : String(e);
    on.changed?.();
  };

  const actions = h("div", { class: "actions" });
  const showAddForm = () => {
    const name = h("input", { type: "text", placeholder: "Name for this address", "aria-label": "Name for this address", value: r.label ?? "" });
    const owner = dropdown({ label: "Whose address", choices: OWNER_CHOICES, value: "me" });
    const save = () => void on.add?.(name.value, owner.value).catch(fail);
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
    });
    clear(actions, h("div", { class: "add-form" }, name, owner.el, h("button", { class: "btn primary", onclick: save }, "Save")));
    on.changed?.();
    name.focus();
    name.select();
  };
  clear(
    actions,
    h("button", { class: "btn primary", onclick: () => void on.copy?.().catch(fail) }, icon("copy", 15), "Copy address"),
    !known && h("button", { class: "btn secondary", onclick: showAddForm }, icon("plusCircle", 15), "Add to book"),
    h("button", { class: "btn secondary", onclick: () => void on.explorer?.().catch(fail) }, icon("globe", 15), "Open in explorer"),
    h("span", { class: "spacer" }),
    h("button", { class: "link dismiss", onclick: () => on.close?.() }, "Close", h("span", { class: "keycaps" }, h("kbd", {}, "Esc"))),
  );

  const facts = factList(r, view.network);
  clear(
    root,
    h(
      "div",
      { class: "head" },
      h("div", { class: "tile" }, icon(STATE_ICON[r.state], 22)),
      h(
        "div",
        {},
        h(
          "div",
          { class: "title" },
          r.emoji && emojiMark(r.emoji, 24),
          h("h1", { class: "headline", ...(ids ? { id: "headline" } : {}) }, r.headline),
          h("span", { class: "word" }, STATE_WORD[r.state]),
        ),
        h("p", { class: "detail" }, ...detailLine(r.detail), chainChip(r.address.chain)),
      ),
    ),
    h("div", { class: "card" }, h("div", { class: "address" }, addressPlain(r.grouped), h("small", {}, SOURCE_LINE[view.source])), facts.el),
    actions,
    error,
  );
  return facts;
}

/** The details window arriving: a gentle lift, its tile popping in. */
export function detailsEnter(root: HTMLElement) {
  settling();
  void move(root, { opacity: [0, 1], y: [10, 0], scale: [0.985, 1] }, SPRING);
  const tile = root.querySelector(".tile");
  void move(tile, { scale: [0.6, 1] }, { ...POP, delay: 0.04 });
  draw(tile?.querySelector("svg") ?? null, { delay: 0.08 });
  void rise(root.querySelectorAll(".head > div:last-child > *, .card, .actions"), { y: 6, delay: 0.05, gap: 0.04 });
}
