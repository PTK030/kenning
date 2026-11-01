// Checks WCAG 2.2 contrast (>= 4.5:1) for every text/background pair the UI
// uses, in both themes, straight from ui/src/styles/tokens.css. A token is
// either one hex colour for both themes or light-dark(#light, #dark).
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../ui/src/styles/tokens.css", import.meta.url), "utf8");
const light = {};
const dark = {};
for (const m of css.matchAll(/--([\w-]+):\s*(?:light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)|(#[0-9a-f]{6}))/gi)) {
  light[m[1]] = m[2] ?? m[4];
  dark[m[1]] = m[3] ?? m[4];
}

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const SURFACES = ["surface-base", "surface", "surface-card", "surface-raised", "surface-sunken", "surface-pop"];
const PAIRS = [
  ...SURFACES.flatMap((s) => [["ink", s], ["ink-body", s], ["ink-2", s], ["brand", s]]),
  ["brand", "brand-soft"], ["brand-ink", "brand"], ["on-brand", "brand-strong"], ["on-brand", "brand-strong-hover"],
  ["mine", "surface-card"], ["mine", "mine-soft"], ["new", "surface-card"], ["new", "new-soft"],
  ["look", "surface-card"], ["look", "surface-sunken"], ["look", "look-soft"],
];

let failed = 0;
for (const [name, theme] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg] of PAIRS) {
    const r = ratio(theme[fg], theme[bg]);
    const ok = r >= 4.5;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(5)} ${fg.padEnd(9)} on ${bg.padEnd(14)} ${r.toFixed(2)}:1`);
  }
}
process.exit(failed ? 1 : 0);
