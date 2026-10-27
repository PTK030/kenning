import { clear, h } from "../dom";
import { ipc, message } from "../ipc";
import type { Config, Overview } from "../types";
import { shortcutSection } from "./shortcutSettings";
import { privacySection } from "./trust";

function networkSection(c: Config): HTMLElement {
  const rpc = h("input", {
    type: "text",
    value: c.solana_rpc ?? "",
    placeholder: "https://api.mainnet-beta.solana.com (default)",
    style: "width:100%",
    "aria-label": "Solana RPC",
  });
  rpc.addEventListener("input", () => (c.solana_rpc = rpc.value.trim() || null));
  return h(
    "section",
    {},
    h("h2", {}, "Network"),
    h(
      "label",
      { class: "option", style: "max-width:720px" },
      h("input", {
        type: "checkbox",
        checked: c.network,
        onchange: (e: Event) => (c.network = (e.target as HTMLInputElement).checked),
      }),
      h(
        "span",
        {},
        h("strong", {}, "Look addresses up on chain"),
        h(
          "span",
          { class: "muted" },
          " Shows whether an address has ever been used, how many transactions it has and whether it is a verified contract. A lookalike that was never used is a strong sign. Only the address is sent, to the hosts listed below. Off by default.",
        ),
      ),
    ),
    h("div", { class: "form", style: "margin-top:12px" }, h("label", {}, "Solana RPC"), rpc),
  );
}

export function settingsView(main: HTMLElement, overview: Overview, refresh: () => Promise<void>) {
  const c: Config = structuredClone(overview.config);
  const notice = h("div");
  const say = (text: string, error = false) => clear(notice, h("div", { class: `notice${error ? " error" : ""}` }, text));

  const radio = (value: Config["clipboard"], title: string, text: string) =>
    h(
      "label",
      { class: "option" },
      h("input", {
        type: "radio",
        name: "clipboard",
        checked: c.clipboard === value,
        onchange: () => (c.clipboard = value),
      }),
      h("span", {}, h("strong", {}, title), h("span", { class: "muted" }, text)),
    );

  const toggle = (key: "history" | "journal" | "autostart" | "sounds", title: string, text: string) =>
    h(
      "label",
      { class: "option" },
      h("input", {
        type: "checkbox",
        checked: c[key],
        onchange: (e: Event) => (c[key] = (e.target as HTMLInputElement).checked),
      }),
      h("span", {}, h("strong", {}, title), h("span", { class: "muted" }, text)),
    );

  const seconds = h("input", { type: "range", min: 2, max: 7, value: c.badge_seconds, "aria-label": "Badge seconds" });
  const secondsLabel = h("span", {}, `${c.badge_seconds} s`);
  seconds.addEventListener("input", () => {
    c.badge_seconds = Number(seconds.value);
    secondsLabel.textContent = `${c.badge_seconds} s`;
  });

  const num = (key: keyof Config["lookalike"], label: string) => {
    const input = h("input", { type: "number", min: 1, max: 20, value: c.lookalike[key], style: "width:80px" });
    input.addEventListener("input", () => (c.lookalike[key] = Number(input.value)));
    return [h("label", {}, label), input];
  };

  const books = h("textarea", { rows: 3, style: "width:100%", "aria-label": "Shared books", placeholder: "~/repo/ops/kenning.toml" });
  books.value = c.books.join("\n");
  books.addEventListener("input", () => (c.books = books.value.split("\n").map((s) => s.trim()).filter(Boolean)));

  const save = async () => {
    try {
      await ipc.saveConfig(c);
      await refresh();
    } catch (e) {
      say(message(e), true);
    }
  };

  clear(
    main,
    h("header", {}, h("h1", {}, "Settings"), h("span", { class: "spacer" }), h("button", { class: "btn primary", onclick: save }, "Save")),
    notice,
    h(
      "section",
      {},
      h("h2", {}, "Clipboard"),
      h(
        "div",
        { style: "display:grid;gap:8px;max-width:720px" },
        radio("shortcut", "Only when I press the shortcut", " Kenning reads the clipboard only when you ask. Default."),
        radio("watch", "Every time I copy", " Kenning looks at each copy. Only single addresses are recognised; everything else is ignored and nothing is stored."),
        toggle("sounds", "Soft sounds", " A short chime when an address is recognised, a lower one for a lookalike."),
      ),
      h(
        "div",
        { class: "form", style: "margin-top:12px" },
        h("label", {}, "Badge stays"),
        h("div", { class: "inline" }, seconds, secondsLabel),
      ),
    ),
    shortcutSection(c),
    h(
      "section",
      {},
      h("h2", {}, "What Kenning keeps"),
      h(
        "div",
        { style: "display:grid;gap:8px;max-width:720px" },
        toggle("history", "Remember addresses I copy", " Lets Kenning say “copied 14×” and spot lookalikes of addresses you have not named. Addresses only, never other clipboard text."),
        toggle("journal", "Keep a verification journal", " A local log of checks and decisions, for audits."),
        toggle("autostart", "Start with Windows", ""),
      ),
      h(
        "div",
        { class: "inline", style: "margin-top:10px" },
        h(
          "button",
          {
            class: "btn",
            onclick: async () => {
              if (!confirm(`Forget all ${overview.history_count} remembered addresses?`)) return;
              await ipc.clearHistory();
              await refresh();
            },
          },
          `Clear history (${overview.history_count})`,
        ),
      ),
    ),
    h(
      "section",
      {},
      h("h2", {}, "Shared books"),
      h("p", { class: "muted", style: "margin:0 0 8px" }, "Read-only books, one path per line. Point at a file in your team's repo so everyone sees one list."),
      books,
    ),
    h(
      "section",
      {},
      h("h2", {}, "Lookalike rules"),
      h("p", { class: "muted", style: "margin:0 0 8px" }, "Characters that must match at the start and end of an address before Kenning calls it a lookalike. Higher means fewer, surer alerts."),
      h(
        "div",
        { class: "form" },
        num("min_prefix", "Start"),
        num("min_suffix", "End"),
        num("min_total_personal", "Total, yours"),
        num("min_total_public", "Total, public"),
      ),
    ),
    networkSection(c),
    privacySection(overview),
  );
}
