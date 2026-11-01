import { addressWithDiff, CHAIN_NAME } from "../address";
import { clear, h, type Child } from "../dom";
import { icon } from "../icons";
import { ipc, message } from "../ipc";
import { move, rise, sink, SPRING } from "../motion";
import type { CompareProblem, Comparison, Overview } from "../types";
import { segmented } from "../segmented";
import { recognitionCard, recognitionList, type Scope } from "./card";

// A made-up pair for "Try an example": a real-looking address and one that
// shares its first 6 and last 4 characters. Nothing is saved or recorded.
const EXAMPLE_EXPECTED = "0x28C6c06298d514Db089934071355E5743bf21d60";
const EXAMPLE_PASTED = "0x28C6C0aaAAaAAAaaAaAaAAaaAAaaaaaaAAaA1d60";

/** Paste anything and every address in it is recognised, or compare the
 *  address you expected with the one you are about to use. Nothing pasted
 *  here is stored. Laid out as the Journal is: the two ways in a switch in
 *  the header, a line on what answers are compared with, then the page. */
export function checkView(main: HTMLElement, overview: Overview) {
  const results = h("div", { class: "check-results" });
  const body = h("div");

  // What the answers are compared with goes on each answer that depends on
  // it (a "not found"). Above the field only when it changes what to do:
  // with an empty book, lookalikes are caught only against what you copied
  // and the public labels.
  const scope: Scope = { book: overview.book_count, history: overview.history_count, labels: overview.public_label_count };
  const status =
    !overview.book_count &&
    h(
      "p",
      { class: "page-status" },
      icon("book", 15),
      h(
        "span",
        {},
        "Your book is empty, so lookalikes are caught only against addresses you copied and public labels. ",
        h("a", { class: "link", href: "#book" }, "Add your first address"),
      ),
    );

  // Answers leave the way they came, then the space is cleared; a newer
  // answer arriving meanwhile takes its place at once.
  let turn = 0;
  const fill = (...children: (Child | Child[])[]) => {
    turn++;
    clear(results, ...children);
  };
  const empty = async () => {
    const mine = ++turn;
    if (!results.children.length) return;
    await sink(results.children, { y: 8 });
    if (mine === turn) clear(results);
  };

  const pasteMode = () => {
    const input = h("textarea", {
      rows: 4,
      placeholder: "0x… or a whole message, an invoice, a transaction",
      "aria-label": "Text to check",
    });
    const show = async () => {
      const text = input.value;
      if (!text.trim()) return void empty();
      const found = await ipc.recognizeText(text);
      if (!found.length) return fill(h("div", { class: "empty" }, "No address in this text."));
      // One address: its card. Several: one card with a row each.
      fill(found.length === 1 ? recognitionCard(found[0], scope) : recognitionList(found, scope));
      void rise(results.children, { y: 8, gap: 0.05 });
      if (overview.config.network) for (const r of found) void ipc.lookupOnchain(r.address.text).catch(() => {});
    };
    input.addEventListener("input", () => void show());
    clear(
      body,
      h("label", { class: "field-label" }, "Paste anything with addresses in it"),
      input,
      h("p", { class: "check-foot muted" }, "Every address in the text is checked. Nothing you paste is stored."),
    );
    void empty();
    input.focus();
  };

  const compareMode = (example = false) => {
    const expected = h("input", { type: "text", class: "addr", placeholder: "From the invoice, the chat, the person", "aria-label": "The address you expected" });
    const actual = h("input", { type: "text", class: "addr", placeholder: "The one in your wallet, about to be used", "aria-label": "The address you are about to use" });
    const show = async () => {
      const [want, have] = [expected.value.trim(), actual.value.trim()];
      expected.removeAttribute("aria-invalid");
      actual.removeAttribute("aria-invalid");
      if (!want || !have) return void empty();
      try {
        // The one about to be used is the candidate, the expected one is known.
        fill(comparisonCard(await ipc.compareAddresses(have, want), overview, example));
        void move(results.firstElementChild, { opacity: [0, 1], y: [8, 0] }, SPRING);
      } catch (e) {
        const p = e as Partial<CompareProblem>;
        if (!p?.kind) return void fill(h("div", { class: "notice" }, message(e)));
        if (p.field === "used") actual.setAttribute("aria-invalid", "true");
        if (p.field === "expected") expected.setAttribute("aria-invalid", "true");
        fill(problemCard(p as CompareProblem));
        void move(results.firstElementChild, { opacity: [0, 1], y: [8, 0] }, SPRING);
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
        h("button", { class: "link", onclick: () => compareMode(true) }, "Try an example"),
      ),
    );
    if (example) {
      expected.value = EXAMPLE_EXPECTED;
      actual.value = EXAMPLE_PASTED;
      void show();
    } else {
      void empty();
      expected.focus();
    }
  };

  const modes = segmented(
    "Check",
    [
      { value: "text", label: "A text" },
      { value: "compare", label: "Two addresses" },
    ],
    "text",
    (m) => (m === "text" ? pasteMode() : compareMode()),
  );

  clear(
    main,
    h(
      "header",
      {},
      h("h1", {}, "Check"),
      h("span", { class: "spacer" }),
      modes,
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

const FIELD = { used: "In the address you are about to use", expected: "In the address you expected" } as const;

/** Why the two could not be compared, as a verdict: what is wrong, in which
 *  box, and what to do about it. */
function problemCard(p: CompareProblem): HTMLElement {
  const [chain, other] = p.chains;
  const name = chain ? CHAIN_NAME[chain] : "";
  const [title, sub, why] =
    p.kind === "checksum"
      ? [
          "A character is wrong",
          p.field ? FIELD[p.field] : "",
          `${chain === "evm" ? "EVM addresses carry a checksum in the case of their letters" : `${name} addresses end in a checksum`}. This one does not add up, so a character was changed or mistyped on the way. Copy it again from where it came from, rather than fixing it by hand.`,
        ]
      : p.kind === "chains"
        ? [
            "These are on different networks",
            `About to use: ${name}. Expected: ${other ? CHAIN_NAME[other] : ""}.`,
            "An address on one network cannot be the one you expected on another. Check that both came from the same place.",
          ]
        : [
            "Not an address",
            p.field ? FIELD[p.field] : "",
            "Paste one whole address here: an EVM 0x… address, or a Bitcoin, Solana or Tron one.",
          ];
  return h(
    "div",
    { class: "card verdict k-new" },
    h(
      "div",
      { class: "verdict-head" },
      h("span", { class: "tile" }, icon("alert", 18)),
      h("div", {}, h("strong", {}, title), h("div", { class: "muted" }, sub)),
    ),
    h("p", { class: "verdict-why" }, why),
  );
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
