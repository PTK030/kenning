import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

// The pair used across the page: a real exchange address and a generated
// lookalike that shares its first 6 and last 4 characters.
export const KNOWN = "0x28C6c06298d514Db089934071355E5743bf21d60";
export const POISON = "0x28C6C0aaAAaAAAaaAaAaAAaaAAaaaaaaAAaA1d60";

/** For each character of `a`, whether it matches `b` (case-insensitive prefix and suffix). */
export function sameMask(a: string, b: string): boolean[] {
  const x = a.slice(2);
  const y = b.slice(2);
  let p = 0;
  while (p < x.length && x[p].toLowerCase() === y[p]?.toLowerCase()) p++;
  let s = 0;
  while (s < x.length - p && x.at(-1 - s)!.toLowerCase() === y.at(-1 - s)?.toLowerCase()) s++;
  return [true, true, ...[...x].map((_, i) => i < p || i >= x.length - s)];
}

/** "0x" followed by groups of four, the way the app shows addresses. */
export function chunks(addr: string): number[][] {
  const out: number[][] = [[0, 1]];
  for (let k = 2; k < addr.length; k += 4) {
    out.push(Array.from({ length: Math.min(4, addr.length - k) }, (_, j) => k + j));
  }
  return out;
}

export function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const HEX = "0123456789abcdefABCDEF";

/** Characters resolve left to right through a few random hex digits. */
export function useScramble(text: string, active: boolean, delay = 0, step = 20): string[] {
  const reduce = useReducedMotion();
  const animate = active && !reduce;
  const [out, setOut] = useState<string[]>(() => (animate ? [...text].map(() => " ") : [...text]));

  useEffect(() => {
    if (!animate) {
      setOut([...text]);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const end = text.length * step + 180;
    const tick = (now: number) => {
      const t = now - start;
      setOut(
        [...text].map((ch, i) => {
          const at = i * step;
          if (t >= at + 160) return ch;
          if (t >= at) return HEX[Math.floor(Math.random() * HEX.length)];
          return " ";
        }),
      );
      if (t < end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, animate, delay, step]);

  return out;
}
