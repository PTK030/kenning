export const REPO = "https://github.com/PTK030/kenning";
export const RELEASES = `${REPO}/releases`;
export const RULES = `${REPO}/blob/main/docs/detection-rules.md`;
export const INSTALL_CLI = `cargo install --git ${REPO} kenning-cli`;

// Where each claim on the page can be checked.
const FILE = `${REPO}/blob/main`;
export const GATE = `${FILE}/docs/desktop-gate.md`;
export const DENY = `${FILE}/deny.toml`;
export const CORPUS = `${FILE}/tests/lookalikes/corpus.toml`;
export const CLIPBOARD_SRC = `${FILE}/apps/desktop/src-tauri/src/clipboard/windows.rs`;
export const LABELS_SRC = `${REPO}/tree/main/crates/kenning-labels/data`;
export const CLI_DOCS = `${REPO}#cli-1`;
export const NETWORK_DOCS = `${REPO}#network`;
export const FILES_DOCS = `${REPO}#files`;
export const ISSUES = `${REPO}/issues`;

// Address poisoning measured on Ethereum and BSC (Tsuchiya et al., USENIX Security 2025).
export const STUDY = "https://www.usenix.org/conference/usenixsecurity25/presentation/tsuchiya";

// One easing curve for the whole page: fast out, long settle.
export const ease = [0.22, 1, 0.36, 1] as const;
