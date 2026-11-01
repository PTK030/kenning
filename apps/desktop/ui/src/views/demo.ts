// The example pair used to show Kenning before it knows any of your
// addresses: a real exchange address and a generated lookalike that shares
// its first 6 and last 4 characters.

import type { Recognition, Span } from "../types";

export const KNOWN = "0x28C6c06298d514Db089934071355E5743bf21d60";
export const POISON = "0x28C6C0aaAAaAAAaaAaAaAAaaAAaaaaaaAAaA1d60";

/** "0x" and groups of four, the way Rust formats them. */
export function group(addr: string): string {
  return ["0x", ...(addr.slice(2).match(/.{1,4}/g) ?? [])].join(" ");
}

/** Matching prefix and suffix (ignoring case) against `other`, as spans. */
export function spans(addr: string, other: string): Span[] {
  const a = addr.slice(2);
  const b = other.slice(2);
  let p = 0;
  while (p < a.length && a[p].toLowerCase() === b[p]?.toLowerCase()) p++;
  let q = 0;
  while (q < a.length - p && a.at(-1 - q)!.toLowerCase() === b.at(-1 - q)?.toLowerCase()) q++;
  return [
    { text: "0x" + a.slice(0, p), same: true },
    { text: a.slice(p, a.length - q), same: false },
    { text: a.slice(a.length - q), same: true },
  ];
}

export function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

/** What the core says about the example pair, word for word: the address
 *  you know, and the lookalike of it. */
export const KNOWN_RECOGNITION: Recognition = {
  address: { chain: "evm", text: KNOWN },
  grouped: group(KNOWN),
  state: "mine",
  label: "Binance deposits",
  note: "my deposits",
  emoji: null,
  source: null,
  label_kind: null,
  history: null,
  lookalike: null,
  more_lookalikes: 0,
  headline: "Binance deposits",
  detail: "my deposits · in your book",
};

export const LOOKALIKE_RECOGNITION: Recognition = {
  ...KNOWN_RECOGNITION,
  address: { chain: "evm", text: POISON },
  grouped: group(POISON),
  state: "lookalike",
  label: null,
  note: null,
  headline: "This is not your Binance deposits address.",
  detail: "Matches 6 + 4 characters, 30 differ.",
  lookalike: {
    known: { chain: "evm", text: KNOWN },
    known_grouped: group(KNOWN),
    known_kind: "mine",
    known_label: "Binance deposits",
    known_last_seen: null,
    similarity: { same_prefix: 6, same_suffix: 4, differing: 30, length: 40 },
    candidate_spans: spans(POISON, KNOWN),
    known_spans: spans(KNOWN, POISON),
  },
};

/** A third address the user has never copied: what the core says the first
 *  time (message.rs, State::New). */
export const NEW_ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
export const NEW_RECOGNITION: Recognition = {
  ...KNOWN_RECOGNITION,
  address: { chain: "evm", text: NEW_ADDRESS },
  grouped: group(NEW_ADDRESS),
  state: "new",
  label: null,
  note: null,
  headline: "New address",
  detail: "You have never copied this address before. First contact: today.",
};
