// What Kenning knows about an address, as a list of labelled facts: the
// note, where a label came from, the copy history and what the chain says.
// The details window and the main window's address sheet both show it.

import { clear, h } from "./dom";
import { ipc, message } from "./ipc";
import type { Contact, Fact, LabelKind, NetworkUse, Onchain, Recognition } from "./types";

const KIND: Record<LabelKind, string> = {
  token: "Token",
  contract: "Contract",
  program: "Program",
  exchange: "Exchange",
  other: "Public label",
};

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string) => date.format(new Date(iso));

function historyLine(c: Contact | null): string {
  if (!c) return "Never copied";
  const times = c.count === 1 ? "once" : `${c.count}×`;
  const first = when(c.first_seen);
  const last = when(c.last_seen);
  return first === last ? `Copied ${times}, on ${last}` : `Copied ${times}, first ${first}, last ${last}`;
}

/** One label / value row of the facts list. */
const fact = (label: string, ...value: (Node | string)[]) => [h("dt", {}, label), h("dd", {}, ...value)];

/** Where the name came from, said only when it tells something: a team's
 *  shared book, or a public label's source. The user's own book goes
 *  without saying. */
function origin(r: Recognition): (Node | string)[] | null {
  if (!r.source || r.source === "manual") return null;
  if (r.label_kind) return [h("span", { class: "muted" }, r.source)];
  if (r.state === "team") return [`Shared book “${r.source}”`];
  return null;
}

export interface FactList {
  el: HTMLElement;
  /** Fill the on-chain rows: undefined while checking. */
  paintChain: (f: Fact | undefined) => void;
}

/** The facts about `r`. `network` says whether on-chain lookups are on;
 *  `changed` is told when the list changes height (a late answer). */
export function factList(r: Recognition, network: boolean, changed: () => void = () => {}): FactList {
  const chainBox = h("div", { class: "chain" });
  const paintChain = (f: Fact | undefined) => {
    if (!network) {
      const turnOn = h(
        "button",
        {
          class: "link",
          onclick: async () => {
            turnOn.disabled = true;
            network = true;
            paintChain({ state: "pending" });
            try {
              await ipc.setNetwork(true);
              paintChain(await ipc.lookupOnchain(r.address.text));
            } catch (e) {
              paintChain({ state: "error", message: message(e) });
            }
          },
        },
        "Turn on",
      );
      clear(chainBox, fact("On chain", h("span", { class: "muted" }, "Lookups are off. "), turnOn));
    } else if (!f || f.state === "pending") {
      clear(chainBox, fact("On chain", h("span", { class: "muted pending" }, "Checking…")));
    } else if (f.state === "error") {
      clear(chainBox, fact("On chain", h("span", { class: "muted" }, `Lookup failed: ${f.message}`)));
    } else {
      const o = f.onchain;
      if (o.networks && o.networks.length > 1) {
        clear(chainBox, ...networkFacts(o));
        return changed();
      }
      const plural = o.transactions !== 1 || o.transactions_capped ? "s" : "";
      const activity = !o.active
        ? "Never used on chain"
        : o.transactions === null
          ? "Used on chain"
          : `${o.transactions.toLocaleString("en-US")}${o.transactions_capped ? "+" : ""} transaction${plural}`;
      const kind = o.verified === true ? "Verified contract" : o.verified === false ? "Unverified contract" : "Contract";
      const time = new Date(o.fetched_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      clear(
        chainBox,
        fact("On chain", h("span", { class: o.active ? "" : "warn" }, activity)),
        o.contract ? fact("Contract", o.name ? `${kind} “${o.name}”` : kind) : null,
        fact("Checked", h("span", { class: "muted" }, `${o.network} via ${o.source}, at ${time}`)),
      );
    }
    changed();
  };

  // The name is the headline already; it is a fact only when missing, or
  // when the headline says something else (a public label's kind).
  const from = origin(r);
  const el = h(
    "dl",
    { class: "fact-list" },
    !r.label ? fact("Name", h("span", { class: "muted" }, "Not in your book")) : r.label !== r.headline ? fact("Name", r.label) : null,
    r.note ? fact("Note", r.note) : null,
    r.label_kind ? fact("Kind", KIND[r.label_kind]) : null,
    from ? fact(r.label_kind ? "Label from" : "From", ...from) : null,
    fact("History", historyLine(r.history)),
    chainBox,
  );
  paintChain(undefined);
  return { el, paintChain };
}

/** An EVM address asked on several networks: where it was used, then each
 *  network in a line. An explorer sees everything, so its silence is "never
 *  used"; a node cannot see tokens received, so its silence is only "no
 *  transaction sent, no balance". */
function networkFacts(o: Onchain): HTMLElement[] {
  const nets = o.networks ?? [];
  const used = nets.filter((n) => n.used === true).map((n) => n.network);
  const count = (n: number, capped: boolean, word: string) => `${n.toLocaleString("en-US")}${capped ? "+" : ""} ${word}${n !== 1 || capped ? "s" : ""}`;
  const line = (n: NetworkUse) => {
    if (n.error) return h("span", { class: "muted" }, "not reachable");
    const explorer = n.source === "Blockscout";
    if (n.used === true) {
      const what = n.contract ? "contract" : n.transactions === null ? "used" : explorer ? count(n.transactions, n.transactions_capped, "transaction") : `${count(n.transactions, false, "transaction")} sent`;
      return h("span", {}, what);
    }
    return h("span", { class: "muted" }, explorer ? "never used" : "no transactions sent, no balance");
  };
  const kind = o.verified === true ? "Verified contract" : o.verified === false ? "Unverified contract" : "Contract";
  const time = new Date(o.fetched_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  return [
    fact("On chain", used.length ? h("span", {}, `Used on ${list(used)}`) : h("span", { class: "warn" }, `No sign of use on ${nets.filter((n) => !n.error).length} networks`)),
    fact(
      "Networks",
      h(
        "ul",
        { class: "net-uses" },
        nets.map((n) => h("li", { title: n.source || undefined }, h("span", { class: "net-name" }, n.network), line(n))),
      ),
    ),
    o.contract ? fact("Contract", o.name ? `${kind} “${o.name}”` : kind) : [],
    fact("Checked", h("span", { class: "muted" }, `Blockscout and public nodes, at ${time}`)),
  ].flat();
}

/** The on-chain answer for `address`: the one already known, else a lookup
 *  now (when lookups are on). */
export async function onchainFor(address: string, network: boolean): Promise<Fact | undefined> {
  const known = (await ipc.getOnchain([address]))[address];
  if (known && known.state !== "pending") return known;
  if (!network) return undefined;
  try {
    return await ipc.lookupOnchain(address);
  } catch (e) {
    return { state: "error", message: message(e) };
  }
}
