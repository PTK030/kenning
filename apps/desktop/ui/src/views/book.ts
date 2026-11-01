import { chainChip } from "../address";
import { menuFor } from "../contextMenu";
import { clear, h } from "../dom";
import { emojiMark } from "../emoji";
import { icon } from "../icons";
import { ipc, message } from "../ipc";
import { fold, rise } from "../motion";
import { segmented } from "../segmented";
import type { BookView, Entry, Overview, Owner } from "../types";
import { toast } from "../toast";
import { addressSheet } from "./addressSheet";
import { entrySheet, OWNER_ICON, tileClass } from "./entrySheet";

const OWNER_WORD: Record<Owner, string> = { me: "Yours", team: "Team", contact: "Contact" };

/** An address in groups of four, its middle left out: "0x A0b8 6991 … 3606 eB48". */
function shortGrouped(text: string): string {
  const prefix = text.startsWith("0x") ? "0x" : "";
  const body = text.slice(prefix.length);
  const groups = (s: string) => s.match(/.{1,4}/g)?.join(" ") ?? s;
  if (body.length <= 16) return `${prefix} ${groups(body)}`.trim();
  return `${prefix} ${groups(body.slice(0, 8))} … ${groups(body.slice(-8))}`.trim();
}

type Sort = "name" | "newest";
const byName = (x: Entry, y: Entry) => x.label.localeCompare(y.label);
// Entries from before Kenning kept the date go last, by name.
const newestFirst = (x: Entry, y: Entry) => (y.added_at ?? "").localeCompare(x.added_at ?? "") || byName(x, y);

// How this window was left: the order and the folded groups. Only a
// convenience, so storage that is blocked or cleared just means the defaults.
const SORT_KEY = "kenning.book.sort";
const FOLDED_KEY = "kenning.book.folded";
function recall<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept; the defaults come back next time.
  }
}

export async function bookView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  let books = await ipc.listBooks();
  const notice = h("div");
  const say = (text: string, error = false) => clear(notice, h("div", { class: `notice${error ? " error" : ""}` }, text));
  const watching = overview.config.clipboard === "watch";
  let sort = recall<Sort>(SORT_KEY, "name");
  const folded = new Set(recall<string[]>(FOLDED_KEY, []));
  const groupNames = () =>
    [...new Set(books.flatMap((b) => b.entries.flatMap((e) => (e.group ? [e.group] : []))))].sort((x, y) => x.localeCompare(y));

  const filter = h("input", { type: "search", placeholder: "Search by name, note, group or address", "aria-label": "Filter" });
  const lists = h("div");
  const draw = (animate = false) => {
    const q = filter.value.trim().toLowerCase();
    clear(
      lists,
      books.map((b) => bookSection(b, q, overview, ctx)),
    );
    if (animate) void rise(lists.querySelectorAll(".entry"), { y: 8, gap: 0.03 });
  };
  filter.addEventListener("input", () => draw());
  /** After an edit or a renamed group: read the books again, keep the search. */
  const reloadList = async () => {
    books = await ipc.listBooks();
    draw();
  };

  // Adding and changing an address both happen in a sheet over the list.
  let sheet = false;
  const openAdd = async () => {
    if (sheet) return;
    sheet = true;
    const outcome = await entrySheet({ groups: groupNames() });
    sheet = false;
    if (outcome) await refresh();
  };
  const edit = async (e: Entry) => {
    if (sheet) return;
    sheet = true;
    const outcome = await entrySheet({ entry: e, groups: groupNames() });
    sheet = false;
    // A removal changes the counts in the header too; an edit only the list.
    if (outcome === "removed") await refresh();
    else if (outcome === "saved") await reloadList();
  };

  const ctx: Ctx = {
    refresh,
    reloadList,
    say,
    openAdd,
    edit,
    // A row opens over the list; a change made from there redraws it, the search kept.
    view: (e) => addressSheet(e.address.text, { network: overview.config.network, watching, changed: reloadList }),
    watching,
    sort: () => sort,
    folded,
    fold: (key, fold) => {
      if (fold) folded.add(key);
      else folded.delete(key);
      remember(FOLDED_KEY, [...folded]);
    },
  };

  const order = segmented<Sort>(
    "Order",
    [
      { value: "name", label: "Name" },
      { value: "newest", label: "Newest" },
    ],
    sort,
    (v) => {
      sort = v;
      remember(SORT_KEY, v);
      draw(true);
    },
  );

  const more = h("button", { class: "btn icon-btn", title: "More", "aria-label": "More actions" }, icon("more", 18));
  more.addEventListener("click", () =>
    menuFor(more, [
      {
        label: "Import CSV or Safe export…",
        icon: "upload",
        run: async () => {
          try {
            const s = await ipc.importCsv("me");
            if (s) {
              // A toast, not the notice: the refresh below redraws the view.
              toast(`Imported: ${s.added} new, ${s.updated} updated${s.skipped.length ? `, ${s.skipped.length} rows skipped (${s.skipped.map(([n, why]) => `row ${n}: ${why}`).join("; ")})` : ""}.`);
              await refresh();
            }
          } catch (e) {
            say(message(e), true);
          }
        },
      },
      {
        label: "Export CSV…",
        icon: "download",
        run: async () => {
          try {
            const path = await ipc.exportCsv();
            if (path) toast(`Exported to ${path}`);
          } catch (e) {
            say(message(e), true);
          }
        },
      },
      { label: "Open book.toml", icon: "file", run: () => ipc.openBookFile().catch((e) => say(message(e), true)) },
      {
        label: "Reload after editing by hand",
        icon: "refresh",
        run: async () => {
          try {
            await ipc.reload();
            await refresh();
          } catch (e) {
            say(message(e), true);
          }
        },
      },
    ]),
  );

  clear(
    main,
    h(
      "header",
      {},
      h("h1", {}, "Address book"),
      h("span", { class: "spacer" }),
      more,
      h("button", { class: "btn primary", onclick: openAdd }, icon("plusCircle", 16), "Add address"),
    ),
    overview.book_count ? h("div", { class: "book-tools" }, h("label", { class: "search" }, icon("search", 16), filter), order) : null,
    notice,
    lists,
  );
  draw(true);
}

