// Runs inside the guard section's frame, before the desktop app's main
// window script (apps/desktop/ui). It answers for Kenning's Rust side with
// Tauri's IPC mock: the window opens on Protection with the guard on, and
// the page around it says when a swap happens or a step should be taken.
// The window code itself is the app's, unchanged.

import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

mockWindows("main");

const KNOWN = "0x28C6c06298d514Db089934071355E5743bf21d60";
const POISON = "0x28C6C0aaAAaAAAaaAaAaAAaaAAaaaaaaAAaA1d60";
const CLIPPER = { process: "InstallUtil.exe", path: "C:\\Users\\you\\AppData\\Roaming\\Microsoft\\InstallUtil.exe" };

// The test's decoys (guard.rs, DECOYS) and what the clipper made of the
// Bitcoin one: its own address, with the decoy's first and last characters.
const DECOYS = [
  ["evm", "0x52908400098527886E0F7030069857D2E4169EE7"],
  ["bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"],
  ["tron", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"],
  ["solana", "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T"],
] as const;
const SWAPPED = 1;
const SWAPPED_TO = "bc1qar0sk9xq7hzm3d2f8lw4e6tyc5vnp0gjwf5mdq";

const config = {
  books: [],
  history: true,
  journal: true,
  clipboard: "watch",
  shortcut: "Ctrl+Alt+K",
  details_shortcut: "Ctrl+Alt+D",
  keys: { fix: "Alt+C", dismiss: "Alt+D", add: "Alt+N", find: "Ctrl+F", help: "Ctrl+/" },
  badge_seconds: 4,
  autostart: true,
  sounds: false,
  network: false,
  solana_rpc: null,
  onboarded: true,
  lookalike: { min_prefix: 3, min_suffix: 4, min_total_personal: 7, min_total_public: 10 },
  guard: true,
  update_check: true,
  evm_networks: ["ethereum"],
  bitcoin_api: null,
  trongrid_key: null,
};
const overview = {
  version: "0.1.0",
  config,
  paused: false,
  home: "C:\\Users\\you\\.kenning",
  book_path: "C:\\Users\\you\\.kenning\\book.toml",
  book_count: 4,
  shared_books: [],
  public_label_count: 28,
  history_count: 12,
  warnings: [],
  hosts: [],
  evm_choices: [],
  update_hosts: [],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The clipboard test, as guard.rs runs it: each decoy out, then its answer. */
async function runTest() {
  for (const [index, [chain]] of DECOYS.entries()) {
    void emit("guard-test", { index, chain, clean: null });
    await sleep(900);
    void emit("guard-test", { index, chain, clean: index !== SWAPPED });
  }
  const [chain, wrote] = DECOYS[SWAPPED];
  const test = { kind: "test", at: new Date().toISOString(), checked: DECOYS.length, swaps: [{ chain, wrote, found: SWAPPED_TO, ...CLIPPER }] };
  void emit("guard", test);
  return test;
}

mockIPC(
  (cmd) => {
    switch (cmd) {
      case "overview":
        return overview;
      case "list_books":
        return [{ name: "personal", writable: true, path: overview.book_path, entries: [] }];
      case "journal":
      case "guard_events":
        return [];
      case "get_onchain":
        return {};
      case "run_clipboard_test":
        return runTest();
      case "plugin:window|is_maximized":
        return false;
      default:
        return null;
    }
  },
  { shouldMockEvents: true },
);

/** A click, as under a finger: the control dips, then its own handler runs. */
function press(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  el.animate([{ transform: "none" }, { transform: "scale(0.97)", filter: "brightness(1.08)" }, { transform: "none" }], { duration: 240, easing: "ease-out" })
    .finished.then(() => el.click());
}

// What the page around asks for: a swap caught now, or a step in the window.
addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || typeof e.data !== "object") return;
  if (e.data.swap) {
    void emit("guard", {
      kind: "swap",
      at: new Date().toISOString(),
      chain: "evm",
      copied: KNOWN,
      found: POISON,
      ...CLIPPER,
      after_ms: 14,
      clues: ["no_input", "background", "looks_alike"],
    });
  }
  if (e.data.open) press(".entries .entry");
  if (e.data.close) press(".guard-sheet .sheet-actions .btn:last-child");
  if (e.data.test) press("main header .btn.primary");
});

// The window focuses things as it opens them. On a web page that would pull
// the keyboard (and the scroll position) away from the reader, so the frame
// only takes focus once someone has clicked into it.
const focus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (options?: FocusOptions) {
  if (document.hasFocus()) focus.call(this, { ...options, preventScroll: true });
};
