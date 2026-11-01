// Mirrors of the Rust types the commands return (serde JSON).

export type Chain = "evm" | "solana" | "bitcoin" | "tron";
export type State = "mine" | "team" | "contact" | "public" | "lookalike" | "seen" | "new";
export type KnownKind = "mine" | "team" | "contact" | "public" | "history";
export type Owner = "me" | "team" | "contact";
export type LabelKind = "token" | "contract" | "program" | "exchange" | "other";

export interface Address {
  chain: Chain;
  text: string;
}

export interface Span {
  text: string;
  same: boolean;
}

export interface Similarity {
  same_prefix: number;
  same_suffix: number;
  differing: number;
  length: number;
}

export interface LookalikeMatch {
  known: Address;
  known_grouped: string;
  known_kind: KnownKind;
  known_label: string | null;
  known_last_seen: string | null;
  similarity: Similarity;
  candidate_spans: Span[];
  known_spans: Span[];
}

export interface Contact {
  address: Address;
  first_seen: string;
  last_seen: string;
  count: number;
  flagged: boolean;
}

export interface Recognition {
  address: Address;
  grouped: string;
  state: State;
  label: string | null;
  note: string | null;
  /** The user's picture for a book entry. */
  emoji: string | null;
  source: string | null;
  label_kind: LabelKind | null;
  history: Contact | null;
  lookalike: LookalikeMatch | null;
  more_lookalikes: number;
  headline: string;
  detail: string;
}

export type Badge =
  | { kind: "recognition"; recognition: Recognition }
  | { kind: "info"; text: string }
  | { kind: "alert"; title: string; text: string; action: { id: "restore" | "clear"; label: string } | null };

/** A badge plus how long it stays and whether to play a sound. */
export type BadgeView = Badge & { seconds: number; sounds: boolean };

export interface LookalikeView {
  recognition: Recognition;
  variant: number;
  sounds: boolean;
}

/** Where the details window got the address. */
export type Source = "selection" | "clipboard";

export interface DetailsView {
  recognition: Recognition;
  source: Source;
  network: boolean;
}

export interface Entry {
  address: Address;
  label: string;
  owner: Owner;
  note: string | null;
  emoji: string | null;
  tint: string | null;
  group: string | null;
  added_at: string | null;
  source: string | null;
}

export interface BookView {
  name: string;
  writable: boolean;
  path: string | null;
  entries: Entry[];
}

export interface Rules {
  min_prefix: number;
  min_suffix: number;
  min_total_personal: number;
  min_total_public: number;
}

export interface Config {
  books: string[];
  history: boolean;
  journal: boolean;
  clipboard: "shortcut" | "watch";
  shortcut: string;
  details_shortcut: string;
  keys: Keys;
  badge_seconds: number;
  autostart: boolean;
  sounds: boolean;
  network: boolean;
  solana_rpc?: string | null;
  /** EVM networks an EVM address is looked up on (ids, see evm_choices). */
  evm_networks: string[];
  /** Your own mempool server for Bitcoin lookups. */
  bitcoin_api?: string | null;
  trongrid_key?: string | null;
  onboarded: boolean;
  lookalike: Rules;
  /** The clipboard guard: swapped addresses and secrets on the clipboard. */
  guard: boolean;
  /** Ask for a newer Kenning at start and every 12 hours. */
  update_check: boolean;
}

/** Why the guard took a write for a swap. */
export type Clue = "no_input" | "background" | "looks_alike";

/** What the clipboard guard has seen (kept in memory until Kenning quits). */
export type GuardEvent =
  | { kind: "swap"; at: string; chain: Chain; copied: string; found: string; process: string | null; path: string | null; after_ms: number; clues: Clue[] }
  | { kind: "secret"; at: string; what: string; process: string | null; path: string | null }
  | { kind: "test"; at: string; checked: number; swaps: TestSwap[] };

export interface TestSwap {
  chain: Chain;
  wrote: string;
  found: string | null;
  process: string | null;
  /** The program's file, for "Show the file". */
  path: string | null;
}

/** A running clipboard test: one decoy out (`clean` null) or back. */
export interface TestStep {
  index: number;
  chain: Chain;
  clean: boolean | null;
}

/** Shortcuts inside Kenning's windows (config.toml `[keys]`). */
export interface Keys {
  fix: string;
  dismiss: string;
  add: string;
  find: string;
  help: string;
}

export interface Overview {
  version: string;
  config: Config;
  paused: boolean;
  home: string;
  book_path: string;
  book_count: number;
  shared_books: string[];
  public_label_count: number;
  history_count: number;
  warnings: string[];
  hosts: [string, string][];
  /** EVM networks that can be chosen: id, name, the host asked. */
  evm_choices: [string, string, string][];
  /** Where an update check and an install go. */
  update_hosts: [string, string][];
}

/** A newer Kenning than this one, as its release describes it. */
export interface UpdateInfo {
  version: string;
  current: string;
  /** The release notes: that version's section of the changelog. */
  notes: string | null;
  date: string | null;
}

export interface Onchain {
  network: string;
  source: string;
  active: boolean;
  transactions: number | null;
  transactions_capped: boolean;
  contract: boolean;
  verified: boolean | null;
  name: string | null;
  fetched_at: string;
  /** EVM: each network asked (empty when only one was). */
  networks?: NetworkUse[];
}

/** One EVM network's answer. `used` null: no transaction sent and no
 *  balance as far as a node can tell (tokens received are invisible to
 *  it), or the network failed (`error`). */
export interface NetworkUse {
  network: string;
  source: string;
  used: boolean | null;
  transactions: number | null;
  transactions_capped: boolean;
  contract: boolean;
  error: string | null;
}

export type Fact =
  | { state: "pending" }
  | { state: "ok"; summary: string; active: boolean; onchain: Onchain }
  | { state: "error"; message: string };

export interface JournalRecord {
  at: string;
  user: string;
  action: "checked" | "lookalike_shown" | "copied_correct" | "marked_mine" | "added" | "edited" | "removed";
  chain: Chain;
  address: string;
  state: string;
  label?: string;
  related?: string;
}

/** Two addresses compared character by character (Check › Compare). */
/** Why two addresses could not be compared (commands.rs, CompareProblem). */
export interface CompareProblem {
  /** The box at fault, or null when it is the pair (different chains). */
  field: "used" | "expected" | null;
  kind: "checksum" | "not_address" | "chains";
  /** The faulty box's chain (checksum), or the used and expected chains. */
  chains: Chain[];
  message: string;
}

export interface Comparison {
  same: boolean;
  chain: Chain;
  similarity: Similarity;
  a_grouped: string;
  b_grouped: string;
  a_spans: Span[];
  b_spans: Span[];
}

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: [number, string][];
}