type Ctx = {
  refresh: () => Promise<void>;
  reloadList: () => Promise<void>;
  say: (t: string, e?: boolean) => void;
  openAdd: () => void;
  edit: (e: Entry) => void;
  view: (e: Entry) => Promise<void>;
  watching: boolean;
  sort: () => Sort;
  folded: Set<string>;
  fold: (key: string, folded: boolean) => void;
};

function bookSection(b: BookView, q: string, overview: Overview, ctx: Ctx): HTMLElement {
  const match = (e: Entry) => !q || [e.label, e.note, e.group, e.emoji, e.address.text].some((s) => s?.toLowerCase().includes(q));
  const entries = b.entries.filter(match).sort(ctx.sort() === "newest" ? newestFirst : byName);
  const title = b.writable ? "Your book" : `Shared book: ${b.name}`;

  if (!b.entries.length) {
    return h("section", {}, h("h2", {}, title), b.writable ? emptyBook(overview, ctx) : h("div", { class: "empty" }, "This shared book is empty."));
  }
  // Groups appear once the user has made one; until then, one plain list.
  const grouped = b.entries.some((e) => e.group);
  return h(
    "section",
    {},
    h(
      "h2",
      {},
      title,
      h("span", { class: "muted" }, `${b.entries.length}`),
      !b.writable && h("span", { class: "meta-chip" }, icon("book", 12), "read-only"),
    ),
    !entries.length
      ? h("div", { class: "empty" }, `No address matches “${q}”.`)
      : grouped
        ? groupBlocks(b, entries, q, ctx)
        : entryList(entries, b.writable, ctx),
  );
}

function entryList(entries: Entry[], writable: boolean, ctx: Ctx): HTMLElement {
  return h(
    "ul",
    { class: "entries" },
    entries.map((e) => entryRow(e, writable, ctx)),
  );
}

/** The user's groups by name, then the addresses in none of them. */
function groupBlocks(b: BookView, entries: Entry[], q: string, ctx: Ctx): HTMLElement[] {
  const by = new Map<string | null, Entry[]>();
  for (const e of entries) by.set(e.group, [...(by.get(e.group) ?? []), e]);
  const names = [...by.keys()].sort((x, y) => (x === null ? 1 : y === null ? -1 : x.localeCompare(y)));
  return names.map((name) => groupBlock(b, name, by.get(name)!, q, ctx));
}

/** A group: a heading that folds it away, and its rows. While searching,
 *  every group with a match is open, folded or not. */
