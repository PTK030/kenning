// The details window: everything Kenning knows about the address you
// selected, in the middle of the screen. The details shortcut opens it;
// Esc, the close button or clicking elsewhere closes it. A lookalike never
// lands here: it gets its own warning window.

import { addressPlain, chainChip, detailLine, STATE_WORD } from "./address";
import { $, clear, h } from "./dom";
import { icon, STATE_ICON } from "./icons";
import { ipc, message, on, win } from "./ipc";
import { draw, move, POP, rise, settling, SPRING } from "./motion";
import { titlebar } from "./titlebar";
import type { Contact, DetailsView, Fact, LabelKind, Owner, Source } from "./types";
import "./guard";

const root = $("#details");
$("#chrome").replaceWith(titlebar({ title: "Address details", sign: "search", onClose: () => ipc.closeDetails() }).el);

let view: DetailsView | null = null;
/** The on-chain rows of the current render, filled as answers arrive. */
let chainBox: HTMLElement | null = null;

const KIND: Record<LabelKind, string> = {
  token: "Token",
  contract: "Contract",
  program: "Program",
  exchange: "Exchange",
  other: "Public label",
};

const SOURCE_LINE: Record<Source, string> = {
  selection: "From your selection",
  clipboard: "Nothing was selected, so this is from the clipboard",
  book: "From your book",
  journal: "From your journal",
};

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string) => date.format(new Date(iso));

function historyLine(c: Contact | null): string {
  if (!c) return "Never copied";
  const times = c.count === 1 ? "once" : `${c.count}×`;
  const first = when(c.first_seen);
  const last = when(c.last_seen);
  return first === last ? `Copied ${times}, on ${last}` : `Copied ${times}, first ${first}, last ${last}`;
}

/** One label / value row of the facts list. */
const fact = (label: string, ...value: (Node | string)[]) => [h("dt", {}, label), h("dd", {}, ...value)];

