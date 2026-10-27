import { short, stateChip } from "../address";
import { clear, h } from "../dom";
import { icon, type IconName } from "../icons";
import { ipc, message } from "../ipc";
import { rise } from "../motion";
import type { JournalRecord, Overview, State } from "../types";
import { toast } from "../toast";

type Action = JournalRecord["action"];

const ACTION: Record<Action, { text: string; icon: IconName; tone: string }> = {
  checked: { text: "Checked", icon: "search", tone: "brand" },
  lookalike_shown: { text: "Lookalike shown", icon: "alert", tone: "look" },
  copied_correct: { text: "Copied the correct address", icon: "copy", tone: "mine" },
  marked_mine: { text: "Marked as mine", icon: "checkCircle", tone: "mine" },
  added: { text: "Added to the book", icon: "plusCircle", tone: "mine" },
  removed: { text: "Removed from the book", icon: "x", tone: "plain" },
};

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
  const tabs = h("div", { class: "segmented", role: "tablist", "aria-label": "Show" });

  const draw = (animate = false) => {
    clear(
      tabs,
      FILTERS.map((f) =>
        h(
          "button",
          {
            role: "tab",
            "aria-selected": String(f === filter),
            onclick: () => {
              filter = f;
              draw(true);
            },
          },
          f.label,
        ),
      ),
    );
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
  const a = ACTION[r.action] ?? { text: r.action, icon: "info" as IconName, tone: "plain" };
  const at = new Date(r.at);
  const details = () => ipc.showEntry(r.address).catch((e) => toast(message(e), "error"));
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
    h("span", { class: `ic tone-${a.tone}` }, icon(a.icon, 16)),
    h(
      "span",
      { class: "who" },
      h("strong", {}, a.text, r.label ? h("span", { class: "label" }, r.label) : null),
      h("span", { class: "addr", title: r.address }, short(r.address)),
    ),
    h("span", { class: "meta" }, STATES.has(r.state) ? stateChip(r.state as State) : null),
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
