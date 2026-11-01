# CLAUDE.md

Instructions for coding agents working in this repository. `AGENTS.md` is a
link to this file. The project's docs are the source of truth; this file
points at them and adds the working rules.

Kenning is a Windows tray app (Tauri 2: Rust + TypeScript without a
framework) that recognises crypto addresses on the clipboard and warns about
lookalikes and clipboard swaps.

## Read first

| Doc | What's in it |
|---|---|
| [docs/development.md](docs/development.md) | Layout, running, checks, the things that are easy to get wrong |
| [docs/design.md](docs/design.md) | Colour, type, motion and layout rules. Read before any UI change |
| [docs/qa.md](docs/qa.md) | The evidence a change needs, the screenshot harness. Read before calling UI work done |
| [docs/detection-rules.md](docs/detection-rules.md) | What counts as a lookalike |
| [docs/manual-test.md](docs/manual-test.md) | What only the real app shows: clipboard, focus, tray |
| [docs/releasing.md](docs/releasing.md) | Cutting a release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Commits, the rules that keep Kenning trustworthy |
| [SECURITY.md](SECURITY.md) | What leaves the computer, how to report a vulnerability |

## Quick start

```bash
npm install                 # at the root: the git hooks (lefthook)
npm run dev                 # the desktop app; Vite on :1420 serves the UI
npm run shots               # screenshots of the UI (needs the UI served)
npm run check               # what CI runs, except cargo deny
npm run deny                # licences and the no-network rule
```

## Skills

Skills live in `.agents/skills/<name>/SKILL.md`; each `.claude/skills/<name>`
is a link to its folder there. Keep the steps in the docs and let a skill
point at them.

- `release`: cut a version (`docs/releasing.md`).
- `ui-shots`: take and check screenshots of a visible change (`docs/qa.md`).

## Working rules

- **Commits**: Conventional Commits subjects (`type(scope): what`). No
  `Co-Authored-By` lines, no "Generated with" lines, no mention of AI
  anywhere in commits, PRs, code or docs. Commit or push only when asked.
- **The working tree often holds uncommitted work.** Never commit files you
  did not change without asking; never stash, reset or check out over them.
- **Formatting**: never run Prettier or `cargo fmt` on whole files. Match the
  file by hand.
- **Verifying UI**: use the screenshot harness (`npm run shots`, see
  `docs/qa.md`) with `npm run dev` serving the UI. Never take screenshots of
  the user's desktop and never take focus from their apps.
- **Motion**: only through `apps/desktop/ui/src/motion.ts`. Exits mirror
  entrances; no springs on height; no jump at the end of an animation. Don't
  change an existing animation unless asked.
- **Alerts**: built only by `apps/desktop/ui/src/alerts.ts`; the onboarding's
  pictures are the real alerts.
- **"Think about whether X is needed"** asks for an assessment, not an edit.
- **Dev data**: `tauri dev` uses `~/.kenning-dev`; never touch `~/.kenning`.
- **Secrets**: never put a real recovery phrase, private key or someone's
  address in code, tests or fixtures.

Personal preferences (language, tone) go in `CLAUDE.local.md`, which git
ignores.
