// Before a release is built: the tag's version is the one in every manifest,
// and the updater's public key is a real one. A release that fails either
// would ship a version the updater cannot tell apart, or one it can never
// verify. Usage: node .github/scripts/release-check.mjs v0.1.0

import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? "";
const version = tag.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  fail(`"${tag}" is not a version tag like v0.1.0`);
}

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const cargo = /\[workspace\.package\][^[]*?version\s*=\s*"([^"]+)"/s.exec(read("Cargo.toml"))?.[1];
const pkg = JSON.parse(read("apps/desktop/package.json")).version;
const conf = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));

const found = { "Cargo.toml (workspace)": cargo, "apps/desktop/package.json": pkg, "apps/desktop/src-tauri/tauri.conf.json": conf.version };
const wrong = Object.entries(found).filter(([, v]) => v !== version);
if (wrong.length) {
  fail(`tag ${tag}, but ${wrong.map(([f, v]) => `${f} says ${v ?? "nothing"}`).join(", ")}`);
}

const pubkey = conf.plugins?.updater?.pubkey ?? "";
if (!pubkey || pubkey.startsWith("REPLACE_WITH")) {
  fail("plugins.updater.pubkey in tauri.conf.json is still the placeholder (see docs/releasing.md)");
}

console.log(`Releasing ${version}: manifests agree, the update key is set.`);

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}
