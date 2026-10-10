// On-chain facts (only when the network is on). Each element made here
// fills itself in when the answer for its address arrives.

import { h } from "./dom";
import { icon } from "./icons";
import { ipc, on } from "./ipc";
import type { Fact } from "./types";

const waiting = new Map<string, Set<HTMLElement>>();

function paint(el: HTMLElement, fact: Fact | undefined) {
  el.replaceChildren();
  el.className = "onchain";
  if (!fact) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (fact.state === "pending") {
    el.classList.add("pending");
    el.append(icon("globe", 12), "Checking on chain…");
  } else if (fact.state === "error") {
    el.classList.add("error");
    el.append(icon("globe", 12), `On-chain lookup failed: ${fact.message}`);
  } else {
    el.classList.add(fact.active ? "active" : "unused");
    el.append(icon("globe", 12), fact.summary);
  }
}

/** A line that shows the on-chain fact for `address` once known. */
export function onchainLine(address: string): HTMLElement {
  const el = h("div", { class: "onchain", hidden: true });
  let set = waiting.get(address);
  if (!set) waiting.set(address, (set = new Set()));
  set.add(el);
  void ipc.getOnchain([address]).then((facts) => {
    if (facts[address]) paint(el, facts[address]);
  });
  return el;
}

/** Fill a line now (Check view, which looks up on demand). */
export function paintOnchain(el: HTMLElement, fact: Fact) {
  paint(el, fact);
}

void on<{ address: string; fact: Fact }>("onchain", ({ address, fact }) => {
  for (const el of waiting.get(address) ?? []) {
    if (el.isConnected) paint(el, fact);
    else waiting.get(address)?.delete(el);
  }
});
