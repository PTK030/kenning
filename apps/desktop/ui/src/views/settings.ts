import { networkMark } from "../chainMarks";
import { confirmSheet } from "../confirmSheet";
import { clear, h, type Child } from "../dom";
import { icon, type IconName } from "../icons";
import { ipc, message } from "../ipc";
import { collapse, fold, move, SPRING } from "../motion";
import type { Config, Overview } from "../types";
import { toast } from "../toast";
import { shortcutSection } from "./shortcutSettings";
import { updateSheet } from "./updateSheet";

/** Where the page was scrolled, kept across the redraw that follows a save. */
let keepScroll = 0;

/** A group of settings: an icon tile, a title and one line, then the rows. */
export function card(ic: IconName, title: string, desc: string | null, ...body: Child[]): HTMLElement {
  return h(
    "section",
    { class: "set-card" },
    h("header", { class: "set-head" }, h("span", { class: "ic" }, icon(ic, 18)), h("div", {}, h("h2", {}, title), desc && h("p", { class: "muted" }, desc))),
    h("div", { class: "set-body" }, ...body),
  );
}

/** `card` with an action in its header, at the right of the title. */
function withAction(section: HTMLElement, action: HTMLElement): HTMLElement {
  section.querySelector(".set-head")?.append(action);
  return section;
}

/** A yes/no setting as a row with a switch. */
export function toggleRow(ic: IconName, title: string, text: string, checked: boolean, set: (on: boolean) => void): HTMLElement {
  return h(
    "label",
    { class: "toggle" },
    h("span", { class: "ic" }, icon(ic, 16)),
    h("span", {}, h("strong", {}, title), h("span", { class: "muted small" }, text)),
    h("input", { type: "checkbox", role: "switch", checked, onchange: (e: Event) => set((e.target as HTMLInputElement).checked) }),
    h("span", { class: "switch", "aria-hidden": "true" }),
  );
}

