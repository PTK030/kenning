// What the clipboard guard caught, in a sheet over the Protection page:
// what happened in one sentence, the facts, why Kenning took it for a
// swap, and what to do now. The reasons are said here, on the event, and
// not only in the settings, where few read them.

import { CHAIN_NAME } from "../address";
import { clear, h } from "../dom";
import { icon } from "../icons";
import { ipc, message } from "../ipc";
import { modal } from "../modal";
import type { Clue, GuardEvent } from "../types";

const CLUE: Record<Clue, string> = {
  no_input: "No key or click came between your copy and the change.",
  background: "Another program wrote it, not the app you were using.",
  looks_alike: "It starts or ends with the same characters as yours.",
};

/** After a swap, in the order to do them. Where to find a thing is said
 *  in the sentence, as in Microsoft's guidance for text in the UI, not as
 *  a documentation-style "A › B › C" line of its own. */
const AFTER_SWAP = [
  "Do not send crypto from this computer until it is clean.",
  "Scan it with Microsoft Defender Offline, in Windows Security under Virus & threat protection, Scan options.",
  "If your recovery phrase was ever typed or kept here, move your funds to a new wallet made on another device.",
];

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? "Today" : dayFmt.format(d)}, ${timeFmt.format(d)}`;
}

const an = (word: string) => (/^[AEIOU]/.test(word) ? "an" : "a");
const fact = (label: string, ...value: (Node | string | null | false)[]) => [h("dt", {}, label), h("dd", {}, ...value)];
const addr = (text: string, cls = "") => h("span", { class: `addr ${cls}`.trim() }, text);

/** Show `e`. `retest` runs the clipboard test again (the test's sheet only). */
export function guardSheet(e: GuardEvent, opts: { retest?: () => void } = {}) {
  const error = h("div", { class: "error", role: "alert" });

  /** The program, its file under it, and the way to that file. */
  const writer = (process: string | null, path: string | null) => [
    h("strong", {}, process ?? "A program with no window"),
    path && h("span", { class: "path" }, path),
    path &&
      h(
        "button",
        {
          type: "button",
          class: "link",
          onclick: () => ipc.showCaughtFile(path).catch((err) => clear(error, h("div", { class: "notice error" }, message(err)))),
        },
        "Show the file",
      ),
  ];

  let title: string;
  let summary: string;
  const body: (HTMLElement | null)[] = [];
  let steps: string[];

  switch (e.kind) {
    case "swap": {
      const chain = CHAIN_NAME[e.chain];
      const after = e.after_ms < 1000 ? `${e.after_ms} ms` : `${(e.after_ms / 1000).toFixed(1)} s`;
      title = "A program swapped the address you copied";
      summary = `You copied ${an(chain)} ${chain} address. ${after} later, ${e.process ?? "a program with no window"} put a different one in its place.`;
      body.push(
        h(
          "dl",
          { class: "fact-list" },
          fact("You copied", addr(e.copied)),
          fact("Replaced with", addr(e.found, "tone-look")),
          fact("Written by", ...writer(e.process, e.path)),
          fact("When", when(e.at)),
        ),
        h("div", { class: "guard-why" }, h("h3", {}, "Why Kenning took it for a swap"), h("ul", {}, e.clues.map((c) => h("li", {}, CLUE[c])))),
      );
      steps = AFTER_SWAP;
      break;
    }
    case "secret":
      title = `${e.what[0].toUpperCase()}${e.what.slice(1)} was on the clipboard`;
      summary = "While it was there, any program running on this computer could read it. Kenning did not keep it.";
      body.push(h("dl", { class: "fact-list" }, fact("Copied from", ...writer(e.process, e.path)), fact("When", when(e.at))));
      steps = [
        "Paste it only where you mean to, then clear the clipboard.",
        "If a swap or the clipboard test has ever flagged this computer, treat it as exposed: move your funds to a new wallet made on another device.",
      ];
      break;
    case "test":
      title = "The clipboard test caught a swap";
      summary = `Kenning put ${e.checked} decoy addresses on the clipboard, and something wrote over ${e.swaps.length === 1 ? "one" : e.swaps.length} of them. The decoys are not real addresses; nothing was sent.`;
      body.push(
        ...e.swaps.map((s) =>
          h(
            "dl",
            { class: "fact-list" },
            fact("Network", CHAIN_NAME[s.chain]),
            fact("Decoy", addr(s.wrote)),
            fact("Came back as", s.found ? addr(s.found, "tone-look") : h("span", { class: "muted" }, "Other text")),
            fact("Written by", ...writer(s.process, s.path)),
          ),
        ),
        h("p", { class: "guard-when muted small" }, when(e.at)),
      );
      steps = AFTER_SWAP;
      break;
  }

  const titleId = `sheet-${Math.random().toString(36).slice(2)}`;
  const card = h(
    "section",
    { class: "sheet-card guard-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h("header", { class: "guard-sheet-head" }, h("span", { class: "guard-sign" }, icon("alert", 20)), h("h2", { id: titleId }, title)),
    h("p", { class: "guard-summary" }, summary),
    h("div", { class: "guard-facts" }, ...body),
    h(
      "div",
      { class: "guard-steps" },
      h("h3", {}, "What to do now"),
      h(
        "ol",
        {},
        steps.map((text, i) => h("li", {}, h("span", { class: "n", "aria-hidden": "true" }, String(i + 1)), h("span", {}, text))),
      ),
    ),
    error,
    h(
      "div",
      { class: "sheet-actions" },
      opts.retest &&
        h(
          "button",
          {
            type: "button",
            class: "btn",
            onclick: async () => {
              await sheet.close();
              opts.retest?.();
            },
          },
          "Run the test again",
        ),
      h("span", { class: "spacer" }),
      h("button", { type: "button", class: "btn", onclick: () => void sheet.close() }, "Close"),
    ),
  );
  // Nothing to lose here: a click beside it puts it away too.
  const sheet = modal(
    card,
    () => void sheet.close(),
    () => void sheet.close(),
  );
  card.querySelector<HTMLButtonElement>(".sheet-actions .btn:last-child")?.focus();
}
