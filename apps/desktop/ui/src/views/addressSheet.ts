// An address from the book or the journal, in a sheet over the main window:
// what Kenning knows about it, and what can be done with it. The separate
// details window is for addresses selected in other apps; inside Kenning a
// second window would only pull the eye away from where it was.

import { addressPlain, chainChip, detailLine, STATE_WORD } from "../address";
import { clear, h } from "../dom";
import { emojiMark } from "../emoji";
import { factList, onchainFor } from "../facts";
import { icon, STATE_ICON } from "../icons";
import { ipc, message } from "../ipc";
import { modal } from "../modal";
import type { Entry } from "../types";
import { toast } from "../toast";
import { entrySheet, tileClass } from "./entrySheet";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Show `address`. `changed` is told after it was edited, removed or added
 *  from here, so the view behind can redraw. */
export async function addressSheet(address: string, opts: { network: boolean; watching: boolean; changed: () => Promise<void> }) {
  const [found] = await ipc.recognizeText(address);
  if (!found) return toast("That is not an address Kenning can read.", "error");
  const r = found;
  const books = await ipc.listBooks();
  // Only an entry of the user's own book can be changed here.
  const entry: Entry | undefined = books.find((b) => b.writable)?.entries.find((e) => same(e.address.text, r.address.text));
  const groups = [...new Set(books.flatMap((b) => b.entries.flatMap((e) => (e.group ? [e.group] : []))))].sort((x, y) => x.localeCompare(y));
  const known = r.state === "mine" || r.state === "team" || r.state === "contact";

  // The tile: the picture on its background for an entry of the book, as
  // in the list; otherwise the state's own symbol and colour.
  const tile =
    r.emoji && entry
      ? h("div", { class: `entry-tile ic ${tileClass(entry.emoji, entry.tint, entry.owner)}` }, emojiMark(r.emoji, 34))
      : h("div", { class: "state-tile" }, icon(STATE_ICON[r.state], 24));
  const facts = factList(r, opts.network);
  const error = h("div", { class: "error", role: "alert" });
  const fail = (e: unknown) => clear(error, h("div", { class: "notice error" }, message(e)));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.address.text);
      // When Kenning watches the clipboard, its own badge confirms the copy.
      if (!opts.watching) toast(`Copied ${r.label ? `“${r.label}”` : "the address"}`);
    } catch (e) {
      fail(e);
    }
  };
  // Changing it, or adding it, takes the entry sheet's place.
  const toEntrySheet = async (o: { entry?: Entry; address?: string }) => {
    await sheet.close(false);
    if (await entrySheet({ ...o, groups })) await opts.changed();
  };

  const titleId = `sheet-${Math.random().toString(36).slice(2)}`;
  const card = h(
    "section",
    { class: `sheet-card address-sheet k-${r.state}`, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h(
      "div",
      { class: "entry-head" },
      tile,
      h(
        "div",
        { class: "entry-title" },
        h("div", { class: "title-line" }, h("h2", { id: titleId }, r.headline), h("span", { class: "word" }, STATE_WORD[r.state])),
        h("p", { class: "detail" }, ...detailLine(r.detail), chainChip(r.address.chain)),
      ),
    ),
    h("div", { class: "detail-card" }, h("div", { class: "detail-address" }, addressPlain(r.grouped)), facts.el),
    error,
    h(
      "div",
      { class: "sheet-actions" },
      h("button", { type: "button", class: "btn primary", onclick: copy }, icon("copy", 15), "Copy address"),
      h("button", { type: "button", class: "btn", onclick: () => ipc.openExplorer(r.address.text).catch(fail) }, icon("globe", 15), "Explorer"),
      entry && h("button", { type: "button", class: "btn", onclick: () => void toEntrySheet({ entry }) }, icon("pencil", 15), "Edit"),
      !known && h("button", { type: "button", class: "btn", onclick: () => void toEntrySheet({ address: r.address.text }) }, icon("plusCircle", 15), "Add to book"),
      h("span", { class: "spacer" }),
      h("button", { type: "button", class: "btn ghost", onclick: () => void sheet.close() }, "Close"),
    ),
  );
  // Nothing to lose here: a click beside it puts it away too.
  const sheet = modal(
    card,
    () => void sheet.close(),
    () => void sheet.close(),
  );
  card.querySelector<HTMLButtonElement>(".btn.primary")?.focus();
  void onchainFor(r.address.text, opts.network).then((f) => f && facts.paintChain(f));
}
