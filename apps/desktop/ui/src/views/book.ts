import { chainChip, metaChip, OWNER_CHOICES } from "../address";
import { dropdown } from "../dropdown";
import { confirmSheet } from "../confirmSheet";
import { menuFor } from "../contextMenu";
import { clear, h } from "../dom";
import { icon, STATE_ICON, type IconName } from "../icons";
import { ipc, message } from "../ipc";
import { move, rise, SPRING } from "../motion";
import type { BookView, Entry, Overview, Owner } from "../types";
import { toast } from "../toast";
import { recognitionCard } from "./card";

const OWNER_WORD: Record<Owner, string> = { me: "Yours", team: "Team", contact: "Contact" };
const OWNER_ICON: Record<Owner, IconName> = { me: STATE_ICON.mine, team: STATE_ICON.team, contact: STATE_ICON.contact };

/** An address in groups of four, its middle left out: "0x A0b8 6991 … 3606 eB48". */
function shortGrouped(text: string): string {
  const prefix = text.startsWith("0x") ? "0x" : "";
  const body = text.slice(prefix.length);
  const groups = (s: string) => s.match(/.{1,4}/g)?.join(" ") ?? s;
  if (body.length <= 16) return `${prefix} ${groups(body)}`.trim();
  return `${prefix} ${groups(body.slice(0, 8))} … ${groups(body.slice(-8))}`.trim();
}

export async function bookView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  const books = await ipc.listBooks();
  const notice = h("div");
  const say = (text: string, error = false) => clear(notice, h("div", { class: `notice${error ? " error" : ""}` }, text));
  const watching = overview.config.clipboard === "watch";

  const filter = h("input", { type: "search", placeholder: "Search by name, note or address", "aria-label": "Filter" });
  const lists = h("div");
  const draw = (animate = false) => {
    const q = filter.value.trim().toLowerCase();
    clear(
      lists,
      books.map((b) => bookSection(b, q, overview, { refresh, say, openAdd, watching })),
    );
    if (animate) void rise(lists.querySelectorAll(".entry"), { y: 8, gap: 0.03 });
  };
  filter.addEventListener("input", () => draw());

  const addArea = h("div");
  // The form slides down and fades in; it leaves the same way, reversed.
  // Its room opens and closes on the same spring, so the search and the
  // list below follow it instead of jumping.
  const room = (from: number, to: number) => {
    addArea.style.overflow = "hidden";
    return move(addArea, { height: [from, to] }, SPRING).then(() => {
      addArea.style.height = "";
      addArea.style.overflow = "";
    });
  };
  const openAdd = () => {
    if (addArea.firstChild) return addArea.querySelector<HTMLElement>("input")?.focus();
    const form = addForm(refresh, closeAdd);
    clear(addArea, form);
    addArea.style.overflow = "hidden";
    void room(0, addArea.scrollHeight);
    void move(form, { opacity: [0, 1], y: [-8, 0] }, SPRING);
  };
  const closeAdd = async () => {
    const form = addArea.firstElementChild;
    if (!form) return;
    addArea.style.overflow = "hidden";
    const full = addArea.offsetHeight;
    await Promise.all([room(full, 0), move(form, { opacity: [1, 0], y: [0, -8] }, SPRING)]);
    clear(addArea);
  };

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
      h("p", { class: "lead" }, metaChip("user", `${overview.book_count} yours`), metaChip("landmark", `${overview.public_label_count} public labels built in`)),
      h("span", { class: "spacer" }),
      more,
      h("button", { class: "btn primary", onclick: openAdd }, icon("plusCircle", 16), "Add address"),
    ),
    addArea,
    overview.book_count ? h("label", { class: "search" }, icon("search", 16), filter) : null,
    notice,
    lists,
  );
  draw(true);
}

type Ctx = {
  refresh: () => Promise<void>;
  say: (t: string, e?: boolean) => void;
  openAdd: () => void;
  watching: boolean;
};

