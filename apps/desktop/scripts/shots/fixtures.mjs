// Canned backend answers for the screenshot harness: what the Tauri commands
// would return for a small, believable book. Every address here is public or
// made up; nothing comes from a real user.

export const KNOWN = "0x28C6c06298d514Db089934071355E5743bf21d60";
export const POISON = "0x28C6C0aaAAaAAAaaAaAaAAaaAAaaaaaaAAaA1d60";
export const NEW = "0x1111111254EEB25477B68fb85Ed929f73A960582";

const NOW = new Date("2026-10-27T14:20:00Z").getTime();
const ago = (min) => new Date(NOW - min * 60000).toISOString();

const grouped = (t) => (t.startsWith("0x") ? "0x " + t.slice(2).match(/.{1,4}/g).join(" ") : t.match(/.{1,4}/g).join(" "));

/** The two addresses split where they agree and where they do not. */
function spans(a, b) {
  const x = a.slice(2);
  const y = b.slice(2);
  let p = 0;
  while (x[p]?.toLowerCase() === y[p]?.toLowerCase()) p++;
  let q = 0;
  while (q < x.length - p && x.at(-1 - q).toLowerCase() === y.at(-1 - q).toLowerCase()) q++;
  return [
    { same: true, text: "0x" + x.slice(0, p) },
    { same: false, text: x.slice(p, x.length - q) },
    { same: true, text: x.slice(x.length - q) },
  ];
}

const recognition = (text, rest) => ({
  address: { chain: text.startsWith("bc1") ? "bitcoin" : "evm", text },
  grouped: grouped(text),
  label: null, note: null, emoji: null, source: null, label_kind: null, history: null, lookalike: null, more_lookalikes: 0,
  ...rest,
});

const similarity = { same_prefix: 6, same_suffix: 4, differing: 30, length: 40 };

export const known = recognition(KNOWN, {
  state: "mine", label: "Binance deposits", note: "my deposits", source: "personal",
  headline: "Binance deposits", detail: "my deposits · in your book",
});

export const lookalike = recognition(POISON, {
  state: "lookalike",
  headline: "This is not your Binance deposits address.",
  detail: "Matches 6 + 4 characters, 30 differ.",
  lookalike: {
    known: { chain: "evm", text: KNOWN }, known_grouped: grouped(KNOWN), known_kind: "mine", known_label: "Binance deposits", known_last_seen: null,
    similarity, candidate_spans: spans(POISON, KNOWN), known_spans: spans(KNOWN, POISON),
  },
});

export const fresh = recognition(NEW, { state: "new", headline: "New address", detail: "Not seen before" });

const entries = [
  ["Binance deposits", KNOWN, "me", "my deposits"],
  ["Cold wallet", "bc1q85xyzqgh3ph2v8sy6w9ue0dyk8lvdkw9tp8", "me", null],
  ["Payroll Safe", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "team", "2 of 3 signers"],
  ["Ola, design", "0x9f2B71d9a0c5aF8B7a4Cbb7C1E0d9e2A3c5b04c3", "contact", "invoices monthly"],
  ["Savings", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "me", null],
].map(([label, text, owner, note]) => ({
  address: { chain: text.startsWith("bc1") ? "bitcoin" : "evm", text },
  label, owner, note, emoji: null, tint: null, added_at: null, source: null, group: owner === "me" ? "Mine" : null,
}));

const journal = [
  [5, "lookalike_shown", POISON, "lookalike", "Binance deposits", KNOWN],
  [5, "copied_correct", POISON, "lookalike", "Binance deposits", KNOWN],
  [42, "checked", entries[2].address.text, "team", "Payroll Safe"],
  [43, "checked", entries[2].address.text, "team", "Payroll Safe"],
  [44, "checked", entries[2].address.text, "team", "Payroll Safe"],
  [60 * 20, "added", entries[3].address.text, "contact", "Ola, design"],
  [60 * 26, "checked", "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", "public", "Uniswap V3: Router 2"],
  [60 * 50, "removed", NEW, "new", undefined],
].map(([m, action, address, state, label, related]) => ({ at: ago(m), user: "you", action, chain: "evm", address, state, label, related }));

