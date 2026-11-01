// Address rendering: always the full address, monospace, in groups of 4.

import { chainMark } from "./chainMarks";
import { h } from "./dom";
import { icon, STATE_ICON, type IconName } from "./icons";
import type { Chain, Owner, Span, State } from "./types";

/** The grouped address with differing characters marked. `grouped` comes
 *  from Rust (spaces between groups); `spans` cover the same characters
 *  without spaces. */
export function addressWithDiff(grouped: string, spans: Span[]): HTMLElement {
  const flags: boolean[] = [];
  for (const s of spans) for (let i = 0; i < s.text.length; i++) flags.push(s.same);

  const root = h("span", { class: "addr" });
  let k = 0;
  let run: HTMLElement | null = null;
  let runSame: boolean | null = null;
  for (const ch of grouped) {
    if (ch === " ") {
      root.appendChild(document.createTextNode(" "));
      run = null;
      continue;
    }
    const same = flags[k++] ?? true;
    if (!run || runSame !== same) {
      run = h("span", { class: same ? "same" : "diff" });
      runSame = same;
      root.appendChild(run);
    }
    run.textContent += ch;
  }
  return root;
}

export function addressPlain(grouped: string): HTMLElement {
  return h("span", { class: "addr" }, grouped);
}

/** Short form for lists: first 6 and last 4 characters after the fixed prefix. */
export function short(text: string): string {
  const prefix = text.startsWith("0x") ? 2 : 0;
  const body = text.slice(prefix);
  return body.length <= 12 ? text : `${text.slice(0, prefix)}${body.slice(0, 6)}…${body.slice(-4)}`;
}

export const CHAIN_NAME: Record<Chain, string> = {
  evm: "EVM",
  solana: "Solana",
  bitcoin: "Bitcoin",
  tron: "Tron",
};

/** Every state has its own symbol and word, never colour alone. */
export const STATE_WORD: Record<State, string> = {
  mine: "Yours",
  team: "Team",
  contact: "Contact",
  public: "Public",
  seen: "Seen",
  new: "New",
  lookalike: "Lookalike",
};

/** Whose an address is, for the drop-downs that ask. */
export const OWNER_CHOICES: { value: Owner; label: string; hint: string; icon: IconName }[] = [
  { value: "me", label: "Mine", hint: "Your wallets and deposit addresses", icon: STATE_ICON.mine },
  { value: "team", label: "My team's", hint: "Shared with the people you work with", icon: STATE_ICON.team },
  { value: "contact", label: "A contact", hint: "Someone you pay or receive from", icon: STATE_ICON.contact },
];

/** A small labelled chip with an icon: a chain, a token, a count. */
export function metaChip(ic: IconName, text: string): HTMLElement {
  return h("span", { class: "meta-chip" }, icon(ic, 12), text);
}

/** The network: its mark in its own colour, then its name. Not a chip: the
 *  colour is what the eye finds first in a list. */
export function chainChip(chain: Chain): HTMLElement {
  return h("span", { class: "chain-tag" }, chainMark(chain, 16), CHAIN_NAME[chain]);
}

/** A detail line from the core ("a · b · c") as separate pieces with a
 *  hairline between them instead of a dot. */
export function detailLine(detail: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  detail.split(" · ").forEach((part, i) => {
    if (i) out.push(h("i", { class: "sep", "aria-hidden": "true" }));
    out.push(part);
  });
  return out;
}

export function stateChip(state: State): HTMLElement {
  return h("span", { class: `chip s-${state}` }, icon(STATE_ICON[state], 13), STATE_WORD[state]);
}