export function settingsView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  const c: Config = structuredClone(overview.config);
  const saved = JSON.stringify(overview.config);

  // Clipboard: one of two, as radio rows in the rhythm of the switches.
  const choice = (value: Config["clipboard"], title: string, text: string) =>
    h(
      "label",
      { class: "radio-row" },
      h("input", { type: "radio", name: "clipboard-mode", checked: c.clipboard === value, onchange: () => (c.clipboard = value) }),
      h("span", { class: "radio", "aria-hidden": "true" }),
      h("span", {}, h("strong", {}, title), h("span", { class: "muted small" }, text)),
    );

  const seconds = h("input", { type: "range", min: 2, max: 7, value: c.badge_seconds, "aria-label": "How long the badge stays" });
  const secondsLabel = h("span", { class: "value" }, `${c.badge_seconds} s`);
  seconds.addEventListener("input", () => {
    c.badge_seconds = Number(seconds.value);
    secondsLabel.textContent = `${c.badge_seconds} s`;
  });

  const rule = (key: keyof Config["lookalike"], label: string, hint: string) => {
    const input = h("input", { type: "number", min: 1, max: 20, value: c.lookalike[key], "aria-label": label });
    input.addEventListener("input", () => (c.lookalike[key] = Number(input.value)));
    return h("label", { class: "rule" }, h("span", { class: "field-label" }, label), input, h("span", { class: "muted small" }, hint));
  };

  const books = h("textarea", { rows: 3, "aria-label": "Shared books", placeholder: "~/repo/ops/kenning.toml" });
  books.value = c.books.join("\n");
  books.addEventListener("input", () => (c.books = books.value.split("\n").map((s) => s.trim()).filter(Boolean)));

  // Network: the EVM networks asked, as chips; your own servers folded
  // away under them, open when one is set.
  const field = (label: string, value: string | null | undefined, placeholder: string, set: (v: string | null) => void, secret = false) => {
    const input = h("input", {
      type: secret ? "password" : "text",
      value: value ?? "",
      placeholder,
      "aria-label": label,
      autocomplete: "off",
      spellcheck: "false",
    });
    input.addEventListener("input", () => set(input.value.trim() || null));
    return h("label", { class: "set-field" }, h("span", { class: "field-label" }, label), input);
  };
  const chips = h(
    "div",
    { class: "net-chips", role: "group", "aria-label": "Networks for EVM addresses" },
    overview.evm_choices.map(([id, name, host]) => {
      const chip = h(
        "button",
        { type: "button", class: "net-chip", "aria-pressed": String(c.evm_networks.includes(id)), title: `Asks ${host}` },
        networkMark(id, 18),
        name,
      );
      chip.addEventListener("click", () => {
        const on = c.evm_networks.includes(id);
        // One network at least: with none, an EVM address could not be looked up.
        if (on && c.evm_networks.length === 1) return;
        c.evm_networks = on ? c.evm_networks.filter((n) => n !== id) : overview.evm_choices.map(([i]) => i).filter((i) => i === id || c.evm_networks.includes(i));
        chip.setAttribute("aria-pressed", String(!on));
      });
      return chip;
    }),
  );
  const servers = h(
    "div",
    { class: "servers" },
    field("Solana RPC", c.solana_rpc, "https://api.mainnet-beta.solana.com (default)", (v) => (c.solana_rpc = v)),
    field("Bitcoin server", c.bitcoin_api, "https://mempool.space (default), or your own mempool", (v) => (c.bitcoin_api = v)),
    field("TronGrid key", c.trongrid_key, "None: the shared public limits", (v) => (c.trongrid_key = v), true),
    h("p", { class: "muted small" }, "Your own mempool server (on Umbrel, Start9 or your node) means no one else sees which Bitcoin addresses you look up. The key is kept in config.toml."),
  );
  const serversToggle = h(
    "button",
    { type: "button", class: "group-toggle servers-toggle" },
    icon("chevronDown", 16, "chev"),
    h("span", { class: "group-name" }, "Your own servers"),
    h("span", { class: "muted" }, "optional"),
  );
  fold(serversToggle, servers, !!(c.solana_rpc || c.bitcoin_api || c.trongrid_key), false);
  serversToggle.addEventListener("click", () => fold(serversToggle, servers, serversToggle.getAttribute("aria-expanded") !== "true"));

  const save = async () => {
    try {
      await ipc.saveConfig(c);
      toast("Settings saved");
      keepScroll = main.scrollTop;
      settling = true;
      await hideBar();
      await refresh();
    } catch (e) {
      toast(message(e), "error");
    }
  };
  const discard = async () => {
    keepScroll = main.scrollTop;
    settling = true;
    await hideBar();
    await refresh();
  };

  // The bar appears when something differs from what is saved, and stays in
  // view at the bottom while you scroll.
  const saveBtn = h("button", { class: "btn primary", onclick: () => void save() }, "Save");
  const bar = h(
    "div",
    { class: "save-bar", hidden: true, role: "status" },
    h("span", {}, icon("info", 16), "Unsaved changes"),
    h("span", { class: "spacer" }),
    h("button", { class: "btn ghost", onclick: () => void discard() }, "Discard"),
    saveBtn,
  );
  let dirty = false;
  /** Saved or discarded, and waiting for the page to redraw: the settings
   *  still differ until then, and the click that did it must not call the
   *  bar back (it would cut its leaving short, and the redraw with it). */
  let settling = false;
  /** The bar leaves the way it came: back down, fading. */
  const hideBar = async () => {
    dirty = false;
    if (bar.hidden) return;
    // Its room closes as it goes, so the page does not jump at the end.
    await collapse(bar, { y: 12, still: () => !dirty });
  };
  const check = () => {
    if (settling) return;
    const now = JSON.stringify(c) !== saved;
    if (now === dirty) return;
    if (!now) return void hideBar();
    dirty = true;
    bar.hidden = false;
    void move(bar, { opacity: [0, 1], y: [12, 0] }, SPRING);
  };
  for (const type of ["input", "change", "click", "keyup"]) main.addEventListener(type, () => queueMicrotask(check));
  main.addEventListener("keydown", (e) => {
    if (dirty && e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
    }
  });

  clear(
    main,
    h("header", {}, h("h1", {}, "Settings"), h("p", { class: "lead" }, "Nothing changes until you save. Ctrl+S saves.")),
    card(
      "clipboard",
      "Clipboard",
      "When Kenning looks at what you copied.",
      choice("shortcut", "When I press the shortcut", `Reads the clipboard only when you press ${c.shortcut}.`),
      choice("watch", "Every time I copy", "Looks at each copy. Only a single address is recognised; nothing else is kept."),
      h("div", { class: "set-row" }, h("span", { class: "field-label" }, "The badge stays for"), seconds, secondsLabel),
      toggleRow("volume", "Soft sounds", "A short chime when an address is recognised, a lower one for a lookalike.", c.sounds, (on) => (c.sounds = on)),
    ),
    card(
      "keyboard",
      "Keyboard shortcuts",
      "Click one and press the keys you want. The two that work in every app need two modifiers.",
      shortcutSection(c),
    ),
    card(
      "history",
      "What Kenning keeps",
      "All of it stays on this computer.",
      toggleRow("history", "Remember addresses I copy", "Lets Kenning say “copied 14×” and catch lookalikes of addresses you have not named. Addresses only, never other clipboard text.", c.history, (on) => (c.history = on)),
      toggleRow("journal", "Keep a verification journal", "A local record of checks and decisions, for audits.", c.journal, (on) => (c.journal = on)),
      toggleRow("power", "Start with Windows", "Kenning waits in the tray from the moment you sign in.", c.autostart, (on) => (c.autostart = on)),
      h(
        "div",
        { class: "set-row" },
        h("span", { class: "muted small" }, `${overview.history_count} address${overview.history_count === 1 ? "" : "es"} in your copy history.`),
        h("span", { class: "spacer" }),
        h(
          "button",
          {
            class: "btn",
            disabled: !overview.history_count,
            onclick: async () => {
              const ok = await confirmSheet({
                title: "Clear the copy history?",
                body: `Kenning forgets the ${overview.history_count} addresses you copied. Your book and the journal stay.`,
                confirm: "Clear history",
                danger: true,
              });
              if (!ok) return;
              try {
                await ipc.clearHistory();
                toast("Copy history cleared");
                keepScroll = main.scrollTop;
                await refresh();
              } catch (e) {
                toast(message(e), "error");
              }
            },
          },
          "Clear history",
        ),
      ),
    ),
    card("users", "Shared books", "Read-only books, one path per line. Point at a file in your team's repository so everyone sees one list.", books),
    card(
      "alert",
      "Lookalike rules",
      "How many characters must match at the start and end before Kenning calls an address a lookalike. Higher means fewer, surer alerts.",
      h(
        "div",
        { class: "rules" },
        rule("min_prefix", "Start", "first characters"),
        rule("min_suffix", "End", "last characters"),
        rule("min_total_personal", "Total, yours", "for your addresses"),
        rule("min_total_public", "Total, public", "for public labels"),
      ),
    ),
    card(
      "globe",
      "Network",
      "Off unless you turn it on. Only the address is sent.",
      toggleRow(
        "globe",
        "Look addresses up on chain",
        "Shows whether an address was ever used and whether it is a verified contract. A lookalike that was never used is a strong sign.",
        c.network,
        (on) => (c.network = on),
      ),
      h(
        "div",
        { class: "set-row net-row" },
        h("span", { class: "row-label" }, h("strong", {}, "EVM networks"), h("span", { class: "muted small" }, "An EVM address is the same on all of them; each is asked.")),
        chips,
      ),
      h("div", { class: "servers-wrap" }, serversToggle, servers),
    ),
    withAction(
      card(
        "download",
        "Updates",
        "Kenning asks github.com for the latest version, and sends nothing of yours.",
        toggleRow(
          "download",
          "Check for updates",
          "At start and every 12 hours. A new version installs only when you say so, and only with a valid signature.",
          c.update_check,
          (on) => (c.update_check = on),
        ),
      ),
      // Not a setting: an action on the whole card, beside its title.
      h(
        "button",
        {
          type: "button",
          class: "btn",
          onclick: async () => updateSheet({ version: overview.version, found: await ipc.updateFound(), daily: overview.config.update_check }),
        },
        icon("refresh", 15),
        "Check now",
      ),
    ),
    bar,
  );

  if (keepScroll) {
    main.scrollTop = keepScroll;
    keepScroll = 0;
  }
}
