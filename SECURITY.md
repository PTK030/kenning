# Security

Kenning stands between you and a payment, so a flaw in it can cost someone
their funds. Please report one privately.

## Reporting

Use [Report a vulnerability](https://github.com/PTK030/kenning/security/advisories/new)
on GitHub. Say what you found, how to reproduce it and which version you
used. Never include a real recovery phrase or private key.

You will get an answer within a few days. A fix is released before the
details are made public, and you are credited unless you prefer not to be.

## In scope

- A lookalike address that Kenning recognises as yours, or does not warn
  about when the rules say it should (`docs/detection-rules.md`).
- A way to change what the warning window, the badge or the details window
  show, or to act on a warning without the user (keys, focus, clicks).
- The clipboard guard missing a swap it is built to catch, or Kenning
  itself writing the clipboard when it should not.
- Anything leaving the computer that should not: clipboard text, the book,
  the history, or an address sent while on-chain lookups are off.
- An update installed without a valid signature, or from somewhere other
  than this repository's releases.
- Reading content another app marked as private (password managers).

## How Kenning is built to be safe

- **Local only.** The recognition engine (`crates/kenning-core`) has no
  network code; `cargo deny` (`deny.toml`) fails the build if any is added.
- **Network off by default.** When turned on, only the address being
  checked is sent, to the hosts listed in Settings and in `kenning-net`.
- **Clipboard.** Read only on the shortcut, or on every copy if you choose;
  text over 4 KB and anything marked private is skipped; only valid
  addresses are kept, never other text.
- **Updates.** Installed only if the installer's signature matches the
  public key built into the app.
- **No accounts, analytics or crash reports.**

## Supported versions

Only the latest release gets security fixes.
