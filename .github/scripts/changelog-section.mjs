// Print one version's section of CHANGELOG.md, without its heading: the
// release's notes, which the app also shows under "What's new".
// Usage: node .github/scripts/changelog-section.mjs 0.1.0

import { readFileSync } from "node:fs";

const version = process.argv[2];
const text = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const heading = new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}\\]?\\b.*$`, "m");
const start = text.search(heading);
if (start < 0) {
  console.error(`::error::CHANGELOG.md has no "## ${version}" section`);
  process.exit(1);
}
const body = text.slice(text.indexOf("\n", start) + 1);
const next = body.search(/^## /m);
const section = (next < 0 ? body : body.slice(0, next)).trim();
if (!section) {
  console.error(`::error::The "## ${version}" section of CHANGELOG.md is empty`);
  process.exit(1);
}
console.log(section);
