// The example pair used to show Kenning before it knows any of your
// addresses: a real exchange address and a generated lookalike that shares
// its first 6 and last 4 characters.

import type { Span } from "../types";

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
