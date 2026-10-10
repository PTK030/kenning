# Detection rules

This document is the specification for how Kenning decides what a copied
address is. The code in `crates/kenning-core/src/classify.rs` and
`lookalike.rs` implements it, and every rule has cases in
`tests/lookalikes/corpus.toml`. Change all three together.

## States

| State       | Meaning                                                    | UI            |
|-------------|------------------------------------------------------------|---------------|
| `mine`      | Exact match in your book, owner `me`                       | quiet badge   |
| `team`      | Exact match in a shared (team) book                        | quiet badge   |
| `contact`   | Exact match in your book, owner `contact`                  | quiet badge   |
| `public`    | Exact match in the built-in public labels                  | quiet badge   |
| `lookalike` | Not known, but resembles something known (rules below)    | window        |
| `seen`      | Not labelled, but you have copied it before                | quiet badge   |
| `new`       | None of the above                                          | amber badge   |

## Precedence

1. **Exact match in a book or in the public labels.** Book entries win over
   public labels, so your own name for an address is what you see. An exact
   book match also wins over lookalike detection: "This is mine" is
   remembered forever.
2. **Lookalike** of any known address: book entries, public labels, and
   addresses from your history that were not lookalikes themselves.
3. **Seen**: in your history.
4. **New**.

## Lookalike rule

Two different addresses on the same chain are lookalikes when their *bodies*
share at least `min_prefix` leading characters **and** at least `min_suffix`
trailing characters, and the two together reach a minimum total.

* The **body** is the address without its fixed prefix, which an attacker
  gets for free: `0x` (EVM), `T` (Tron), `1`/`3` (legacy Bitcoin),
  `bc1q`/`bc1p`/`tb1q`... (segwit). Solana has no fixed prefix.
* Comparison **ignores letter case** on every chain. A person comparing
  `7xKX` with `7xkx` at a glance will not see the difference either.
* Suffix matching never overlaps the prefix match.

| Setting              | Default | Applies to                                  |
|----------------------|---------|---------------------------------------------|
| `min_prefix`         | 3       | all                                         |
| `min_suffix`         | 3       | all                                         |
| `min_total_personal` | 7       | known address from your books or history    |
| `min_total_public`   | 8       | known address from the public labels        |

All four are configurable in `config.toml` under `[lookalike]`.

### Why these numbers

Attackers grind vanity addresses until the start and end match the address
they target. That is cheap: matching 10 hex characters is about 10¹²
attempts on a GPU. People typically check the first and last 4 characters,
so most poisoning addresses match at least 4 + 4.

The other side is false alarms, which the brief treats as the worst failure:
each false alarm teaches people to ignore the window. For hex (EVM), two
unrelated addresses match a given 7 characters with probability
16⁻⁷ ≈ 3.7 × 10⁻⁹, and 8 characters with probability 16⁻⁸ ≈ 2.3 × 10⁻¹⁰.

* Personal references (a book of up to a few thousand addresses, plus
  history) at 7 characters: under 10⁻⁵ per copy.
* Public labels can grow to tens of thousands of entries, so they need
  8 characters. 10⁵ labels × 2.3 × 10⁻¹⁰ ≈ 2 × 10⁻⁵ per copy.

Base58 and bech32 alphabets are larger (about 33 case-folded symbols and
32 symbols), so the same thresholds are stricter there.

## What is shown

The lookalike window compares the full copied address with the full known
address, in groups of 4, with matching runs dimmed and differing runs
highlighted. The text says what matches and what differs, for example:

> This is not your Binance address. Matches 6 + 4 characters, 30 differ.

It never says "malicious". The address might be a harmless coincidence or
your own vanity address, which is why "This is mine" is always one click away.

## Changelog

* **0.1.0** – first version of the rules above.
