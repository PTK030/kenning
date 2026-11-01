// Where the project stands. Keep this true: it is the first thing a careful
// reader (or a grant reviewer) will check against the repository.

export type Item = {
  text: string;
  /** A link to the issue that tracks it. */
  href?: string;
  /** Who pays for it, once someone does, e.g. "NLnet". */
  funded?: string;
};

export const STATUS = [
  "Version 0.1.0",
  "Windows 10 and 11",
  "No installer published yet: build from source",
  "Installers will not be signed at first, so SmartScreen asks once",
  "One maintainer",
];

export const ROADMAP: { title: string; items: Item[] }[] = [
  {
    title: "Done",
    items: [
      { text: "EVM, Solana, Bitcoin and Tron, with checksums" },
      { text: "Lookalike detection with public rules and 17 test cases" },
      { text: "Badge, lookalike window and details window" },
      { text: "Command line with JSON output and JSON-RPC" },
      { text: "Team books, a local journal, Safe{Wallet} import" },
      { text: "On-chain lookups, off by default" },
      { text: "A clipboard guard against clipper malware, with a test" },
    ],
  },
  {
    title: "Now",
    items: [{ text: "First release, with installers on GitHub" }],
  },
  {
    title: "Next",
    items: [
      { text: "Linux" },
      { text: "macOS" },
      { text: "Signed installers" },
      { text: "The engine as a library that open-source wallets can embed" },
      { text: "Detection rules as a versioned specification" },
    ],
  },
];