function groupBlock(b: BookView, name: string | null, entries: Entry[], q: string, ctx: Ctx): HTMLElement {
  const key = `${b.name}/${name ?? ""}`;
  let isFolded = !q && ctx.folded.has(key);
  const list = entryList(entries, b.writable, ctx);
  list.hidden = isFolded;

  const toggle = h(
    "button",
    {
      type: "button",
      class: "group-toggle",
      "aria-expanded": String(!isFolded),
      onclick: () => {
        isFolded = !isFolded;
        if (!q) ctx.fold(key, isFolded);
        // The whole card glides open or shut, as a day in the journal does:
        // folding its rows alone left the empty card to vanish at the end.
        fold(toggle, list, !isFolded);
      },
    },
    icon("chevronDown", 16, "chev"),
    h("span", { class: "group-name" }, name ?? "Other"),
    h("span", { class: "muted" }, `${entries.length}`),
  );

  // Renaming a group renames it in every entry; an empty name ungroups them.
  const rename = () => {
    const field = h("input", { type: "text", class: "group-field", value: name ?? "", maxlength: "40", "aria-label": "Group name" });
    const done = async (save: boolean) => {
      field.onblur = null;
      const to = field.value.trim();
      if (!save || to === name) return void field.replaceWith(toggle);
      try {
        await ipc.renameGroup(name!, to);
        if (ctx.folded.has(key)) ctx.fold(key, false);
        toast(to ? `Renamed the group to “${to}”` : `Moved the addresses out of “${name}”`);
        await ctx.reloadList();
      } catch (e) {
        field.replaceWith(toggle);
        ctx.say(message(e), true);
      }
    };
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void done(true);
      else if (e.key === "Escape") {
        e.stopPropagation();
        void done(false);
      }
    });
    field.onblur = () => void done(false);
    toggle.replaceWith(field);
    field.focus();
    field.select();
  };

  return h(
    "div",
    { class: "group" },
    h(
      "div",
      { class: "group-head" },
      toggle,
      b.writable &&
        name !== null &&
        h("button", { type: "button", class: "btn icon-btn", title: "Rename group", "aria-label": `Rename group ${name}`, onclick: rename }, icon("pencil", 14)),
    ),
    list,
  );
}

/** One address: its picture or whose it is, its name and note, the address, its chain. */
function entryRow(e: Entry, writable: boolean, ctx: Ctx): HTMLElement {
  const details = () => ctx.view(e).catch((err) => ctx.say(message(err), true));
  const copy = async (ev: Event) => {
    ev.stopPropagation();
    try {
      await navigator.clipboard.writeText(e.address.text);
      // When Kenning watches the clipboard, its own badge confirms the copy.
      if (!ctx.watching) toast(`Copied “${e.label}”`);
    } catch (err) {
      ctx.say(message(err), true);
    }
  };
  const edit = (ev: Event) => {
    ev.stopPropagation();
    ctx.edit(e);
  };
  return h(
    "li",
    {
      class: "entry",
      tabindex: "0",
      title: "Show details",
      onclick: details,
      onkeydown: (ev: KeyboardEvent) => {
        if (ev.target !== ev.currentTarget || (ev.key !== "Enter" && ev.key !== " ")) return;
        ev.preventDefault();
        void details();
      },
    },
    // A picture takes the tile; its tint and the word on the right still say whose it is.
    h("span", { class: `ic ${tileClass(e.emoji, e.tint, e.owner)}`, title: OWNER_WORD[e.owner] }, e.emoji ? emojiMark(e.emoji, 22) : icon(OWNER_ICON[e.owner], 16)),
    h(
      "span",
      { class: "who" },
      h("strong", {}, e.label),
      h(
        "span",
        { class: "line" },
        h("span", { class: "addr", title: e.address.text }, shortGrouped(e.address.text)),
        e.note && h("span", { class: "note" }, e.note),
      ),
    ),
    h("span", { class: "meta" }, chainChip(e.address.chain), h("span", { class: "owner" }, OWNER_WORD[e.owner])),
    h(
      "span",
      { class: "acts" },
      h("button", { class: "btn icon-btn", title: "Copy address", "aria-label": `Copy ${e.label}`, onclick: copy }, icon("copy", 16)),
      writable && h("button", { class: "btn icon-btn", title: "Edit or remove", "aria-label": `Edit ${e.label}`, onclick: edit }, icon("pencil", 15)),
    ),
  );
}

/** The first visit: what a name does, shown, and the two ways to start. */
function emptyBook(overview: Overview, ctx: Ctx): HTMLElement {
  return h(
    "div",
    { class: "book-empty" },
    h(
      "div",
      { class: "copy" },
      h("h3", {}, "Name the addresses you use"),
      h(
        "p",
        { class: "muted" },
        "Your wallets, exchange deposit addresses, multisigs, the people you pay. Kenning shows the name each time you copy one, and warns when an address only looks like it.",
      ),
      h(
        "div",
        { class: "inline" },
        h("button", { class: "btn primary", onclick: ctx.openAdd }, icon("plusCircle", 16), "Add your first address"),
        h(
          "button",
          {
            class: "btn ghost",
            onclick: async () => {
              try {
                const s = await ipc.importCsv("me");
                if (s) {
                  toast(`Imported: ${s.added} new, ${s.updated} updated.`);
                  await ctx.refresh();
                }
              } catch (e) {
                ctx.say(message(e), true);
              }
            },
          },
          icon("upload", 16),
          "Import a Safe address book",
        ),
      ),
      h("p", { class: "muted small" }, `Stored as plain text in ${overview.book_path}.`),
    ),
    h(
      "div",
      { class: "pic", "aria-hidden": "true" },
      h(
        "div",
        { class: "pic-badge" },
        h("span", { class: "ic" }, icon("checkCircle", 16)),
        h("span", {}, h("b", {}, "Binance deposits"), h("code", {}, "0x28C6 c062 … 1d60")),
        h("i", { class: "bar" }),
      ),
    ),
  );
}
