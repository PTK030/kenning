import { CHAIN_NAME, short } from "../address";
import { clear, h } from "../dom";
import { icon, type IconName } from "../icons";
import { ipc, message, on } from "../ipc";
import { rise } from "../motion";
import type { Chain, Clue, GuardEvent, Overview, TestStep } from "../types";
import { toast } from "../toast";
import { card, toggleRow } from "./settings";

// Protection: clipper malware waits for you to copy an address and writes
// its own in its place. The test looks for one now; the guard watches every
// copy. What the guard catches lives in the shell's memory until Kenning
// quits, and arrives here live.

/** The decoy chains, in the order the shell writes them. */
const DECOYS: Chain[] = ["evm", "bitcoin", "tron", "solana"];

const CLUE_TEXT: Record<Clue, string> = {
  no_input: "no key or click before it",
  background: "written by a program in the background",
  looks_alike: "made to look like yours",
};

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Kept across redraws (a refresh after the switch must not lose a run). */
let events: GuardEvent[] | null = null;
let running = false;
/** Per decoy: not yet, out on the clipboard, came back, or swapped. */
let steps: ("wait" | "run" | "clean" | "swap")[] = DECOYS.map(() => "wait");
/** Redraw hooks of the view on screen, if any. */
let redrawTest: (() => void) | null = null;
let redrawList: ((fresh?: GuardEvent) => void) | null = null;

void on<GuardEvent>("guard", (e) => {
  events = [e, ...(events ?? [])];
  redrawList?.(e);
});
void on<TestStep>("guard-test", (s) => {
  steps[s.index] = s.clean === null ? "run" : s.clean ? "clean" : "swap";
  redrawTest?.();
});

export async function protectionView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  events ??= await ipc.guardEvents();
  const lastTest = () => events?.find((e) => e.kind === "test");

  // ---- The test ----------------------------------------------------------
  const chips = h("div", { class: "decoys" });
  const result = h("div", { class: "test-result" });
  const run = h("button", { class: "btn primary", onclick: () => void start() }, icon("shield", 16), "Run the test");

  const drawTest = () => {
    // While running, each chip follows its decoy; after, the last result.
    const t = lastTest();
    const state = (chain: Chain, i: number) =>
      running || !t || t.kind !== "test" ? steps[i] : t.swaps.some((s) => s.chain === chain) ? "swap" : "clean";
    clear(
      chips,
      DECOYS.map((chain, i) =>
        h("span", { class: "decoy", "data-state": state(chain, i) }, h("span", { class: "dot", "aria-hidden": "true" }), CHAIN_NAME[chain]),
      ),
    );
    run.toggleAttribute("disabled", running);
    run.lastChild!.textContent = running ? "Testing…" : t ? "Run it again" : "Run the test";
    if (running || !t || t.kind !== "test") return clear(result);
    if (!t.swaps.length) {
      return clear(
        result,
        h(
          "p",
          { class: "test-clean" },
          icon("checkCircle", 16),
          h("span", {}, h("strong", {}, `Nothing swapped the ${t.checked} decoys.`), ` No clipper acted on this computer at ${timeFmt.format(new Date(t.at))}. One that waits, or watches only some apps, can still hide: keep the guard on.`),
        ),
      );
    }
    clear(
      result,
      h(
        "div",
        { class: "notice error test-swapped" },
        h("strong", {}, `Something on this computer swaps addresses. Do not send crypto from it until it is cleaned.`),
        h(
          "ul",
          {},
          t.swaps.map((s) =>
            h(
              "li",
              {},
              `${CHAIN_NAME[s.chain]}: `,
              s.found ? h("span", { class: "addr", title: s.found }, short(s.found)) : "other text",
              ` written over the decoy${s.process ? ` by ${s.process}` : ""}.`,
            ),
          ),
        ),
      ),
    );
  };

  const start = async () => {
    if (running) return;
    running = true;
    steps = DECOYS.map(() => "wait");
    redrawTest?.();
    try {
      await ipc.runClipboardTest();
    } catch (e) {
      toast(message(e), "error");
    } finally {
      running = false;
      redrawTest?.();
      void rise(result.children, { y: 6 });
    }
  };

  // ---- The guard ---------------------------------------------------------
  const list = h("div", { class: "guard-list" });
  const drawList = (fresh?: GuardEvent) => {
    const shown = (events ?? []).filter((e) => e.kind !== "test" || e.swaps.length);
    if (!shown.length) {
      return clear(
        list,
        h(
          "div",
          { class: "empty rich" },
          h("span", { class: "ic" }, icon("shield", 20)),
          h("strong", {}, "Nothing caught"),
          h("span", {}, overview.config.guard ? "Swapped addresses and secrets left on the clipboard appear here until Kenning quits." : "Turn the guard on and what it catches appears here."),
        ),
      );
    }
    clear(list, h("ul", { class: "entries" }, shown.map(row)));
    if (fresh) void rise(list.querySelectorAll(".entry:first-child"), { y: 6 });
  };

  const guard = toggleRow(
    "clipboard",
    "Watch every copy",
    "Looks at each clipboard change the moment it happens. It keeps nothing it reads; only what it catches is listed below.",
    overview.config.guard,
    async (guard) => {
      try {
        await ipc.saveConfig({ ...overview.config, guard });
        toast(guard ? "The clipboard guard is on" : "The clipboard guard is off");
        await refresh();
      } catch (e) {
        toast(message(e), "error");
      }
    },
  );

  const sign = (ic: IconName, title: string, text: string) =>
    h("li", {}, h("span", { class: "ic" }, icon(ic, 15)), h("span", {}, h("strong", {}, title), " ", text));

  clear(
    main,
    h(
      "header",
      {},
      h("h1", {}, "Protection"),
      h(
        "p",
        { class: "lead" },
        "Clipper malware waits for you to copy an address and writes its own in its place, often one with the same first and last characters. Test this computer for one, and let Kenning watch for it.",
      ),
    ),
    card(
      "shieldAlert",
      "Clipboard test",
      "Kenning puts a decoy address of each network on the clipboard and watches whether anything writes over it. It takes about six seconds, and your clipboard is put back afterwards.",
      h("div", { class: "test-row" }, chips, run),
      result,
    ),
    card(
      "shield",
      "Clipboard guard",
      "Warns when an address you copied is replaced behind your back, and when a recovery phrase or private key sits on the clipboard.",
      guard,
      h(
        "div",
        { class: "guard-how" },
        h("p", { class: "muted small" }, "A swap is a different address of the same network written right after yours, with at least one sign of a program at work:"),
        h(
          "ul",
          {},
          sign("keyboard", "No key or click", "between your copy and the change. You copy with a key or a click; a program does not."),
          sign("layers", "Another program wrote it,", "not the app you are using, or one with no window at all."),
          sign("alert", "It looks like yours:", "same first or last characters, the way poisoning tools grind them."),
        ),
      ),
    ),
    h("section", { class: "guard-caught" }, h("h2", {}, "What it caught"), list),
  );

  redrawTest = () => (chips.isConnected ? drawTest() : (redrawTest = null));
  redrawList = (fresh) => (list.isConnected ? drawList(fresh) : (redrawList = null));
  drawTest();
  drawList();
}

