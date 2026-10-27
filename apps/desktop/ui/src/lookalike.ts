// The lookalike window: shows exactly what matches and what differs, offers
// one big fix ("Copy the correct address") and one small way out ("This is
// mine"). It never closes by itself.

import { addressWithDiff, chainChip, detailLine } from "./address";
import { $, clear, h } from "./dom";
import { icon } from "./icons";
import { ipc, message, on } from "./ipc";
import { draw, move, POP, rise, settling, SPRING } from "./motion";
import { titlebar } from "./titlebar";
import { DEFAULT_KEYS, keycaps, matches } from "./shortcuts";
import type { Keys } from "./types";
import { onchainLine } from "./onchain";
import { playFor } from "./sound";
import type { KnownKind, LookalikeView } from "./types";
import "./guard";

const root = $("#lookalike");
/** The window's keys, from the config (Alt+C and Alt+D by default). */
let keys: Keys = DEFAULT_KEYS;
$("#chrome").replaceWith(
  titlebar({ title: "Not the address you know", sign: "alert", onClose: () => ipc.dismissLookalike() }).el,
);

const WHO: Record<KnownKind, string> = {
  mine: "Your address",
  team: "Team address",
  contact: "Your contact",
  public: "Public label",
  history: "Copied earlier",
};

function render(view: LookalikeView | null) {
  if (!view?.recognition.lookalike) {
    clear(root, h("p", { class: "muted" }, "Nothing to compare."));
    return;
  }
  const r = view.recognition;
  const m = view.recognition.lookalike;
  root.className = `v${view.variant}`;

  const error = h("div", { class: "error", role: "alert" });
  const fail = (e: unknown) => (error.textContent = message(e));

  const copyButton = h(
    "button",
    {
      class: "btn primary",
      onclick: () => ipc.copyCorrect().catch(fail),
    },
    icon("copy", 16),
    "Copy the correct address",
    keycaps(keys.fix),
  );

  const actions = h("div", { class: "actions" });
  const showMineForm = () => {
    const input = h("input", {
      type: "text",
      placeholder: "Name for this address",
      "aria-label": "Name for this address",
    });
    const save = () => ipc.markMine(input.value).catch(fail);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void save();
    });
    clear(
      actions,
      copyButton,
      h("span", { class: "spacer" }),
      h(
        "div",
        { class: "mine-form" },
        input,
        h("button", { class: "btn", onclick: save }, "Save as mine"),
      ),
    );
    input.focus();
  };
  clear(
    actions,
    copyButton,
    h("button", { class: "btn secondary", onclick: showMineForm }, "This is my address"),
    h("span", { class: "spacer" }),
    h("button", { class: "link dismiss", title: `Dismiss (${keys.dismiss})`, onclick: () => ipc.dismissLookalike() }, "Dismiss"),
  );

  const knownName = m.known_label ? m.known_label : "";
  clear(
    root,
    h(
      "div",
      { class: "head" },
      h("div", { class: "sign" }, icon("alert", 22)),
      h(
        "div",
        {},
        h("h1", { id: "headline" }, r.headline),
        h("p", { id: "detail" }, ...detailLine(r.detail), chainChip(r.address.chain)),
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
        h("div", { class: "who" }, WHO[m.known_kind], knownName && h("small", {}, knownName)),
        h("div", {}, addressWithDiff(m.known_grouped, m.known_spans), onchainLine(m.known.text)),
      ),
    ),
    actions,
    error,
  );
  // Focus the window, not the button: a stray Enter while you were typing
  // must not act on a warning. The fix has its own key.
  root.focus();
  if (view.sounds) playFor("lookalike");
  choreograph(view.variant % 3);
}

/** Three entrances, so the window never becomes routine. Each ends the
 *  same way: the differing characters light up one run after another. */
function choreograph(variant: number) {
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

document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement | null)?.closest("input")) return;
  if (matches(e, keys.fix)) {
    e.preventDefault();
    root.querySelector<HTMLButtonElement>(".actions .primary")?.click();
  } else if (matches(e, keys.dismiss)) {
    e.preventDefault();
    void ipc.dismissLookalike();
  }
});

void on<null>("lookalike", () => void ipc.getLookalike().then(render));
root.tabIndex = -1;
void ipc
  .overview()
  .then((o) => (keys = { ...DEFAULT_KEYS, ...o.config.keys }))
  .catch(() => undefined)
  .finally(() => void ipc.getLookalike().then(render));
