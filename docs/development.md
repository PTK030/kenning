# Development

How the repository fits together, how to run each part, and the few things
that are easy to get wrong.

## Layout

| Path | What it is |
|---|---|
| `crates/kenning-core` | Recognition: books, labels, history, lookalike rules, secrets. No network code, ever (`deny.toml` enforces it). |
| `crates/kenning-net` | On-chain lookups. Every host it may ask is listed here and shown to the user. |
| `crates/kenning-labels` | The public labels built into the app. |
| `crates/kenning-cli` | `ken`, the command line. |
| `apps/desktop/src-tauri` | The Windows tray app: clipboard, guard, windows, tray, updates. |
| `apps/desktop/ui` | Its four pages (`index`, `badge`, `lookalike`, `details`), TypeScript without a framework. |
| `site` | The landing page. |
| `docs` | Rules, decisions and how-tos, this file among them. |

## Running

```bash
cd apps/desktop
npm ci
npm run tauri dev          # the app; Vite on :1420 serves the UI
```

From the root, `npm run dev` does the same, and `npm install` there sets up
the git hooks (`lefthook.yml`).

- A change to the UI reloads in place. A change to Rust rebuilds and
  restarts the app.
- A development build keeps its data in `~/.kenning-dev`, not
  `~/.kenning`, so trying things out never touches your real book. Set
  `KENNING_HOME` to use another directory, for example a fresh one to see the
  onboarding again.
- `ken` reads `~/.kenning` (or `KENNING_HOME`):
  `cargo run -p kenning-cli -- --help`.
- `npm run dev` alone serves the UI without the app. The pages then have no
  backend; the screenshot harness supplies one (see [qa.md](qa.md)).

Keys that only work in a development build, in the main window:

| Keys | What they do |
|---|---|
| Ctrl+Shift+L | Light theme, then dark, then the system's again |
| Ctrl+Shift+O | Opens the onboarding from the start, and leaves it again. Nothing is saved unless it is finished |

## Checks

CI runs these on every pull request (`.github/workflows/ci.yml`);
`npm run check` at the root runs them all but `cargo deny` (`npm run deny`):

```bash
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo deny --manifest-path crates/kenning-core/Cargo.toml check
cd apps/desktop && npm run build && node scripts/check-contrast.mjs
cd site && npm run build
```

`cargo test --workspace` needs Windows; elsewhere, test the portable crates:
`cargo test -p kenning-core -p kenning-net -p kenning-labels -p kenning-cli`.

## Things that are easy to get wrong

- **Formatting.** Neither Prettier nor `rustfmt` is applied to the whole
  tree. Running either on a file rewrites lines you did not change and buries
  your diff. Format what you write by hand, in the style of the file around
  it.
- **The installer template.** `apps/desktop/src-tauri/installer/installer.nsi`
  is Tauri's NSIS template for the CLI version in `apps/desktop/package.json`,
  with Kenning's changes marked `; Kenning:`. When `@tauri-apps/cli` is
  upgraded, take the new version's template and carry the marked changes over;
  an old template with a new bundler can break the installer quietly. That is
  why Dependabot leaves the CLI alone.
- **Windows that size themselves.** The lookalike and details windows are
  created hidden and shown once the page has measured itself
  (`fit_lookalike`, `fit_details`). A layout change that alters their height
  is only correct once it has been seen in the real window.
- **Dark-only windows.** The lookalike window, the details window and the
  onboarding's pictures are dark in both themes (`color-scheme: dark`). The
  rest follows the system.
- **The clipboard is shared.** Other programs hold it open, render it late or
  write it from a background thread. Read it through `clipboard::read_within`,
  never with a single attempt; a failed read is not an empty clipboard.
- **The guard's tests use decoys.** `guard::DECOYS` are well-known public
  addresses, chosen so that a clipper swaps them. Never use an address that
  belongs to anyone who could be paid by mistake.
- **Network hosts.** A new host goes into `kenning-net` (`Endpoints::hosts`)
  so Settings and the CLI list it, and into `SECURITY.md` if it changes what
  leaves the computer.

## Releases

See [releasing.md](releasing.md).
