import { short } from "../address";
import { clear, h } from "../dom";
import { ipc } from "../ipc";
import type { JournalRecord, Overview } from "../types";

const ACTION: Record<JournalRecord["action"], string> = {
  checked: "Checked",
  lookalike_shown: "Lookalike shown",
  copied_correct: "Copied correct address",
  marked_mine: "Marked as mine",
  added: "Added",
  removed: "Removed",
};

export async function journalView(main: HTMLElement, overview: Overview) {
  const records = await ipc.journal(500);
  clear(
    main,
    h(
      "header",
      {},
      h("h1", {}, "Journal"),
      h("span", { class: "muted" }, "A local record of what was checked, by whom and when."),
    ),
    !overview.config.journal && h("div", { class: "notice", style: "margin-bottom:12px" }, "The journal is turned off in Settings."),
    records.length
      ? h(
          "table",
          {},
          h("thead", {}, h("tr", {}, ["When", "Who", "What", "Result", "Address", "Name"].map((t) => h("th", {}, t)))),
          h(
            "tbody",
            {},
            records.map((r) =>
              h(
                "tr",
                {},
                h("td", { style: "white-space:nowrap" }, new Date(r.at).toLocaleString()),
                h("td", {}, r.user),
                h("td", {}, ACTION[r.action] ?? r.action),
                h("td", {}, r.state),
                h("td", { title: r.address }, h("span", { class: "addr" }, short(r.address))),
                h("td", {}, r.label ?? ""),
              ),
            ),
          ),
        )
      : h("div", { class: "empty" }, "Nothing yet. Checks with the shortcut, lookalikes and changes to your book show up here."),
  );
}
