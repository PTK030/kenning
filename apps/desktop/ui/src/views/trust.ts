import { clear, h } from "../dom";
import type { Overview } from "../types";

/** "What it reads, what it writes, what it sends." Plain facts. */
export function trustView(main: HTMLElement, overview: Overview) {
  const watch = overview.config.clipboard === "watch";
  clear(
    main,
    h("header", {}, h("h1", {}, "What Kenning reads, writes and sends")),
    h(
      "div",
      { class: "trust-line", style: "margin-bottom:22px" },
      ["MIT licence", "Local-only", "No account", "No telemetry", "Network: off"].map((t) => h("span", {}, t)),
    ),
    h(
      "dl",
      { class: "facts-list" },
      h("dt", {}, "Reads"),
      h(
        "dd",
        {},
        h(
          "p",
          { style: "margin-top:0" },
          watch
            ? "The clipboard, each time it changes, because you chose “Every time I copy”."
            : `The clipboard, only when you press ${overview.config.shortcut} or choose “Check clipboard now”.`,
          " Text longer than 4 KB is skipped. Content that the copying app marks as private (password managers do) is skipped before it is read.",
        ),
        h("p", {}, "Your book, settings and shared books listed in Settings."),
      ),
      h("dt", {}, "Writes"),
      h(
        "dd",
        {},
        h("p", { style: "margin-top:0" }, h("code", {}, "book.toml"), " when you add, rename or remove an address."),
        h("p", {}, h("code", {}, "history.json"), ": addresses you copied, how often and when. Only text that is a valid address, never other clipboard content. Can be turned off."),
        h("p", {}, h("code", {}, "journal.jsonl"), ": checks and decisions, for your own audit trail."),
        h("p", {}, "The clipboard, only when you click “Copy the correct address”."),
        h("p", { class: "muted" }, `All in ${overview.home}`),
      ),
      h("dt", {}, "Sends"),
      h(
        "dd",
        {},
        h(
          "p",
          { style: "margin-top:0" },
          "Nothing. Kenning's recognition engine has no network code; a build check rejects any networking library in it. There are no update checks, analytics or crash reports.",
        ),
      ),
      h("dt", {}, "Public labels"),
      h(
        "dd",
        {},
        h("p", { style: "margin-top:0" }, `${overview.public_label_count} built in, each with a source you can check. They ship with the app; nothing is downloaded.`),
      ),
    ),
  );
}
