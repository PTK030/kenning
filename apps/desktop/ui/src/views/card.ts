import { addressPlain, addressWithDiff, CHAIN_NAME, chainChip, detailLine } from "../address";
import { h } from "../dom";
import { icon, STATE_ICON } from "../icons";
import { onchainLine } from "../onchain";
import type { Recognition } from "../types";

/** What Kenning compared to reach its answer, in plain words. */
function checkedLines(r: Recognition): string[] {
  const lines = [`A valid ${CHAIN_NAME[r.address.chain]} address`];
  const m = r.lookalike;
  if (m) {
    const s = m.similarity;
    lines.push(
      `Shares the first ${s.same_prefix} and last ${s.same_suffix} characters with “${m.known_label ?? "a known address"}”; ${s.differing} of ${s.length} differ`,
    );
    if (r.more_lookalikes) lines.push(`Looks like ${r.more_lookalikes} more known address${r.more_lookalikes === 1 ? "" : "es"} too`);
  } else if (r.state === "mine" || r.state === "team" || r.state === "contact") {
    lines.push("Matches an address in your books exactly");
  } else if (r.state === "public") {
    lines.push(`A public label${r.source ? ` from ${r.source}` : ""}`);
  } else if (r.state === "seen" && r.history) {
    lines.push(`In your copy history: copied ${r.history.count === 1 ? "once" : `${r.history.count}×`}, not named`);
  } else {
    lines.push("Not in your book, your copy history or the public labels");
  }
  return lines;
}

/** A recognition as a card: the verdict first, then the address, then
 *  what was checked. A lookalike also shows the address it imitates. */
export function recognitionCard(r: Recognition): HTMLElement {
  const m = r.lookalike;
  return h(
    "div",
    { class: `card verdict k-${r.state}${r.state === "lookalike" ? " s-lookalike-card" : ""}` },
    h(
      "div",
      { class: "verdict-head" },
      h("span", { class: "tile" }, icon(STATE_ICON[r.state], 18)),
      h("div", {}, h("strong", {}, r.headline), h("div", { class: "muted" }, ...detailLine(r.detail), chainChip(r.address.chain))),
    ),
    h("div", { class: "verdict-addr" }, m ? addressWithDiff(r.grouped, m.candidate_spans) : addressPlain(r.grouped)),
    m &&
      h(
        "div",
        { class: "verdict-addr known" },
        h("span", { class: "who" }, m.known_label ?? "Known address"),
        addressWithDiff(m.known_grouped, m.known_spans),
      ),
    h(
      "ul",
      { class: "checked", "aria-label": "What was checked" },
      checkedLines(r).map((t) => h("li", {}, icon("check", 13), t)),
    ),
    onchainLine(r.address.text),
  );
}
