import { confirmSheet } from "../confirmSheet";
import { clear, h, type Child } from "../dom";
import { icon, type IconName } from "../icons";
import { ipc, message } from "../ipc";
import { move, SPRING } from "../motion";
import type { Config, Overview } from "../types";
import { toast } from "../toast";
import { shortcutSection } from "./shortcutSettings";
import { privacyFacts } from "./trust";

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

  // Clipboard: two choices, as cards.
  const choice = (value: Config["clipboard"], ic: IconName, title: string, text: string) => {
    const b = h(
      "button",
      { type: "button", class: "choice", "aria-pressed": String(c.clipboard === value) },
      h("span", { class: "ic" }, icon(ic, 18)),
      h("span", {}, h("strong", {}, title), h("span", { class: "muted small" }, text)),
    );
    b.addEventListener("click", () => {
      c.clipboard = value;
      for (const el of main.querySelectorAll(".choice")) el.setAttribute("aria-pressed", String(el === b));
    });
    return b;
  };

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

  const rpc = h("input", { type: "text", value: c.solana_rpc ?? "", placeholder: "https://api.mainnet-beta.solana.com (default)", "aria-label": "Solana RPC" });
  rpc.addEventListener("input", () => (c.solana_rpc = rpc.value.trim() || null));

  const save = async () => {
    try {
      await ipc.saveConfig(c);
      toast("Settings saved");
      keepScroll = main.scrollTop;
      await refresh();
    } catch (e) {
      toast(message(e), "error");
    }
  };
  const discard = async () => {
    keepScroll = main.scrollTop;
    await refresh();
  };

  // The bar appears when something differs from what is saved, and stays in
  // view at the bottom while you scroll.
  const saveBtn = h("button", { class: "btn primary ready", onclick: () => void save() }, "Save");
  const bar = h(
    "div",
    { class: "save-bar", hidden: true, role: "status" },
    h("span", {}, icon("info", 16), "Unsaved changes"),
    h("span", { class: "spacer" }),
    h("button", { class: "btn ghost", onclick: () => void discard() }, "Discard"),
    saveBtn,
  );
  let dirty = false;
  const check = () => {
    const now = JSON.stringify(c) !== saved;
    if (now === dirty) return;
    dirty = now;
    bar.hidden = !dirty;
    if (dirty) void move(bar, { opacity: [0, 1], y: [12, 0] }, SPRING);
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
      h(
        "div",
        { class: "choices" },
        choice("shortcut", "keyboard", "When I press the shortcut", `Kenning reads the clipboard only when you press ${c.shortcut}. The default.`),
        choice("watch", "clipboard", "Every time I copy", "Kenning looks at each copy. Only single addresses are recognised; everything else is ignored and nothing is stored."),
      ),
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
      h("label", { class: "set-field" }, h("span", { class: "field-label" }, "Solana RPC"), rpc),
    ),
    h("div", { id: "privacy" }, card("fileCheck", "What Kenning reads, writes and sends", null, ...privacyFacts(overview))),
    bar,
  );

  if (keepScroll) {
    main.scrollTop = keepScroll;
    keepScroll = 0;
  }
}
