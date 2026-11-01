---
name: release
description: Prepare a Kenning release (version bump in all three places, changelog section, release commit and tag) following docs/releasing.md. Use when the user says "release", "cut a release", "tag a version", "ship X.Y.Z", or "/release".
user-invocable: true
---

# Release

Follow **Each release** in `docs/releasing.md` end-to-end. Confirm the
version number with the user before changing anything; tag and push only
when they say so.

Working rules:

- Check the tree first (`git status`). Uncommitted work that is not part of
  the release stays out of the release commit; ask if unsure.
- After raising the version in `Cargo.toml` (workspace),
  `apps/desktop/package.json` and `apps/desktop/src-tauri/tauri.conf.json`,
  run `cargo check` so `Cargo.lock` follows.
- The `## X.Y.Z` section of `CHANGELOG.md` becomes the release notes in the
  app: plain words, for users.
- Before committing, run what CI will:
  `node .github/scripts/release-check.mjs vX.Y.Z` and
  `node .github/scripts/changelog-section.mjs X.Y.Z`.
- Commit `chore(release): vX.Y.Z` with only the release files. No trailers.
- After the push, tell the user to review the draft release, try its
  installer and publish it.
- When you learn something the next release needs, fix `docs/releasing.md`
  rather than this skill.
