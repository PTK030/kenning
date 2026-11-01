import { short, STATE_WORD } from "../address";
import { clear, h } from "../dom";
import { icon, type IconName } from "../icons";
import { ipc, message } from "../ipc";
import { fold, rise, sink } from "../motion";
import type { JournalRecord, Overview, State } from "../types";
import { segmented } from "../segmented";
import { addressSheet } from "./addressSheet";
import { toast } from "../toast";

/** One record in words: what happened, to which address. The tile carries
 *  the colour; the sentence carries the meaning. */
type Said = { icon: IconName; tone: string; title: string; address: string; addressTone?: string; note?: string; instead?: string };

function describe(r: JournalRecord): Said {
  const name = r.label ? `“${r.label}”` : null;
  switch (r.action) {
    case "lookalike_shown":
      // `address` is the lookalike that was copied.
      return { icon: "alert", tone: "look", title: `Caught a lookalike of ${name ?? "a known address"}`, address: r.address, addressTone: "look", note: "copied" };
    case "copied_correct":
      // `address` is still the lookalike; `related` is the right one.
      return {
        icon: "copy",
        tone: "mine",
        title: `Put the correct ${name ?? "address"} on the clipboard`,
        address: r.related ?? r.address,
        instead: r.related ? r.address : undefined,
      };
    case "marked_mine":
      return { icon: "checkCircle", tone: "mine", title: `Marked as yours${name ? `: ${name}` : ""}`, address: r.address };
    case "added":
      return { icon: "plusCircle", tone: "mine", title: `Added ${name ?? "an address"} to the book`, address: r.address };
    case "edited":
      return { icon: "pencil", tone: "plain", title: `Edited ${name ?? "an address"} in the book`, address: r.address };
    case "removed":
      return { icon: "x", tone: "plain", title: `Removed ${name ?? "an address"} from the book`, address: r.address };
    default:
      return { icon: "search", tone: "brand", title: name ? `Checked ${name}` : "Checked an address", address: r.address };
  }
}

const FILTERS: { id: string; label: string; keep: (r: JournalRecord) => boolean }[] = [
  { id: "all", label: "All", keep: () => true },
  { id: "lookalikes", label: "Lookalikes", keep: (r) => r.action === "lookalike_shown" || r.action === "copied_correct" },
  { id: "book", label: "Book changes", keep: (r) => r.action === "added" || r.action === "edited" || r.action === "removed" || r.action === "marked_mine" },
];

const STATES = new Set<string>(["mine", "team", "contact", "public", "lookalike", "seen", "new"]);
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Records saying the same thing one after another (the same address
 *  checked again and again) are one row with a count. */
type Run = { r: JournalRecord; times: number };

const sameRecord = (a: JournalRecord, b: JournalRecord) =>
  a.action === b.action && a.address === b.address && a.state === b.state && a.label === b.label && a.related === b.related && a.user === b.user;

function runs(rs: JournalRecord[]): Run[] {
  const out: Run[] = [];
  for (const r of rs) {
    const last = out[out.length - 1];
    if (last && sameRecord(last.r, r)) last.times++;
    else out.push({ r, times: 1 });
  }
  return out;
}

/** Whether a record matches the search: what it says, its addresses, who. */
const found = (r: JournalRecord, q: string) =>
  [describe(r).title, r.address, r.related ?? "", r.user, r.label ?? ""].some((t) => t.toLowerCase().includes(q));

/** Days opened or folded by hand, while Kenning runs. Otherwise the newest
 *  day is open and the rest are folded to their heading. */
const opened = new Map<string, boolean>();
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** "Today", "Yesterday", or the date. */
function dayName(d: Date): string {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : dayFmt.format(d);
}

