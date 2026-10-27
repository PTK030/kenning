import { short, STATE_WORD } from "../address";
import { clear, h } from "../dom";
import { icon, type IconName } from "../icons";
import { ipc, message } from "../ipc";
import { rise } from "../motion";
import type { JournalRecord, Overview, State } from "../types";
import { segmented } from "../segmented";
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
    case "removed":
      return { icon: "x", tone: "plain", title: `Removed ${name ?? "an address"} from the book`, address: r.address };
    default:
      return { icon: "search", tone: "brand", title: name ? `Checked ${name}` : "Checked an address", address: r.address };
  }
}

const FILTERS: { id: string; label: string; keep: (r: JournalRecord) => boolean }[] = [
  { id: "all", label: "All", keep: () => true },
  { id: "lookalikes", label: "Lookalikes", keep: (r) => r.action === "lookalike_shown" || r.action === "copied_correct" },
  { id: "book", label: "Book changes", keep: (r) => r.action === "added" || r.action === "removed" || r.action === "marked_mine" },
];

const STATES = new Set<string>(["mine", "team", "contact", "public", "lookalike", "seen", "new"]);
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "Today", "Yesterday", or the date. */
function dayName(d: Date): string {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : dayFmt.format(d);
}

export async function journalView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  const records = await ipc.journal(500);
  let filter = FILTERS[0];
  const list = h("div");
  const tabs = segmented(
    "Show",
    FILTERS.map((f) => ({ value: f, label: f.label })),
    filter,
    (f) => {
      filter = f;
      draw(true);
    },
  );

  const draw = (animate = false) => {
    const shown = records.filter(filter.keep);
    if (!records.length) return clear(list, emptyJournal());
    if (!shown.length) return clear(list, h("div", { class: "empty" }, "Nothing of this kind yet."));
    // Newest first, one card per day.
    const days = new Map<string, JournalRecord[]>();
    for (const r of shown) {
      const name = dayName(new Date(r.at));
      days.set(name, [...(days.get(name) ?? []), r]);
    }
    clear(
      list,
      [...days].map(([name, rs]) => h("section", { class: "day" }, h("h2", {}, name), h("ul", { class: "entries" }, rs.map(row)))),
    );
    if (animate) void rise(list.querySelectorAll(".entry"), { y: 6, gap: 0.02 });
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

function row(r: JournalRecord): HTMLElement {
  const s = describe(r);
  const at = new Date(r.at);
  // Details of the address the row shows: for a correction, the right one.
  const details = () => ipc.showEntry(s.address, "journal").catch((e) => toast(message(e), "error"));
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
      h("strong", {}, s.title),
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