function paintChain(f: Fact | undefined) {
  if (!chainBox || !view) return;
  if (!view.network) {
    const turnOn = h(
      "button",
      {
        class: "link",
        onclick: async () => {
          if (!view) return;
          turnOn.disabled = true;
          view.network = true;
          const address = view.recognition.address.text;
          paintChain({ state: "pending" });
          try {
            await ipc.setNetwork(true);
            paintChain(await ipc.lookupOnchain(address));
          } catch (e) {
            paintChain({ state: "error", message: message(e) });
          }
        },
      },
      "Turn on",
    );
    return clear(chainBox, fact("On chain", h("span", { class: "muted" }, "Lookups are off. "), turnOn));
  }
  if (!f || f.state === "pending") return clear(chainBox, fact("On chain", h("span", { class: "muted pending" }, "Checking…")));
  if (f.state === "error") return clear(chainBox, fact("On chain", h("span", { class: "muted" }, `Lookup failed: ${f.message}`)));

  const o = f.onchain;
  const plural = o.transactions !== 1 || o.transactions_capped ? "s" : "";
  const activity = !o.active
    ? "Never used on chain"
    : o.transactions === null
      ? "Used on chain"
      : `${o.transactions.toLocaleString("en-US")}${o.transactions_capped ? "+" : ""} transaction${plural}`;
  const kind = o.verified === true ? "Verified contract" : o.verified === false ? "Unverified contract" : "Contract";
  const time = new Date(o.fetched_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  clear(
    chainBox,
    fact("On chain", h("span", { class: o.active ? "" : "warn" }, activity)),
    o.contract ? fact("Contract", o.name ? `${kind} “${o.name}”` : kind) : null,
    fact("Checked", h("span", { class: "muted" }, `${o.network} via ${o.source}, at ${time}`)),
  );
}

function render(next: DetailsView | null, fresh = true) {
  view = next;
  if (!view) {
    clear(root, h("p", { class: "muted" }, "Nothing to show."));
    return fit(fresh);
  }
  const r = view.recognition;
  root.className = `k-${r.state}`;
  // The whole window takes the state's colour (details.css), title bar too.
  for (const c of [...document.body.classList]) if (c.startsWith("k-")) document.body.classList.remove(c);
  document.body.classList.add(`k-${r.state}`);
  const known = r.state === "mine" || r.state === "team" || r.state === "contact";

  const error = h("div", { class: "error", role: "alert" });
  const fail = (e: unknown) => {
    error.textContent = message(e);
    fit(false);
  };

  const actions = h("div", { class: "actions" });
  const showAddForm = () => {
    const name = h("input", { type: "text", placeholder: "Name for this address", "aria-label": "Name for this address", value: r.label ?? "" });
    const owner = h(
      "select",
      { "aria-label": "Whose address" },
      h("option", { value: "me" }, "Mine"),
      h("option", { value: "team" }, "Team"),
      h("option", { value: "contact" }, "Contact"),
    );
    const save = () =>
      ipc
        .addDetailsAddress(name.value, owner.value as Owner)
        .then((v) => render(v, false))
        .catch(fail);
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void save();
    });
    clear(actions, h("div", { class: "add-form" }, name, owner, h("button", { class: "btn primary", onclick: save }, "Save")));
    fit(false);
    name.focus();
    name.select();
  };
  clear(
    actions,
    h("button", { class: "btn primary", onclick: () => ipc.copyDetailsAddress().catch(fail) }, icon("copy", 15), "Copy address"),
    !known && h("button", { class: "btn secondary", onclick: showAddForm }, icon("plusCircle", 15), "Add to book"),
    h("button", { class: "btn secondary", onclick: () => ipc.openExplorer().catch(fail) }, icon("globe", 15), "Open in explorer"),
    h("span", { class: "spacer" }),
    h("button", { class: "link dismiss", onclick: () => ipc.closeDetails() }, "Close", h("span", { class: "keycaps" }, h("kbd", {}, "Esc"))),
  );

  chainBox = h("div", { class: "chain" });
  clear(
    root,
    h(
      "div",
      { class: "head" },
      h("div", { class: "tile" }, icon(STATE_ICON[r.state], 22)),
      h(
        "div",
        {},
        h("div", { class: "title" }, h("h1", { id: "headline" }, r.headline), h("span", { class: "word" }, STATE_WORD[r.state])),
        h("p", { class: "detail" }, ...detailLine(r.detail), chainChip(r.address.chain)),
      ),
    ),
    h(
      "div",
      { class: "card" },
      h(
        "div",
        { class: "address" },
        addressPlain(r.grouped),
        h("small", {}, SOURCE_LINE[view.source]),
      ),
      h(
        "dl",
        { class: "facts" },
        fact("Name", r.label ?? h("span", { class: "muted" }, "Not in your book")),
        r.note ? fact("Note", r.note) : null,
        r.label_kind ? fact("Kind", KIND[r.label_kind]) : null,
        r.source && r.source !== "manual" ? fact("Label from", h("span", { class: "muted" }, r.source)) : null,
        fact("History", historyLine(r.history)),
        chainBox,
      ),
    ),
    actions,
    error,
  );
  paintChain(undefined);
  if (view.network) {
    const address = r.address.text;
    void ipc.getOnchain([address]).then((facts) => {
      if (view?.recognition.address.text === address && facts[address]) paintChain(facts[address]);
    });
  }
  root.focus();
  fit(fresh);
  if (fresh) whenVisible(enter);
}

/** Size the window to the page. Layout is measured right away, which
 *  works while the window is still hidden. */
function fit(reveal: boolean) {
  const height = Math.ceil(document.body.getBoundingClientRect().height);
  void ipc.fitDetails(height, reveal);
}

/** The window is still hidden when the page renders; animate once it shows. */
function whenVisible(run: () => void) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    document.removeEventListener("visibilitychange", go);
    requestAnimationFrame(run);
  };
  if (document.visibilityState === "visible") go();
  else {
    document.addEventListener("visibilitychange", go);
    setTimeout(go, 400);
  }
}

function enter() {
  settling();
  void move(root, { opacity: [0, 1], y: [10, 0], scale: [0.985, 1] }, SPRING);
  const tile = root.querySelector(".tile");
  void move(tile, { scale: [0.6, 1] }, { ...POP, delay: 0.04 });
  draw(tile?.querySelector("svg") ?? null, { delay: 0.08 });
  void rise(root.querySelectorAll(".head > div:last-child > *, .card, .actions"), { y: 6, delay: 0.05, gap: 0.04 });
}

// Fonts arriving, an on-chain answer or the add form change the height.
new ResizeObserver(() => fit(false)).observe(document.body);

void on<{ address: string; fact: Fact }>("onchain", ({ address, fact: f }) => {
  if (view?.recognition.address.text === address) paintChain(f);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    void ipc.closeDetails();
  }
});

// A peek: clicking anywhere else puts it away.
void win.onFocusChanged((focused) => {
  if (!focused && view) void ipc.closeDetails();
});

void on<null>("details", () => void ipc.getDetails().then((v) => render(v)));
root.tabIndex = -1;
void ipc.getDetails().then((v) => render(v));
