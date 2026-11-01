# Contributing

Thank you for helping. For anything bigger than a small fix, open an issue
first, so we can agree on the approach before you spend time on it.

## Setup

- Rust: the version in `rust-toolchain.toml` (rustup installs it).
- Node.js: the version in `.nvmrc`.
- Windows 10 or 11 for the desktop app (`apps/desktop`). The core, CLI and
  network crates build anywhere.

```bash
npm install                        # at the root: the git hooks (lefthook)
npm ci --prefix apps/desktop
npm ci --prefix site

npm run dev                        # the desktop app, reloading as you edit
npm run dev:site                   # the landing page
cargo run -p kenning-cli -- --help # the CLI
```

[docs/development.md](docs/development.md) explains the layout, the
development data directory and the pitfalls.

## Before a pull request

`npm run check` runs what CI runs (and `npm run deny` the licence and
network check); running it first saves a round trip. The git hooks check
types, contrast, clippy and the commit subject as you commit.

Anything visible needs pictures in both themes, before and after:
[docs/qa.md](docs/qa.md) explains the screenshot harness and what to look
for, and [docs/design.md](docs/design.md) the rules it should follow.

## Commits

Subjects follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): what changed`, lowercase after the colon.

- Types: `feat`, `fix`, `perf`, `refactor`, `style`, `docs`, `test`,
  `build`, `ci`, `chore`, `revert`.
- Scopes are the part touched: `core`, `cli`, `net`, `desktop`,
  `onboarding`, `book`, `check`, `journal`, `settings`, `guard`, `ui`,
  `landing`, …

CI checks every subject in a pull request. Changes users will notice also
go into `CHANGELOG.md`, in plain words: that section becomes the release
notes the app shows.

## Rules that keep Kenning trustworthy

- `kenning-core` never talks to the network.
- Nothing read from the clipboard is stored, except valid addresses.
- A warning never acts on its own and never takes a stray key as consent.
- New network hosts are listed in `kenning-net` and shown to the user.

Security issues go to [SECURITY.md](SECURITY.md), not to public issues.