export async function journalView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  // A record opens over the journal; a change made from there redraws it.
  const show = (address: string) =>
    addressSheet(address, { network: overview.config.network, watching: overview.config.clipboard === "watch", changed: refresh });
  const records = await ipc.journal(500);
  let filter = FILTERS[0];
  const list = h("div");
  const search = h("input", { type: "search", placeholder: "Search by name, address or who", "aria-label": "Search the journal" });
  search.addEventListener("input", () => draw());
  let turn = 0;
  const tabs = segmented(
    "Show",
    FILTERS.map((f) => ({ value: f, label: f.label })),
    filter,
    async (f) => {
      // The rows shown leave the way they came before the others arrive;
      // only the last of quick clicks is drawn.
      filter = f;
      const mine = ++turn;
      // Whole days, cards and all: rows alone left the cards to vanish.
      await sink(list.querySelectorAll(".day, .empty"), { y: 6 });
      if (mine === turn) draw(true);
    },
  );

  /** One day: a heading that folds it, with how many records it holds,
   *  and its rows. While searching, every day with a match is open. */
  const daySection = (key: string, name: string, rs: JournalRecord[], newest: boolean, q: string) => {
    const body = h("ul", { class: "entries" }, runs(rs).map((run) => row(run.r, show, run.times)));
    const toggle = h(
      "button",
      { type: "button", class: "group-toggle day-toggle" },
      icon("chevronDown", 16, "chev"),
      h("span", { class: "group-name" }, name),
      h("span", { class: "muted" }, `${rs.length}`),
    );
    fold(toggle, body, q ? true : (opened.get(key) ?? newest), false);
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      if (!q) opened.set(key, open);
      fold(toggle, body, open);
    });
    return h("section", { class: "day" }, toggle, body);
  };

  const draw = (animate = false) => {
    const q = search.value.trim().toLowerCase();
    const shown = records.filter((r) => filter.keep(r) && (!q || found(r, q)));
    if (!records.length) return clear(list, emptyJournal());
    if (!shown.length) {
      return clear(list, h("div", { class: "empty" }, q ? `No record matches “${search.value.trim()}”.` : "Nothing of this kind yet."));
    }
    // Newest first, one card per day.
    const days = new Map<string, { name: string; rs: JournalRecord[] }>();
    for (const r of shown) {
      const d = new Date(r.at);
      const day = days.get(dayKey(d)) ?? { name: dayName(d), rs: [] };
      day.rs.push(r);
      days.set(dayKey(d), day);
    }
    clear(
      list,
      [...days].map(([key, day], i) => daySection(key, day.name, day.rs, i === 0, q)),
    );
    if (animate) void rise(list.querySelectorAll(".day-toggle, .entry"), { y: 6, gap: 0.02 });
  };

  const off = !overview.config.journal;
  clear(
    main,
    h(
      "header",
      {},
      h("h1", {}, "Journal"),
      h("span", { class: "spacer" }),
      records.length ? tabs : null,
      h("p", { class: "lead" }, "A local record of what was checked, by whom and when. Useful when a second signer asks how you verified a payout."),
    ),
    records.length ? h("label", { class: "search" }, icon("search", 16), search) : null,
    off &&
      h(
        "div",
        { class: "notice off" },
        icon("info", 16),
        h("span", {}, "The journal is off, so nothing new is recorded."),
        h(
          "button",
          {
            class: "btn",
            onclick: async () => {
              try {
                await ipc.saveConfig({ ...overview.config, journal: true });
                toast("The journal is on");
                await refresh();
              } catch (e) {
                toast(message(e), "error");
              }
            },
          },
          "Turn on",
        ),
      ),
    list,
  );
  draw(true);
}

function row(r: JournalRecord, show: (address: string) => Promise<void>, times = 1): HTMLElement {
  const s = describe(r);
  const at = new Date(r.at);
  // Details of the address the row shows: for a correction, the right one.
  const details = () => show(s.address).catch((e) => toast(message(e), "error"));
  // A check keeps its answer, as a plain word; the other actions say it.
  const answer = r.action === "checked" && STATES.has(r.state) ? STATE_WORD[r.state as State] : null;
  return h(
    "li",
    {
      class: "entry",
      tabindex: "0",
      title: "Show details",
      onclick: details,
      onkeydown: (ev: KeyboardEvent) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        void details();
      },
    },
    h("span", { class: `ic tone-${s.tone}` }, icon(s.icon, 16)),
    h(
      "span",
      { class: "who" },
      h("strong", {}, s.title, times > 1 && h("span", { class: "times" }, `×${times}`)),
      h(
        "span",
        { class: "line" },
        s.note && `${s.note} `,
        h("span", { class: `addr${s.addressTone ? ` tone-${s.addressTone}` : ""}`, title: s.address }, short(s.address)),
        s.instead && " instead of ",
        s.instead && h("span", { class: "addr tone-look", title: s.instead }, short(s.instead)),
      ),
    ),
    h("span", { class: "meta" }, answer && h("span", { class: "answer" }, answer)),
    h("span", { class: "when" }, h("time", { datetime: r.at }, timeFmt.format(at)), h("span", {}, r.user)),
  );
}

function emptyJournal(): HTMLElement {
  return h(
    "div",
    { class: "empty rich" },
    h("span", { class: "ic" }, icon("journal", 20)),
    h("strong", {}, "Nothing recorded yet"),
    h("span", {}, "Checks with the shortcut, lookalike warnings and changes to your book appear here, newest first."),
  );
}