const guard = (scenario) => [
  scenario === "swapped"
    ? { kind: "test", at: ago(1), checked: 4, swaps: [{ chain: "bitcoin", wrote: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", found: "bc1qar9fwd3p4g8k2x7m5n0c6v8h3j2l4s9d0wf5mdq", process: "InstallUtil.exe", path: null }] }
    : { kind: "test", at: ago(1), checked: 4, swaps: [] },
  { kind: "swap", at: ago(12), chain: "evm", copied: KNOWN, found: POISON, process: "InstallUtil.exe", path: null, after_ms: 14, clues: ["no_input", "background", "looks_alike"] },
  { kind: "secret", at: ago(55), what: "a 12-word recovery phrase", process: "notepad.exe", path: null },
];

const onchain = (summary, active, networks = []) => ({
  state: "ok", summary, active,
  onchain: { network: "Ethereum", source: "Blockscout", active, transactions: active ? 1204 : 0, transactions_capped: active, contract: false, verified: null, name: null, fetched_at: ago(0), networks },
});

const used = onchain("Used on Ethereum and Base · 1,204+ transactions on Ethereum", true, [
  { network: "Ethereum", source: "Blockscout", used: true, transactions: 1204, transactions_capped: true, contract: false, error: null },
  { network: "Base", source: "mainnet.base.org", used: true, transactions: 12, transactions_capped: false, contract: false, error: null },
  { network: "Optimism", source: "Blockscout", used: false, transactions: null, transactions_capped: false, contract: false, error: null },
  { network: "BNB Chain", source: "", used: null, transactions: null, transactions_capped: false, contract: false, error: "EVM node: HTTP 429" },
]);
const unused = onchain("No sign of use on 6 EVM networks", false);

/**
 * Everything the mock needs for one scene. `scenario` picks a variant:
 * "full" (the default), "empty" (a first run), "swapped" (a failed clipboard
 * test), "journal-off", "onboarding".
 */
export function backend(scenario = "full", window = "main") {
  const empty = scenario === "empty" || scenario === "onboarding";
  const config = {
    books: [], history: true, journal: scenario !== "journal-off", clipboard: "watch", shortcut: "Ctrl+Alt+K", details_shortcut: "Ctrl+Alt+D",
    keys: { fix: "Alt+C", dismiss: "Alt+D", add: "Alt+N", find: "Ctrl+F", help: "Ctrl+/" },
    badge_seconds: 4, autostart: true, sounds: false, network: true, solana_rpc: null, onboarded: scenario !== "onboarding",
    lookalike: { min_prefix: 3, min_suffix: 4, min_total_personal: 7, min_total_public: 10 },
    guard: !empty, update_check: true,
    evm_networks: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bsc"],
    bitcoin_api: null, trongrid_key: null,
  };
  const book = { name: "personal", writable: true, path: "C:/Users/you/.kenning/book.toml", entries: empty ? [] : entries };
  const overview = {
    version: "0.1.0", config, paused: false, home: "C:\\Users\\you\\.kenning", book_path: "C:\\Users\\you\\.kenning\\book.toml",
    book_count: book.entries.length, shared_books: [], public_label_count: 28, history_count: empty ? 0 : 41, warnings: [],
    hosts: [["eth.blockscout.com", "EVM addresses (Ethereum mainnet)"], ["api.mainnet-beta.solana.com", "Solana addresses"], ["mempool.space", "Bitcoin addresses"], ["api.trongrid.io", "Tron addresses"]],
    evm_choices: [["ethereum", "Ethereum", "https://eth.blockscout.com"], ["base", "Base", "https://mainnet.base.org"], ["arbitrum", "Arbitrum", "https://arb1.arbitrum.io/rpc"], ["optimism", "Optimism", "https://explorer.optimism.io"], ["polygon", "Polygon", "https://polygon-bor-rpc.publicnode.com"], ["bsc", "BNB Chain", "https://bsc-dataseed.bnbchain.org"]],
    update_hosts: [["api.github.com", "Release notes"], ["github.com", "The installer"]],
  };
  return {
    window,
    recognitions: [known, lookalike, fresh],
    comparison: { same: false, chain: "evm", similarity, a_grouped: lookalike.grouped, b_grouped: known.grouped, a_spans: lookalike.lookalike.candidate_spans, b_spans: lookalike.lookalike.known_spans },
    responses: {
      overview,
      list_books: [book],
      journal: empty ? [] : journal,
      guard_events: empty ? [] : guard(scenario),
      get_onchain: { [KNOWN]: used, [POISON]: unused },
      lookup_onchain: used,
      update_found: null,
      update_check: null,
      get_badge: { kind: "recognition", recognition: known, seconds: 4, sounds: false },
      get_lookalike: { recognition: lookalike, variant: 2, sounds: false },
      get_details: { recognition: known, source: "clipboard", network: true },
      "plugin:window|is_maximized": false,
    },
  };
}

/**
 * Stands in for the Tauri bridge inside the page. Runs in the browser, so it
 * may only use what it is given.
 */
export function bridge(data) {
  let id = 1;
  const answer = (cmd, args) => {
    if (cmd.startsWith("plugin:event|")) return id++;
    if (cmd === "fit_lookalike" || cmd === "fit_details") {
      window.__fit = args.height;
      return null;
    }
    if (cmd === "recognize_text") return data.recognitions.filter((r) => args.text.includes(r.address.text));
    if (cmd === "compare_addresses") {
      if (!args.a || !args.b) return null;
      return args.a === args.b ? { ...data.comparison, same: true } : data.comparison;
    }
    return cmd in data.responses ? data.responses[cmd] : null;
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: data.window }, currentWebview: { windowLabel: data.window, label: data.window } },
    transformCallback: (cb) => {
      const n = id++;
      window[`_${n}`] = cb;
      return n;
    },
    invoke: async (cmd, args) => answer(cmd, args ?? {}),
    convertFileSrc: (p) => p,
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
}
