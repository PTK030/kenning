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
  | { kind: "info"; text: string };

/** A badge plus how long it stays and whether to play a sound. */
export type BadgeView = Badge & { seconds: number; sounds: boolean };

export interface LookalikeView {
  recognition: Recognition;
  variant: number;
  sounds: boolean;
}

/** Where the details window got the address. */
export type Source = "selection" | "clipboard" | "book";

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
  onboarded: boolean;
  lookalike: Rules;
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
}

export type Fact =
  | { state: "pending" }
  | { state: "ok"; summary: string; active: boolean; onchain: Onchain }
  | { state: "error"; message: string };

export interface JournalRecord {
  at: string;
  user: string;
  action: "checked" | "lookalike_shown" | "copied_correct" | "marked_mine" | "added" | "removed";
  chain: Chain;
  address: string;
  state: string;
  label?: string;
  related?: string;
}

/** Two addresses compared character by character (Check › Compare). */
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
