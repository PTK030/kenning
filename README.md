# Kenning

**Know what you copied.**

Kenning names every crypto address you copy and tells you when one only
*looks like* an address you know. It is a quiet address book, not an alarm:
known addresses get a small, silent confirmation, and you only see a window
when a copied address resembles one of yours.

MIT · local-only · no account · no telemetry · network: off · never writes to your clipboard unless you click

```
$ ken 0x28c6c0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1d60
! This is not your Binance address.  lookalike
  Matches 6 + 4 characters, 30 differ.

  copied  0x 28C6 C0aa AAaA AAaa AaAa AAaa AAaa aaaa AAaA 1d60
  yours   0x 28C6 c062 98d5 14Db 0899 3407 1355 E574 3bf2 1d60  Binance
```

Supported chains: EVM (EIP-55), Solana, Bitcoin (legacy, segwit, taproot), Tron.

## CLI

```
cargo install --path crates/kenning-cli
```

| Command | What it does |
|---|---|
| `ken <address or text>` | Card for each address. |
| `ken add <address> <label> [--owner me\|team\|contact] [--note …]` | Name an address. |
| `ken rm <address>` | Remove it from your book. |
| `ken ls [--chain evm] [--public]` | List your book (and shared books, built-in labels). |
| `ken edit` | Open `book.toml` in `$EDITOR` and validate it. |
| `ken check [file\|-]` | Every address in a file or stdin: `cast logs … \| ken check -`. |
| `ken diff <a> <b>` | Compare two addresses character by character. |
| `ken import <file.csv>` | Kenning CSV or a Safe{Wallet} address book export. |
| `ken export [-o file.csv]` | Export your book. |
| `ken log` | The verification journal: what was checked, when, by whom. |
| `ken serve --stdio` | JSON-RPC over stdin/stdout for other programs. |

Every command takes `--json`. Exit codes: `0` known, `10` new or seen
before, `20` lookalike, `2` input error.

## Files

Everything lives in `~/.kenning` (override with `KENNING_HOME`):

| File | Contents |
|---|---|
| `book.toml` | Your address book. Plain TOML, safe to edit and commit. |
| `config.toml` | Settings, including shared team books (`books = ["~/repo/ops/kenning.toml"]`). |
| `history.json` | Addresses you copied, how often, when. Validated addresses only, never raw clipboard text. Can be turned off. |
| `journal.jsonl` | Verification journal. |

## How lookalikes are detected

See [docs/detection-rules.md](docs/detection-rules.md). Every rule has
cases in [tests/lookalikes/](tests/lookalikes/).

## Layout

```
crates/kenning-core     recognition, lookalikes, book, history (no network code; see deny.toml)
crates/kenning-cli      the `ken` binary
crates/kenning-labels   built-in public labels, each with a source
apps/desktop            tray app (Windows first)
```

## Development

```
cargo test --workspace
cargo clippy --workspace --all-targets
cargo deny --manifest-path crates/kenning-core/Cargo.toml check
```
