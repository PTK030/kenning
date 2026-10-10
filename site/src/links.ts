export const REPO = "https://github.com/PTK030/kenning";
export const RELEASES = `${REPO}/releases`;
export const RULES = `${REPO}/blob/main/docs/detection-rules.md`;
export const INSTALL_CLI = `cargo install --git ${REPO} kenning-cli`;

// One easing curve for the whole page: fast out, long settle.
export const ease = [0.22, 1, 0.36, 1] as const;
