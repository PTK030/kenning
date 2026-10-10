// Checks WCAG 2.2 contrast (>= 4.5:1) for every text/background pair the UI
// uses, in both themes, straight from ui/src/styles/tokens.css.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../ui/src/styles/tokens.css", import.meta.url), "utf8");
const block = (re) => Object.fromEntries([...(css.match(re)?.[1] ?? "").matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const light = block(/:root\s*{([^}]*)}/);
const dark = { ...light, ...block(/prefers-color-scheme: dark\)\s*{\s*:root\s*{([^}]*)}/) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS = [
  ["ink", "bg"], ["ink", "bg-2"], ["ink-2", "bg"], ["ink-2", "bg-2"],
  ["brand", "bg"], ["brand", "bg-2"], ["brand", "brand-soft"], ["brand-ink", "brand"],
  ["mine", "bg"], ["mine", "mine-soft"], ["new", "bg"], ["new", "new-soft"],
  ["look", "bg"], ["look", "bg-2"], ["look", "look-soft"],
];

let failed = 0;
for (const [name, theme] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg] of PAIRS) {
    const r = ratio(theme[fg], theme[bg]);
    const ok = r >= 4.5;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(5)} ${fg.padEnd(9)} on ${bg.padEnd(10)} ${r.toFixed(2)}:1`);
  }
}
process.exit(failed ? 1 : 0);
