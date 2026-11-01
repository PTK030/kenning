// Commit subjects in Conventional Commits form: `type(scope): what changed`.
// Used by CI on a pull request's commits and by the commit-msg hook.
//
//   node .github/scripts/commit-subject.mjs <base>..<head>
//   node .github/scripts/commit-subject.mjs --file .git/COMMIT_EDITMSG

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERN = /^(feat|fix|perf|refactor|style|docs|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: \S/;
// Written by git, not by hand: merges and the markers of `git commit --fixup`.
const GIT = /^(Merge |(fixup|squash|amend)! )/;

const args = process.argv.slice(2);
let commits;
if (args[0] === "--file") {
  const subject = readFileSync(args[1], "utf8").split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#")) ?? "";
  commits = [["your commit", subject]];
} else if (args[0]?.includes("..")) {
  commits = execFileSync("git", ["log", "--format=%h %s", args[0]], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf(" ")), l.slice(l.indexOf(" ") + 1)]);
} else {
  console.error("usage: commit-subject.mjs <base>..<head> | --file <message>");
  process.exit(2);
}

const ci = !!process.env.GITHUB_ACTIONS;
let bad = 0;
for (const [sha, subject] of commits) {
  if (PATTERN.test(subject) || GIT.test(subject)) continue;
  bad++;
  const text = `${sha}: "${subject}" is not type(scope): description`;
  console.error(ci ? `::error::${text}` : text);
}
if (bad && !ci) console.error("Types and scopes: CONTRIBUTING.md › Commits.");
process.exit(bad ? 1 : 0);
