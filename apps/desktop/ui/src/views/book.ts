import { CHAIN_NAME, short } from "../address";
import { clear, h } from "../dom";
import { ipc, message } from "../ipc";
import type { BookView, Entry, Overview, Owner } from "../types";
import { recognitionCard } from "./card";

const OWNER_WORD: Record<Owner, string> = { me: "Yours", team: "Team", contact: "Contact" };

export async function bookView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  const books = await ipc.listBooks();
  const notice = h("div");
  const say = (text: string, error = false) =>
    clear(notice, h("div", { class: `notice${error ? " error" : ""}` }, text));

  const filter = h("input", { type: "text", placeholder: "Filter by name or address", "aria-label": "Filter" });
  const lists = h("div");
  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    clear(
      lists,
      books.map((b) => bookSection(b, q, overview, refresh, say)),
    );
  };
  filter.addEventListener("input", draw);

  const addArea = h("div");
  const openAdd = () => clear(addArea, addForm(refresh, () => clear(addArea)));

  clear(
    main,
    h(
      "header",
      {},
      h("h1", {}, "Address book"),
      h("span", { class: "muted" }, `${overview.book_count} yours · ${overview.public_label_count} public labels built in`),
      h("span", { class: "spacer" }),
      h("button", { class: "btn primary", onclick: openAdd }, "Add address"),
    ),
    addArea,
    h(
      "div",
      { class: "inline", style: "margin-bottom:14px" },
      filter,
      h(
        "button",
        {
          class: "btn",
          onclick: async () => {
            try {
              const s = await ipc.importCsv("me");
              if (s) {
                say(`Imported: ${s.added} new, ${s.updated} updated${s.skipped.length ? `, ${s.skipped.length} rows skipped (${s.skipped.map(([n, why]) => `row ${n}: ${why}`).join("; ")})` : ""}.`);
                await refresh();
              }
            } catch (e) {
              say(message(e), true);
            }
          },
        },
        "Import CSV…",
      ),
      h(
        "button",
        {
          class: "btn",
          onclick: async () => {
            try {
              const path = await ipc.exportCsv();
              if (path) say(`Exported to ${path}`);
            } catch (e) {
              say(message(e), true);
            }
          },
        },
        "Export CSV…",
      ),
      h("button", { class: "btn", onclick: () => ipc.openBookFile().catch((e) => say(message(e), true)) }, "Open book.toml"),
      h(
        "button",
        {
          class: "btn",
          title: "Reload after editing book.toml by hand",
          onclick: async () => {
            try {
              await ipc.reload();
              await refresh();
            } catch (e) {
              say(message(e), true);
            }
          },
        },
        "Reload",
      ),
    ),
    notice,
    lists,
  );
  draw();
}

function bookSection(
  b: BookView,
  q: string,
  overview: Overview,
  refresh: () => Promise<void>,
  say: (t: string, e?: boolean) => void,
): HTMLElement {
  const match = (e: Entry) =>
    !q || e.label.toLowerCase().includes(q) || (e.note ?? "").toLowerCase().includes(q) || e.address.text.toLowerCase().includes(q);
  const entries = b.entries.filter(match).sort((x, y) => x.label.localeCompare(y.label));
  const title = b.writable ? "Your book" : `Shared book: ${b.name}`;

  if (!b.entries.length) {
    return h(
      "section",
      {},
      h("h2", {}, title),
      h(
        "div",
        { class: "empty" },
        b.writable
          ? `Nothing here yet. Name the addresses you use: your wallets, deposit addresses, multisigs. Stored in ${overview.book_path}.`
          : "This shared book is empty.",
      ),
    );
  }
  return h(
    "section",
    {},
    h("h2", {}, title, h("span", { class: "muted" }, `${b.entries.length}`), !b.writable && h("span", { class: "muted" }, "read-only")),
    h(
      "table",
      {},
      h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Address"), h("th", {}, "Chain"), h("th", {}, "Owner"), h("th", {}))),
      h(
        "tbody",
        {},
        entries.map((e) =>
          h(
            "tr",
            {},
            h("td", {}, h("div", {}, e.label), e.note && h("div", { class: "muted", style: "font-size:12px" }, e.note)),
            h("td", { title: e.address.text }, h("span", { class: "addr" }, short(e.address.text))),
            h("td", {}, CHAIN_NAME[e.address.chain]),
            h("td", {}, OWNER_WORD[e.owner]),
            h(
              "td",
              { class: "actions" },
              b.writable &&
                h(
                  "button",
                  {
                    class: "link muted",
                    onclick: async () => {
                      if (!confirm(`Remove “${e.label}” from your book?`)) return;
                      try {
                        await ipc.removeEntry(e.address.text);
                        await refresh();
                      } catch (err) {
                        say(message(err), true);
                      }
                    },
                  },
                  "Remove",
                ),
            ),
          ),
        ),
      ),
    ),
  );
}

function addForm(refresh: () => Promise<void>, close: () => void): HTMLElement {
  const address = h("input", { type: "text", placeholder: "Paste an address", "aria-label": "Address", class: "addr" });
  const label = h("input", { type: "text", placeholder: "e.g. Binance deposits", "aria-label": "Name" });
  const owner = h(
    "select",
    { "aria-label": "Owner" },
    h("option", { value: "me" }, "Mine"),
    h("option", { value: "team" }, "My team's"),
    h("option", { value: "contact" }, "Someone I pay or receive from"),
  );
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
      await ipc.addEntry(address.value.trim(), label.value, owner.value as Owner, note.value || null);
      close();
      await refresh();
    } catch (e) {
      clear(error, h("div", { class: "notice error" }, message(e)));
    }
  };
  label.addEventListener("keydown", (e) => e.key === "Enter" && void save());

  setTimeout(() => address.focus());
  return h(
    "section",
    { class: "card", style: "margin-bottom:18px" },
    h(
      "div",
      { class: "form" },
      h("label", {}, "Address"),
      address,
      preview,
      h("label", {}, "Name"),
      label,
      h("label", {}, "Whose"),
      owner,
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
