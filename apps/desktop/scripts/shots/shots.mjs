// Screenshots of every window, in both themes, without the Tauri backend:
// the UI is served by Vite and the bridge answers from fixtures.mjs.
//
//   npm run dev                          (in apps/desktop, keep it running)
//   npm run shots -- [scene...] [--theme dark|light] [--out dir]
//
// With no scene named, all of them are taken. `--list` prints the names.
// Chrome is used if installed, else Edge; CHROME=<path> picks another.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { backend, bridge, KNOWN, POISON, NEW } from "./fixtures.mjs";

const BASE = process.env.SHOTS_URL ?? "http://localhost:1420";

const wait = (ms) => (page) => page.waitForTimeout(ms);

/** [name, page, scenario, viewport, what to do before the picture] */
const SCENES = [
  ["book", "index.html#book", "full", [880, 640]],
  ["book-empty", "index.html#book", "empty", [880, 640]],
  ["check", "index.html#check", "full", [880, 640], async (p) => {
    await p.fill("textarea", `Pay ${POISON} by Friday`);
    await p.waitForTimeout(800);
  }],
  ["check-new", "index.html#check", "full", [880, 640], async (p) => {
    await p.fill("textarea", NEW);
    await p.waitForTimeout(800);
  }],
  ["check-many", "index.html#check", "full", [880, 900], async (p) => {
    await p.fill("textarea", `Pay ${POISON}, swap via ${KNOWN}, refund ${NEW}`);
    await p.waitForTimeout(800);
  }],
  ["check-compare", "index.html#check", "full", [880, 640], async (p) => {
    await p.click("text=Two addresses");
    await p.click("text=Try an example");
    await p.waitForTimeout(800);
  }],
  ["check-empty", "index.html#check", "empty", [880, 640]],
  ["journal", "index.html#journal", "full", [880, 640]],
  ["journal-empty", "index.html#journal", "empty", [880, 640]],
  ["journal-off", "index.html#journal", "journal-off", [880, 640]],
  ["protection", "index.html#protection", "full", [880, 1180]],
  ["protection-swapped", "index.html#protection", "swapped", [880, 1180]],
  ["protection-empty", "index.html#protection", "empty", [880, 1180]],
  ["settings", "index.html#settings", "full", [880, 2600]],
  ["settings-dirty", "index.html#settings", "full", [880, 640], async (p) => {
    await p.click("text=When I press the shortcut");
    await p.waitForTimeout(600);
  }],
  ["onboarding", "index.html#welcome", "onboarding", [880, 640], wait(2500)],
  ["badge", "badge.html", "full", [400, 128]],
  ["lookalike", "lookalike.html", "full", [640, 420], "fit"],
  ["details", "details.html", "full", [560, 520], "fit"],
];

// Dark in either theme by design (`color-scheme: dark`), so taken once.
const ALWAYS_DARK = ["lookalike", "details"];

const WINDOWS = { "badge.html": "badge", "lookalike.html": "lookalike", "details.html": "details" };

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
if (args.includes("--list")) {
  console.log(SCENES.map(([n]) => n).join("\n"));
  process.exit(0);
}
const out = resolve(flag("--out") ?? "shots");
const theme = flag("--theme");
const themes = theme ? [theme] : ["dark", "light"];
const only = args.filter((a) => !a.startsWith("--"));
const unknown = only.filter((n) => !SCENES.some(([s]) => s === n));
if (unknown.length) {
  console.error(`unknown scene: ${unknown.join(", ")} (see --list)`);
  process.exit(1);
}

async function launch() {
  if (process.env.CHROME) return chromium.launch({ executablePath: process.env.CHROME });
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return chromium.launch({ channel: "msedge" });
  }
}

try {
  await fetch(BASE);
} catch {
  console.error(`nothing at ${BASE}: start the UI first (npm run dev in apps/desktop)`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const browser = await launch();
let failed = false;
for (const scheme of themes) {
  for (const [name, path, scenario, [width, height], act] of SCENES) {
    if (only.length && !only.includes(name)) continue;
    if (scheme === "light" && ALWAYS_DARK.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.addInitScript(bridge, backend(scenario, WINDOWS[path.split("#")[0]] ?? "main"));
    await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    if (act === "fit") {
      // The window sizes itself to its content; do what Tauri would.
      const fit = await page.evaluate(() => window.__fit);
      if (fit) await page.setViewportSize({ width, height: Math.round(fit) });
      await page.waitForTimeout(300);
    } else if (act) {
      await act(page);
    }
    const file = `${out}/${scheme}-${name}.png`;
    await page.screenshot({ path: file });
    if (errors.length) {
      failed = true;
      console.log(`${scheme}-${name}: ${errors.slice(0, 3).join(" | ")}`);
    } else {
      console.log(file);
    }
    await page.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
