import { CHAIN_NAME, short } from "../address";
import { clear, h } from "../dom";
import { icon } from "../icons";
import { ipc, message, on } from "../ipc";
import { animate, EASE_OUT, LEAVE, move, reduced, rise } from "../motion";
import type { Chain, GuardEvent, Overview, TestStep } from "../types";
import { toast } from "../toast";
import { guardSheet } from "./guardSheet";

// Protection: clipper malware waits for you to copy an address and writes
// its own in its place. The guard watches every copy; the test looks for
// one now. What the guard catches lives in the shell's memory until Kenning
// quits, and arrives here live; each catch opens with its details.
//
// Laid out as the Address book and the Journal are: the header with the
// page's one action, a line or a notice for the guard's state, then what
// was caught, by day. How a swap is told apart is said where it is read:
// on each catch, and while nothing is caught yet.

/** The decoy chains, in the order the shell writes them. */
const DECOYS: Chain[] = ["evm", "bitcoin", "tron", "solana"];

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
// The test's steps, shown one at a time: a decoy that a clipper swaps
// comes back within milliseconds, and its step would flash past (the
// count would seem to jump from nothing to 2 of 4). Each decoy stays on
// screen a little while before its answer is shown.
const STEP_MS = 600;
/** How long the shell watches each decoy (guard.rs, `WATCH`): the bar
 *  fills a decoy's share over this time, as the test does. */
const DECOY_S = 1.5;
const queue: TestStep[] = [];
let pumping: Promise<void> | null = null;
/** When the decoy now on screen went out (kept across pumps: its answer
 *  often arrives after the queue ran dry). */
let outAt = 0;

void on<TestStep>("guard-test", (s) => {
  queue.push(s);
  pumping ??= pump().finally(() => (pumping = null));
});