function row(e: GuardEvent): HTMLElement {
  const at = h("span", { class: "when" }, h("time", { datetime: e.at }, timeFmt.format(new Date(e.at))));
  const item = (ic: IconName, tone: string, title: string, line: (Node | string | null)[], why?: string) =>
    h(
      "li",
      { class: "entry static" },
      h("span", { class: `ic tone-${tone}` }, icon(ic, 16)),
      h("span", { class: "who" }, h("strong", {}, title), h("span", { class: "line" }, ...line), why && h("span", { class: "why" }, why)),
      h("span", { class: "meta" }),
      at,
    );

  switch (e.kind) {
    case "swap": {
      const chain = CHAIN_NAME[e.chain];
      const after = e.after_ms < 1000 ? `${e.after_ms} ms` : `${(e.after_ms / 1000).toFixed(1)} s`;
      const why = e.clues.map((c) => CLUE_TEXT[c]).join(", ");
      return item(
        "alert",
        "look",
        `${e.process ?? "A program with no window"} swapped ${/^[AEIOU]/.test(chain) ? "an" : "a"} ${chain} address`,
        [
          h("span", { class: "addr", title: e.copied }, short(e.copied)),
          " became ",
          h("span", { class: "addr tone-look", title: e.found }, short(e.found)),
          ` ${after} later`,
        ],
        `${why[0].toUpperCase()}${why.slice(1)}.`,
      );
    }
    case "secret":
      return item("alert", "look", `${e.what[0].toUpperCase()}${e.what.slice(1)} was on the clipboard`, [e.process ? `copied from ${e.process}` : null]);
    case "test":
      return item("shieldAlert", "look", "The clipboard test caught a swap", [
        e.swaps.map((s) => `${CHAIN_NAME[s.chain]}${s.process ? ` by ${s.process}` : ""}`).join(", "),
      ]);
  }
}
