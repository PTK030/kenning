import { addressPlain, addressWithDiff, CHAIN_NAME, stateChip } from "../address";
import { h } from "../dom";
import type { Recognition } from "../types";

/** A recognition as a card: state, headline, detail, full address. */
export function recognitionCard(r: Recognition): HTMLElement {
  const m = r.lookalike;
  return h(
    "div",
    { class: `card${r.state === "lookalike" ? " s-lookalike-card" : ""}` },
    h("div", { class: "top" }, stateChip(r.state), h("strong", {}, r.headline)),
    h("div", { class: "muted" }, r.detail, " · ", CHAIN_NAME[r.address.chain]),
    m ? addressWithDiff(r.grouped, m.candidate_spans) : addressPlain(r.grouped),
    m &&
      h(
        "div",
        {},
        h("div", { class: "muted", style: "margin-top:8px;font-size:12px" }, m.known_label ?? "Known address"),
        addressWithDiff(m.known_grouped, m.known_spans),
      ),
  );
}