async function pump() {
  while (queue.length) {
    const s = queue.shift()!;
    if (s.clean !== null) {
      const wait = STEP_MS - (performance.now() - outAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    } else outAt = performance.now();
    steps[s.index] = s.clean === null ? "run" : s.clean ? "clean" : "swap";
    redrawTest?.();
  }
}

/** Once every step that arrived has been shown. */
async function shown() {
  while (pumping) await pumping;
}

export async function protectionView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  events ??= await ipc.guardEvents();
  const lastTest = () => events?.find((e) => e.kind === "test");
  const setGuard = async (on: boolean) => {
    try {
      await ipc.saveConfig({ ...overview.config, guard: on });
      toast(on ? "The clipboard guard is on" : "The clipboard guard is off");
      await refresh();
    } catch (e) {
      toast(message(e), "error");
    }
  };

  // ---- The guard: a line under the header while on, as the Check page
  // says what it compares with; a notice with "Turn on" while off, as the
  // Journal does.
  const guard = overview.config.guard
    ? h(
        "p",
        { class: "page-status" },
        icon("shield", 15),
        h("span", {}, "The guard watches every copy. Nothing it reads is kept. "),
        h("button", { type: "button", class: "link", onclick: () => void setGuard(false) }, "Turn off"),
      )
    : h(
        "div",
        { class: "notice off" },
        icon("info", 16),
        h("span", {}, "The clipboard guard is off, so swapped addresses are not caught."),
        h("button", { type: "button", class: "btn", onclick: () => void setGuard(true) }, "Turn on"),
      );

  // ---- The test: its button in the header, its progress and its answer
  // in a notice under it.
  const result = h("div", { class: "test-result", "aria-live": "polite" });
  const runLabel = h("span", {}, "Run the test");
  const run = h("button", { type: "button", class: "btn primary", onclick: () => void start() }, icon("shieldAlert", 16), runLabel);
  // The progress stays one element while the test runs, so its bar glides
  // from step to step instead of being drawn anew at each.
  const progressLine = h("span", {});
  const progressFill = h("i", {});
  const progressBar = h(
    "div",
    { class: "test-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(DECOYS.length), "aria-valuenow": "0" },
    progressFill,
  );
  const progress = h("div", { class: "notice test-progress" }, progressLine, progressBar);
  // The bar runs on through each decoy's watch, as the test itself does,
  // instead of standing still and then jumping a quarter.
  let barAnim: { stop: () => void } | null = null;
  let barTo = -1;
  const fillTo = (to: number, seconds: number) => {
    if (to === barTo) return;
    barTo = to;
    const track = progressBar.getBoundingClientRect().width;
    const from = track ? (progressFill.getBoundingClientRect().width / track) * 100 : 0;
    barAnim?.stop();
    if (reduced() || !progressBar.isConnected || to <= from) {
      progressFill.style.width = `${to}%`;
      return;
    }
    barAnim = animate(progressFill, { width: [`${from}%`, `${to}%`] }, { duration: seconds, ease: "linear" });
  };

  const drawTest = () => {
    // While running: which decoy is out, as a count and a bar (a few
    // seconds, a series of steps). After: the last result.
    const t = lastTest();
    run.toggleAttribute("disabled", running);
    runLabel.textContent = running ? "Testing…" : t ? "Run it again" : "Run the test";
    if (running) {
      const done = steps.filter((s) => s === "clean" || s === "swap").length;
      const out = steps.indexOf("run");
      progressLine.textContent =
        out >= 0
          ? `Checking the ${CHAIN_NAME[DECOYS[out]]} decoy, ${out + 1} of ${DECOYS.length}…`
          : done === DECOYS.length
            ? "Putting your clipboard back…"
            : "Putting decoy addresses on the clipboard…";
      progressBar.setAttribute("aria-valuenow", String(done));
      if (progress.parentNode !== result) void morph(result, progress);
      // A decoy out: its share fills over its watch. An answer that came
      // early leaves the bar running on into the next one, never back.
      fillTo((Math.max(done, out + 1) / DECOYS.length) * 100, DECOY_S);
      return;
    }
    if (!t || t.kind !== "test") return void morph(result);
    if (!t.swaps.length) {
      return void morph(
        result,
        h(
          "div",
          { class: "notice test-clean" },
          icon("checkCircle", 16),
          h("span", {}, `All ${t.checked} decoys came back untouched at ${timeFmt.format(new Date(t.at))}. A clipper that waits can still hide, so keep the guard on.`),
        ),
      );
    }
    void morph(
      result,
      h(
        "div",
        { class: "test-swapped", role: "alert" },
        icon("alert", 16),
        h("strong", {}, "Something on this computer swaps addresses"),
        h(
          "p",
          {},
          `${t.swaps.length === 1 ? "One" : t.swaps.length} of ${t.checked} decoys came back changed. Do not send crypto from this computer until it is clean.`,
        ),
        h("button", { type: "button", class: "btn", onclick: () => guardSheet(t, { retest: () => void start() }) }, "See what happened"),
      ),
    );
  };

  const start = async () => {
    if (running) return;
    running = true;
    steps = DECOYS.map(() => "wait");
    barAnim?.stop();
    barTo = -1;
    progressFill.style.width = "0%";
    redrawTest?.();
    try {
      await ipc.runClipboardTest();
      // The answer waits for the last steps to have been shown.
      await shown();
    } catch (e) {
      toast(message(e), "error");
    } finally {
      running = false;
      redrawTest?.();
    }
  };

  // ---- What was caught: by day, as the Journal lists its records.
  const list = h("div", {});
  const drawList = (fresh?: GuardEvent) => {
    const caught = (events ?? []).filter((e) => e.kind !== "test" || e.swaps.length);
    if (!caught.length) {
      return clear(
        list,
        h(
          "div",
          { class: "empty rich" },
          h("span", { class: "ic" }, icon("shield", 20)),
          h("strong", {}, "Nothing caught"),
          h(
            "span",
            {},
            "Kenning flags a new address written right after your copy by another program, with no key or click in between, or one made to look like yours.",
          ),
        ),
      );
    }
    const open = (e: GuardEvent) => guardSheet(e, e.kind === "test" ? { retest: () => void start() } : {});
    const days = new Map<string, GuardEvent[]>();
    for (const e of caught) {
      const name = dayName(new Date(e.at));
      days.set(name, [...(days.get(name) ?? []), e]);
    }
    clear(
      list,
      [...days].map(([name, es]) => h("section", { class: "day" }, h("h2", {}, name), h("ul", { class: "entries" }, es.map((e) => row(e, () => open(e)))))),
    );
    if (fresh) void rise(list.querySelectorAll(".entry:first-child"), { y: 6 });
  };

  clear(
    main,
    h(
      "header",
      {},
      h("h1", {}, "Protection"),
      h("span", { class: "spacer" }),
      run,
      h(
        "p",
        { class: "lead" },
        "Clipper malware swaps the address you copy for one of its own. The test puts decoys on the clipboard to find one now; the guard watches every copy.",
      ),
    ),
    guard,
    result,
    list,
  );

  redrawTest = () => (result.isConnected ? drawTest() : (redrawTest = null));
  redrawList = (fresh) => (list.isConnected ? drawList(fresh) : (redrawList = null));
  drawTest();
  drawList();
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** "Today", "Yesterday", or the date, as the Journal names its days. */
function dayName(d: Date): string {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : dayFmt.format(d);
}

/** Put `content` in `box` without a jump: the box grows or shrinks to it
 *  while it fades in. On a page not yet on screen, it is simply put. */
async function morph(box: HTMLElement, ...content: HTMLElement[]) {
  const from = box.isConnected ? box.getBoundingClientRect().height : 0;
  // What was there leaves first, the way the new arrives (a fade), so the
  // change never cuts.
  if (box.isConnected && box.children.length && !reduced()) await move(box.children, { opacity: 0 }, LEAVE);
  clear(box, ...content);
  if (!box.isConnected || reduced()) return;
  const to = box.getBoundingClientRect().height;
  if (Math.abs(to - from) < 1) return;
  box.style.overflow = "hidden";
  await Promise.all([
    move(box, { height: [`${from}px`, `${to}px`] }, { duration: 0.34, ease: EASE_OUT }),
    content.length ? move(content, { opacity: [0, 1] }, { duration: 0.28, delay: 0.06 }) : Promise.resolve(),
  ]);
  box.style.height = "";
  box.style.overflow = "";
}

/** One catch: what happened, in a line; a click opens its details. */
function row(e: GuardEvent, open: () => void): HTMLElement {
  const at = h("span", { class: "when" }, h("time", { datetime: e.at }, timeFmt.format(new Date(e.at))));
  const item = (title: string, line: (Node | string | null)[]) =>
    h(
      "li",
      {
        class: "entry",
        tabindex: "0",
        title: "Show details",
        onclick: open,
        onkeydown: (ev: KeyboardEvent) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          open();
        },
      },
      h("span", { class: "ic tone-look" }, icon("alert", 16)),
      h("span", { class: "who" }, h("strong", {}, title), h("span", { class: "line" }, ...line)),
      h("span", { class: "meta" }),
      at,
    );

  switch (e.kind) {
    case "swap": {
      const chain = CHAIN_NAME[e.chain];
      return item(`${e.process ?? "A program with no window"} swapped ${/^[AEIOU]/.test(chain) ? "an" : "a"} ${chain} address`, [
        h("span", { class: "addr", title: e.copied }, short(e.copied)),
        " became ",
        h("span", { class: "addr tone-look", title: e.found }, short(e.found)),
      ]);
    }
    case "secret":
      return item(`${e.what[0].toUpperCase()}${e.what.slice(1)} was on the clipboard`, [e.process ? `Copied from ${e.process}` : null]);
    case "test":
      return item("The clipboard test caught a swap", [e.swaps.map((s) => `${CHAIN_NAME[s.chain]}${s.process ? ` by ${s.process}` : ""}`).join(", ")]);
  }
}
