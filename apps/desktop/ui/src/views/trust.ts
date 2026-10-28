import { h } from "../dom";
import type { Overview } from "../types";

/** "What it reads, what it writes, what it sends." Plain facts, for the last
 *  card of Settings, next to the switches that change them. */
export function privacyFacts(overview: Overview): HTMLElement[] {
  const watch = overview.config.clipboard === "watch";
  return [
    h(
      "div",
      { class: "trust-line" },
      ["MIT licence", "Local-only", "No account", "No telemetry", overview.config.network ? "Network: addresses only" : "Network: off"].map(
        (t) => h("span", {}, t),
      ),
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
        h(
          "p",
          {},
          `The selection in the app you are using, only when you press ${overview.config.details_shortcut}: Kenning presses Ctrl+Insert to copy it, reads it, and puts back what was on the clipboard. Nothing it reads that way is recorded in your history.`,
        ),
        overview.config.guard &&
          h(
            "p",
            {},
            "Every clipboard change, the moment it happens, because the clipboard guard is on: what was written, which program wrote it, and whether a key was pressed since. Only what it catches is kept, in memory until Kenning quits; a recovery phrase or key is noted by its kind, never its words.",
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
        h("p", {}, "The clipboard, only when you click “Copy the correct address” or “Copy address”, and to put it back after copying the selection."),
        h("p", { class: "muted" }, `All in ${overview.home}`),
      ),
      h("dt", {}, "Sends"),
      h(
        "dd",
        {},
        overview.config.network
          ? h(
              "div",
              {},
              h(
                "p",
                { style: "margin-top:0" },
                "You turned on on-chain lookups. For each address Kenning shows, it sends that address, and only that address, to one of these hosts:",
              ),
              h(
                "ul",
                {},
                overview.hosts.map(([host, why]) => h("li", {}, h("code", {}, host), " ", h("span", { class: "muted" }, why))),
              ),
              h("p", {}, "Answers are cached for an hour. Turn this off under Network above, or from the tray menu."),
            )
          : h(
              "p",
              { style: "margin-top:0" },
              "Nothing. The network is off. Kenning's recognition engine has no network code at all; a build check rejects any networking library in it. There are no update checks, analytics or crash reports.",
            ),
      ),
      h("dt", {}, "Public labels"),
      h(
        "dd",
        {},
        h("p", { style: "margin-top:0" }, `${overview.public_label_count} built in, each with a source you can check. They ship with the app; nothing is downloaded.`),
      ),
    ),
  ];
}
