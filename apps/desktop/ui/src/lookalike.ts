// The lookalike window: shows exactly what matches and what differs, offers
// one big fix ("Copy the correct address") and one small way out ("This is
// mine"). It never closes by itself.

import { addressWithDiff, CHAIN_NAME } from "./address";
import { $, clear, h } from "./dom";
import { icon } from "./icons";
import { ipc, message, on } from "./ipc";
import { draw, move, POP, rise, SPRING, stagger } from "./motion";
import { titlebar } from "./titlebar";
import { onchainLine } from "./onchain";
import { playFor } from "./sound";
import type { KnownKind, LookalikeView } from "./types";

const root = $("#lookalike");
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
    h("button", { class: "link", onclick: showMineForm }, "This is my address"),
    h("span", { class: "spacer" }),
    h("button", { class: "link muted", onclick: () => ipc.dismissLookalike() }, "Dismiss"),
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
        h("p", { id: "detail" }, r.detail, " · ", CHAIN_NAME[r.address.chain]),
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
  copyButton.focus();
  if (view.sounds) playFor("lookalike");
  choreograph(view.variant % 3);
}

/** Three entrances, so the window never becomes routine. Each ends the
 *  same way: the differing characters light up one run after another. */
function choreograph(variant: number) {
  const sign = root.querySelector(".sign");
  const rows = root.querySelectorAll(".row");
  if (variant === 0) {
    void move(root, { opacity: [0, 1], y: [-18, 0] }, SPRING);
    void move(sign, { rotate: [0, -12, 10, -6, 4, 0] }, { duration: 0.6, delay: 0.15 });
    void rise(rows, { y: 12, delay: 0.08, gap: 0.08 });
  } else if (variant === 1) {
    void move(root, { opacity: [0, 1], scale: [0.95, 1] }, SPRING);
    void move(sign, { scale: [0.4, 1.12, 1] }, { ...POP, delay: 0.05 });
    void rise(rows, { y: -12, delay: 0.1, gap: 0.08 });
  } else {
    void move(root, { opacity: [0, 1], x: [-24, 0] }, SPRING);
    void move(sign, { scale: [0.6, 1], rotate: [-20, 0] }, { ...POP, delay: 0.05 });
    void move(rows, { opacity: [0, 1], x: [-14, 0] }, { ...SPRING, delay: 0.1 });
  }
  draw(sign?.querySelector("svg") ?? null, { delay: 0.12, duration: 0.6 });
  void rise(root.querySelectorAll(".head > div:last-child > *"), { y: 6, delay: 0.06 });
  void move(root.querySelectorAll(".addr .diff"), { opacity: [0.25, 1], y: [-3, 0] }, { ...POP, delay: stagger(0.035, { startDelay: 0.35 }) });
  void rise(root.querySelector(".actions"), { y: 8, delay: 0.45 });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") void ipc.dismissLookalike();
});

void on<null>("lookalike", () => void ipc.getLookalike().then(render));
void ipc.getLookalike().then(render);
