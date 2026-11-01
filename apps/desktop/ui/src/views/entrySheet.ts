// Adding an address to the book, or changing one, in a sheet over the list:
// the tile and name at the top as the book will show them, the fields
// below. Esc or Cancel leaves it (modal.ts).

import { chainChip, OWNER_CHOICES, short } from "../address";
import { confirmSheet } from "../confirmSheet";
import { dropdown } from "../dropdown";
import { clear, h } from "../dom";
import { emojiMark, emojiPicker, tileTint, type Look } from "../emoji";
import { icon, STATE_ICON, type IconName } from "../icons";
import { ipc, message, type EntryFields } from "../ipc";
import { modal } from "../modal";
import type { Entry, Owner } from "../types";
import { toast } from "../toast";
import { recognitionCard } from "./card";

export const OWNER_ICON: Record<Owner, IconName> = { me: STATE_ICON.mine, team: STATE_ICON.team, contact: STATE_ICON.contact };

/** A tile's colour: the one chosen, else one to suit the picture, else whose it is. */
export function tileClass(emoji: string | null, tint: string | null, owner: Owner): string {
  const t = tileTint(emoji, tint);
  return t ? `tint-${t}` : `owner-${owner}`;
}

export type Outcome = "saved" | "removed" | null;

/** The sheet for a new address (`address` fills it in), or, given `entry`,
 *  for changing one: its address then stays as it is, and every other field
 *  is saved as shown. */
export function entrySheet(opts: { entry?: Entry; address?: string; groups: string[] }): Promise<Outcome> {
  return new Promise((resolve) => {
    const e = opts.entry;

    const address = e ? null : h("input", { type: "text", placeholder: "Paste an address", "aria-label": "Address", class: "addr", value: opts.address ?? "" });
    const label = h("input", { type: "text", placeholder: "e.g. Binance deposits", "aria-label": "Name", value: e?.label ?? "" });
    const owner = dropdown({ label: "Whose address", choices: OWNER_CHOICES, value: e?.owner ?? "me", onChange: () => paint() });
    const listId = `groups-${Math.random().toString(36).slice(2)}`;
    const group = h("input", { type: "text", placeholder: "Optional, e.g. Exchanges", "aria-label": "Group", list: listId, maxlength: "40", value: e?.group ?? "" });
    const note = h("input", { type: "text", placeholder: "Optional", "aria-label": "Note", value: e?.note ?? "" });
    const preview = h("div", { class: "full" });
    const error = h("div", { class: "full" });

    // The head: the tile (a button: it opens the picker), the name as typed,
    // and the address it belongs to.
    let look: Look = { emoji: e?.emoji ?? null, tint: e?.tint ?? null };
    const ownerIcon = () => icon(OWNER_ICON[owner.value], 22);
    const pic = h("button", { type: "button", title: "Choose a picture and its background", "aria-label": "Picture", "aria-haspopup": "dialog" });
    const title = h("h2", { id: `${listId}-title` });
    const sub = h("div", { class: "entry-sub" });
    const paint = () => {
      pic.className = `pic-pick big ic ${tileClass(look.emoji, look.tint, owner.value)}${look.emoji || look.tint ? " chosen" : ""}`;
      clear(pic, look.emoji ? emojiMark(look.emoji, 34) : ownerIcon(), h("span", { class: "pic-edit", "aria-hidden": "true" }, icon("pencil", 11)));
      title.textContent = label.value.trim() || (e ? "Edit address" : "New address");
    };
    const showAddress = (text: string | null, chain: Entry["address"]["chain"] | null) =>
      clear(sub, text && chain ? [chainChip(chain), h("code", { class: "addr", title: text }, short(text))] : h("span", { class: "muted" }, "Paste the address, then name it."));
    showAddress(e?.address.text ?? null, e?.address.chain ?? null);
    paint();
    label.addEventListener("input", paint);
    pic.addEventListener("click", () =>
      emojiPicker(
        pic,
        look,
        (next) => {
          look = next;
          paint();
        },
        ownerIcon,
      ),
    );

    // While typing an address: what Kenning already knows about it, and the
    // head shows which one it is.
    const recognize = async () => {
      const found = await ipc.recognizeText(address!.value);
      clear(preview, found[0] ? recognitionCard(found[0]) : null);
      showAddress(found[0]?.address.text ?? null, found[0]?.address.chain ?? null);
    };
    address?.addEventListener("input", recognize);
    if (opts.address) void recognize();

    const close = async (outcome: Outcome) => {
      resolve(outcome);
      // A removed row is gone, so focus has nowhere to go back to.
      await sheet.close(outcome !== "removed");
    };
    const fields = (): EntryFields => ({
      label: label.value,
      owner: owner.value,
      note: note.value.trim() || null,
      emoji: look.emoji,
      tint: look.tint,
      group: group.value.trim() || null,
    });
    const save = async () => {
      try {
        if (e) await ipc.editEntry(e.address.text, fields());
        else await ipc.addEntry(address!.value.trim(), fields());
        toast(`Saved “${label.value.trim()}”`);
        await close("saved");
      } catch (err) {
        clear(error, h("div", { class: "notice error" }, message(err)));
      }
    };
    const remove = async () => {
      if (!e) return;
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
        await close("removed");
      } catch (err) {
        clear(error, h("div", { class: "notice error" }, message(err)));
      }
    };
    // Not from Group: there Enter picks a suggestion.
    for (const f of [label, note]) f.addEventListener("keydown", (ev) => ev.key === "Enter" && void save());

    const card = h(
      "section",
      { class: "sheet-card entry-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": title.id },
      h("div", { class: "entry-head" }, pic, h("div", { class: "entry-title" }, title, sub)),
      h(
        "div",
        { class: "form" },
        address && [h("label", {}, "Address"), address, preview],
        h("label", {}, "Name"),
        label,
        h("label", {}, "Whose"),
        owner.el,
        h("label", {}, "Group"),
        group,
        h("datalist", { id: listId }, opts.groups.map((g) => h("option", { value: g }))),
        h("label", {}, "Note"),
        note,
        error,
      ),
      h(
        "div",
        { class: "sheet-actions" },
        e && h("button", { type: "button", class: "btn danger-ghost", onclick: remove }, icon("x", 15), "Remove"),
        h("span", { class: "spacer" }),
        h("button", { type: "button", class: "btn", onclick: () => void close(null) }, "Cancel"),
        h("button", { type: "button", class: "btn primary", onclick: save }, e ? "Save" : "Add to book"),
      ),
    );
    // Beside it, a click closes the sheet only while it is as it opened.
    const snapshot = () => JSON.stringify([address?.value ?? "", fields()]);
    const opened = snapshot();
    const sheet = modal(
      card,
      () => void close(null),
      () => snapshot() === opened && void close(null),
    );
    // A new address that came filled in only needs its name.
    (address && !opts.address ? address : label).focus();
    if (e) label.select();
  });
}
