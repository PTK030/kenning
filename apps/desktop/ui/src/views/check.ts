import { addressWithDiff, CHAIN_NAME } from "../address";
import { clear, h } from "../dom";
import { icon } from "../icons";
import { ipc, message } from "../ipc";
import { move, rise, SPRING } from "../motion";
import type { Comparison, Overview } from "../types";
import { recognitionCard } from "./card";

// A made-up pair for "Try an example": a real-looking address and one that
// shares its first 6 and last 4 characters. Nothing is saved or recorded.
const EXAMPLE_EXPECTED = "0x28C6c06298d514Db089934071355E5743bf21d60";
const EXAMPLE_PASTED = "0x28C6C0aaAAaAAAaaAaAaAAaaAAaaaaaaAAaA1d60";

/** Paste anything and every address in it is recognised, or compare the
 *  address you expected with the one you are about to use. Nothing pasted
 *  here is stored. */
export function checkView(main: HTMLElement, overview: Overview) {
  const results = h("div", { class: "check-results" });
  const body = h("div");

  // What the answers are compared against: the system's status, not a tip.
  const status = h(
    "p",
    { class: "check-status" },
    icon("book", 15),
    overview.book_count
      ? `Compared with ${overview.book_count} address${overview.book_count === 1 ? "" : "es"} in your book, ${overview.history_count} you copied, and ${overview.public_label_count} public labels.`
      : h(
          "span",
          {},
          `Your book is empty, so only the ${overview.history_count} addresses you copied and ${overview.public_label_count} public labels are compared. `,
          h("a", { class: "link", href: "#book" }, "Add your first address"),
        ),
  );

  const pasteMode = () => {
    const input = h("textarea", {
      rows: 4,
      placeholder: "0x… or a whole message, an invoice, a transaction",
      "aria-label": "Text to check",
    });
    const show = async () => {
      const text = input.value;
      if (!text.trim()) return clear(results);
      const found = await ipc.recognizeText(text);
      if (!found.length) return clear(results, h("div", { class: "empty" }, "No address in this text."));
      clear(results, found.map(recognitionCard));
      void rise(results.children, { y: 8, gap: 0.05 });
      if (overview.config.network) for (const r of found) void ipc.lookupOnchain(r.address.text).catch(() => {});
    };
    input.addEventListener("input", () => void show());
    clear(
      body,
      h("label", { class: "field-label" }, "Paste anything with addresses in it"),
      input,
      h(
        "div",
        { class: "check-foot" },
        h("span", { class: "muted" }, "Every address in the text is checked. Nothing you paste is stored."),
        h("button", { class: "link", onclick: () => compareMode() }, "Compare with the address you expected"),
      ),
    );
    clear(results);
    input.focus();
  };

  const compareMode = (example = false) => {
    const expected = h("input", { type: "text", class: "addr", placeholder: "From the invoice, the chat, the person", "aria-label": "The address you expected" });
    const actual = h("input", { type: "text", class: "addr", placeholder: "The one in your wallet, about to be used", "aria-label": "The address you are about to use" });
    const show = async () => {
      const [want, have] = [expected.value.trim(), actual.value.trim()];
      if (!want || !have) return clear(results);
      try {
        // The one about to be used is the candidate, the expected one is known.
        clear(results, comparisonCard(await ipc.compareAddresses(have, want), overview, example));
        void move(results.firstElementChild, { opacity: [0, 1], y: [8, 0] }, SPRING);
      } catch (e) {
        clear(results, h("div", { class: "notice" }, message(e)));
      }
    };
    expected.addEventListener("input", () => void show());
    actual.addEventListener("input", () => void show());
    clear(
      body,
      h(
        "div",
        { class: "compare" },
        h("label", { class: "field-label" }, "The address you expected"),
        expected,
        h("label", { class: "field-label" }, "The address you are about to use"),
        actual,
      ),
      h(
        "div",
        { class: "check-foot" },
        h("span", { class: "muted" }, "Kenning compares every character, so you don't have to."),
        h("button", { class: "link", onclick: () => pasteMode() }, "Check a text instead"),
      ),
    );
    if (example) {
      expected.value = EXAMPLE_EXPECTED;
      actual.value = EXAMPLE_PASTED;
      void show();
    } else {
      clear(results);
      expected.focus();
    }
  };

  clear(
    main,
    h(
      "header",
      {},
      h("h1", {}, "Check"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn ghost", onclick: () => compareMode(true) }, icon("info", 16), "Try an example"),
      h(
        "p",
        { class: "lead" },
        overview.config.network
          ? "See what Kenning knows about an address before you use it. Each address is also looked up on chain."
          : "See what Kenning knows about an address before you use it.",
      ),
    ),
    status,
    h("section", { class: "card check-input" }, body),
    results,
  );
  pasteMode();
}

/** Two addresses, every character compared, and what that means. */
function comparisonCard(c: Comparison, overview: Overview, example: boolean): HTMLElement {
  const s = c.similarity;
  const rules = overview.config.lookalike;
  // The same test the lookalike window uses (Settings › Lookalike rules).
  const poisonLike = !c.same && s.same_prefix >= rules.min_prefix && s.same_suffix >= rules.min_suffix;
  const kind = c.same ? "mine" : "lookalike";
  return h(
    "div",
    { class: `card verdict k-${kind}${c.same ? "" : " s-lookalike-card"}` },
    h(
      "div",
      { class: "verdict-head" },
      h("span", { class: "tile" }, icon(c.same ? "checkCircle" : "alert", 18)),
      h(
        "div",
        {},
        h("strong", {}, c.same ? "The same address." : "Not the address you expected."),
        h(
          "div",
          { class: "muted" },
          c.same ? "Every character matches." : `${s.differing} of ${s.length} characters differ.`,
          example && h("span", { class: "meta-chip" }, "Example"),
        ),
      ),
    ),
    h("div", { class: "verdict-addr known" }, h("span", { class: "who" }, "You expected"), addressWithDiff(c.b_grouped, c.b_spans)),
    h("div", { class: "verdict-addr" }, h("span", { class: "who" }, "You are about to use"), addressWithDiff(c.a_grouped, c.a_spans)),
    poisonLike &&
      h(
        "p",
        { class: "verdict-why" },
        `The first ${s.same_prefix} and last ${s.same_suffix} characters match, the middle does not. That is what a poisoned address looks like: made to pass a glance at its ends. Copy the address from where you got it, not from your history.`,
      ),
    c.same && h("ul", { class: "checked" }, h("li", {}, icon("check", 13), `The same ${CHAIN_NAME[c.chain]} address, letter case aside`)),
  );
}
