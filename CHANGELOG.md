# Changelog

What changed in each version of Kenning, newest first. A version's section
is also its release notes: the app shows it under "What's new", and when it
offers an update.

## 0.1.0

The first beta. The installers are not code-signed yet, so Windows
SmartScreen asks once before the first run.

### Address book

- Pictures for addresses: an emoji (Google's Noto 3D artwork, bundled) on a
  tile whose background suits it, or one you choose.
- Your own groups, folded away when you want the list short.
- Adding, changing and removing an address in one sheet over the list;
  clicking an address shows what Kenning knows about it without opening a
  second window.
- Order by name or by newest; search finds names, notes, groups and
  addresses.
- Each network shown with its own mark and colour.

### Recognition

- EVM, Solana, Bitcoin and Tron addresses, with checksums.
- Lookalike detection with public rules and 17 test cases.
- The corner badge, the lookalike window and the details window.
- Team books, a local journal and Safe{Wallet} import.
- Check reads a whole message at once: every address in it gets a row,
  lookalikes first and open, the rest a click away. Two addresses can be
  compared character by character, and a mistyped one is named, with the
  box it is in.

### Clipboard guard

- Off until you turn it on, offered in the onboarding with "Every time I
  copy". It watches for an address you copied being replaced by another
  program, and says which program, without anything being written to disk.
- "Put mine back" restores your address in one click.
- A warning when a recovery phrase or a private key is left on the
  clipboard.
- Protection › Run the test puts a public address of each chain on the
  clipboard and watches whether anything writes over it.

### Network

- On-chain lookups, off by default. An EVM address is looked up on
  Ethereum, Base, Arbitrum, Optimism, Polygon and BNB Chain, the networks
  you choose, and the answer says on which it was used.
- Your own servers for Solana and Bitcoin, and your own TronGrid key.

### Also

- Check and Protection are laid out as the Address book and the Journal:
  the page's one control in the header, then the page. Each catch on the
  Protection page opens with what happened, why Kenning took it for a swap,
  the program's file and what to do now.
- The sidebar in the order of use (Ctrl+1 to 5 follow it), with Settings at
  its foot. While watching is paused, it says so and offers Resume, and the
  tray icon shows a pause sign.
- The journal searches, folds its days and counts repeats.
- The installer offers a desktop shortcut and starting with Windows.
- A command line with JSON output and JSON-RPC.
- Update checks, offered in the onboarding: at start and every 12 hours,
  asking github.com only. A new version installs only with a valid
  signature.