function bookSection(b: BookView, q: string, overview: Overview, ctx: Ctx): HTMLElement {
  const match = (e: Entry) =>
    !q || e.label.toLowerCase().includes(q) || (e.note ?? "").toLowerCase().includes(q) || e.address.text.toLowerCase().includes(q);
  const entries = b.entries.filter(match).sort((x, y) => x.label.localeCompare(y.label));
  const title = b.writable ? "Your book" : `Shared book: ${b.name}`;

  if (!b.entries.length) {
    return h("section", {}, h("h2", {}, title), b.writable ? emptyBook(overview, ctx) : h("div", { class: "empty" }, "This shared book is empty."));
  }
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
    entries.length
      ? h(
          "ul",
          { class: "entries" },
          entries.map((e) => entryRow(e, b.writable, ctx)),
        )
      : h("div", { class: "empty" }, `No address matches “${q}”.`),
  );
}

/** One address: who it belongs to, its name and note, the address, its chain. */
function entryRow(e: Entry, writable: boolean, ctx: Ctx): HTMLElement {
  const details = () => ipc.showEntry(e.address.text).catch((err) => ctx.say(message(err), true));
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
  const remove = async (ev: Event) => {
    ev.stopPropagation();
    const ok = await confirmSheet({
      title: `Remove “${e.label}”?`,
      body: "Kenning stops naming this address. Lookalikes of it are then caught only while it is in your copy history.",
      confirm: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await ipc.removeEntry(e.address.text);
      toast(`Removed “${e.label}”`);
      await ctx.refresh();
    } catch (err) {
      ctx.say(message(err), true);
    }
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
    h("span", { class: `ic owner-${e.owner}`, title: OWNER_WORD[e.owner] }, icon(OWNER_ICON[e.owner], 16)),
    h(
      "span",
      { class: "who" },
      h("strong", {}, e.label),
      h("span", { class: "addr", title: e.address.text }, shortGrouped(e.address.text)),
      e.note && h("span", { class: "note" }, e.note),
    ),
    h("span", { class: "meta" }, chainChip(e.address.chain), h("span", { class: "owner" }, OWNER_WORD[e.owner])),
    h(
      "span",
      { class: "acts" },
      h("button", { class: "btn icon-btn", title: "Copy address", "aria-label": `Copy ${e.label}`, onclick: copy }, icon("copy", 16)),
      writable && h("button", { class: "btn icon-btn", title: "Remove", "aria-label": `Remove ${e.label}`, onclick: remove }, icon("x", 16)),
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

function addForm(refresh: () => Promise<void>, close: () => Promise<void>): HTMLElement {
  const address = h("input", { type: "text", placeholder: "Paste an address", "aria-label": "Address", class: "addr" });
  const label = h("input", { type: "text", placeholder: "e.g. Binance deposits", "aria-label": "Name" });
  const owner = dropdown({ label: "Whose address", choices: OWNER_CHOICES, value: "me" });
  const note = h("input", { type: "text", placeholder: "Optional", "aria-label": "Note" });
  const preview = h("div", { class: "full" });
  const error = h("div", { class: "full" });

  // Show what Kenning already knows about the address while typing.
  address.addEventListener("input", async () => {
    const found = await ipc.recognizeText(address.value);
    clear(preview, found[0] ? recognitionCard(found[0]) : null);
  });

  const save = async () => {
    try {
      await ipc.addEntry(address.value.trim(), label.value, owner.value, note.value || null);
      toast(`Saved “${label.value.trim()}”`);
      await close();
      await refresh();
    } catch (e) {
      clear(error, h("div", { class: "notice error" }, message(e)));
    }
  };
  label.addEventListener("keydown", (e) => e.key === "Enter" && void save());

  setTimeout(() => address.focus());
  return h(
    "section",
    { class: "card add-card" },
    h("h2", {}, "New address"),
    h(
      "div",
      { class: "form" },
      h("label", {}, "Address"),
      address,
      preview,
      h("label", {}, "Name"),
      label,
      h("label", {}, "Whose"),
      owner.el,
      h("label", {}, "Note"),
      note,
      error,
      h(
        "div",
        { class: "full inline" },
        h("button", { class: "btn primary", onclick: save }, "Save"),
        h("button", { class: "btn", onclick: close }, "Cancel"),
      ),
    ),
  );
}
