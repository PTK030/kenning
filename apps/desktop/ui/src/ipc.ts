// The only file that talks to the desktop shell. Everything the UI can do
// is listed here; swapping Tauri for another shell means rewriting this file.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type {
  BadgeView,
  BookView,
  Comparison,
  Config,
  DetailsView,
  Fact,
  ImportSummary,
  JournalRecord,
  LookalikeView,
  Overview,
  Owner,
  Recognition,
} from "./types";

export const ipc = {
  overview: () => invoke<Overview>("overview"),

  getBadge: () => invoke<BadgeView | null>("get_badge"),
  hideBadge: () => invoke<void>("hide_badge"),
  badgePause: () => invoke<void>("badge_pause"),
  badgeResume: (remainingMs: number) => invoke<void>("badge_resume", { remainingMs }),

  getLookalike: () => invoke<LookalikeView | null>("get_lookalike"),
  copyCorrect: () => invoke<void>("copy_correct"),
  markMine: (label: string) => invoke<void>("mark_mine", { label }),
  dismissLookalike: () => invoke<void>("dismiss_lookalike"),

  getDetails: () => invoke<DetailsView | null>("get_details"),
  fitDetails: (height: number, reveal: boolean) => invoke<void>("fit_details", { height, reveal }),
  closeDetails: () => invoke<void>("close_details"),
  copyDetailsAddress: () => invoke<void>("copy_details_address"),
  addDetailsAddress: (label: string, owner: Owner) => invoke<DetailsView>("add_details_address", { label, owner }),
  openExplorer: () => invoke<void>("open_explorer"),

  listBooks: () => invoke<BookView[]>("list_books"),
  recognizeText: (text: string) => invoke<Recognition[]>("recognize_text", { text }),
  addEntry: (address: string, label: string, owner: Owner, note: string | null) =>
    invoke<Recognition>("add_entry", { address, label, owner, note }),
  showEntry: (address: string, from: "book" | "journal" = "book") => invoke<void>("show_entry", { address, from }),
  compareAddresses: (a: string, b: string) => invoke<Comparison>("compare_addresses", { a, b }),
  removeEntry: (address: string) => invoke<boolean>("remove_entry", { address }),
  importCsv: (owner: Owner) => invoke<ImportSummary | null>("import_csv", { owner }),
  exportCsv: () => invoke<string | null>("export_csv"),
  openBookFile: () => invoke<void>("open_book_file"),
  reload: () => invoke<Overview>("reload"),

  journal: (limit?: number) => invoke<JournalRecord[]>("journal", { limit }),

  saveConfig: (config: Config) => invoke<Overview>("save_config", { config }),
  finishOnboarding: (watch: boolean) => invoke<Overview>("finish_onboarding", { watch }),
  clearHistory: () => invoke<void>("clear_history"),
  openMain: (tab: string) => invoke<void>("open_main", { tab }),

  getOnchain: (addresses: string[]) => invoke<Record<string, Fact>>("get_onchain", { addresses }),
  lookupOnchain: (address: string) => invoke<Fact>("lookup_onchain", { address }),
  setNetwork: (on: boolean) => invoke<Overview>("set_network", { on }),
};

export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

/** The window this page runs in: the custom title bar's controls. */
export const win = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  close: () => getCurrentWindow().close(),
  onResized: (fn: () => void) => getCurrentWindow().onResized(fn),
  onFocusChanged: (fn: (focused: boolean) => void) => getCurrentWindow().onFocusChanged((e) => fn(e.payload)),
};

/** Turn a rejected command into a readable message. */
export function message(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
}
