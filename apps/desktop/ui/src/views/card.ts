import { addressPlain, addressWithDiff, CHAIN_NAME, chainChip, detailLine, short, STATE_WORD } from "../address";
import { h, type Child } from "../dom";
import { icon, STATE_ICON } from "../icons";
import { fold } from "../motion";
import { onchainLine } from "../onchain";
import type { Recognition } from "../types";

/** How many addresses an answer was compared with. A "not found" is only
 *  as strong as this, so it is shown with that answer and nowhere else. */
export type Scope = { book: number; history: number; labels: number };

const count = (n: number, one: string, many = `${one}es`) => `${n} ${n === 1 ? one : many}`;

/** What Kenning compared to reach its answer, in plain words. */
function checkedLines(r: Recognition, scope?: Scope): string[] {
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
  } else if (scope) {
    lines.push(
      scope.book
        ? `Not among the ${count(scope.book, "address")} in your book, ${scope.history} you copied or ${scope.labels} public labels`
        : `Not among the ${scope.history} addresses you copied or ${scope.labels} public labels; your book is empty`,
    );
  } else {
    lines.push("Not in your book, your copy history or the public labels");
  }
  return lines;
}

/** What a verdict shows under its headline: the address (and the one it
 *  imitates, for a lookalike), what was checked, and the chain's answer. */
function details(r: Recognition, scope?: Scope): Child[] {
  const m = r.lookalike;
  return [
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
      checkedLines(r, scope).map((t) => h("li", {}, icon("check", 13), t)),
    ),
    onchainLine(r.address.text),
  ];
}

/** A recognition as a card: the verdict first, then the address, then
 *  what was checked. A lookalike also shows the address it imitates. */
export function recognitionCard(r: Recognition, scope?: Scope): HTMLElement {
  return h(
    "div",
    { class: `card verdict k-${r.state}${r.state === "lookalike" ? " s-lookalike-card" : ""}` },
    h(
      "div",
      { class: "verdict-head" },
      h("span", { class: "tile" }, icon(STATE_ICON[r.state], 18)),
      h("div", {}, h("strong", {}, r.headline), h("div", { class: "muted" }, ...detailLine(r.detail), chainChip(r.address.chain))),
    ),
    ...details(r, scope),
  );
}

/** Worst first: what needs a look before what is already known. */
const RANK: Record<Recognition["state"], number> = { lookalike: 0, new: 1, seen: 2, mine: 3, team: 3, contact: 3, public: 4 };

/** Several answers at once, as one card: a line on what was found, then a
 *  row each, worst first. A row opens in place to the same details a card
 *  shows; lookalikes are open from the start. */
export function recognitionList(found: Recognition[], scope?: Scope): HTMLElement {
  const sorted = [...found].sort((a, b) => RANK[a.state] - RANK[b.state]);
  const n = (test: (r: Recognition) => boolean) => found.filter(test).length;
  const lookalikes = n((r) => r.state === "lookalike");
  const unknown = n((r) => r.state === "new" || r.state === "seen");
  const known = found.length - lookalikes - unknown;
  const sum = [
    `${found.length} addresses`,
    lookalikes && `${lookalikes} lookalike${lookalikes === 1 ? "" : "s"}`,
    unknown && `${unknown} not named`,
    known && `${known} known`,
  ].filter((x): x is string => !!x);
  return h(
    "div",
    { class: "card found-list" },
    h("p", { class: "found-sum" }, ...detailLine(sum.join(" · "))),
    h("ul", {}, sorted.map((r) => row(r, scope))),
  );
}

function row(r: Recognition, scope?: Scope): HTMLElement {
  const body = h("div", { class: "found-body" }, ...details(r, scope));
  const open = r.state === "lookalike";
  const toggle = h(
    "button",
    { type: "button", class: "found-row", onclick: () => fold(toggle, body, toggle.getAttribute("aria-expanded") !== "true") },
    h("span", { class: "tile" }, icon(STATE_ICON[r.state], 16)),
    h(
      "span",
      { class: "found-main" },
      h("strong", {}, r.headline),
      h("span", { class: "found-meta" }, STATE_WORD[r.state], h("i", { class: "sep", "aria-hidden": "true" }), h("span", { class: "addr" }, short(r.address.text))),
    ),
    chainChip(r.address.chain),
    h("span", { class: "chev" }, icon("chevronDown", 16)),
  );
  fold(toggle, body, open, false);
  return h("li", { class: `found k-${r.state}` }, toggle, body);
}
