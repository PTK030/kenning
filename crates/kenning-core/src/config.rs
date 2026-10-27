//! `config.toml`: user settings shared by the CLI and the desktop app.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::fsutil;
use crate::lookalike::Rules;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClipboardMode {
    /// Check the clipboard only when the global shortcut is pressed.
    #[default]
    Shortcut,
    /// Check every clipboard change. An explicit choice in onboarding.
    Watch,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Shared, read-only books (for example a team book in a git repo).
    pub books: Vec<PathBuf>,
    /// Keep local contact history (validated addresses only).
    pub history: bool,
    /// Keep the verification journal (`ken log`).
    pub journal: bool,
    pub clipboard: ClipboardMode,
    /// Global shortcut, in the format the desktop app understands.
    pub shortcut: String,
    /// Global shortcut that copies the selection in the focused app and
    /// shows everything Kenning knows about the address in it.
    pub details_shortcut: String,
    /// Keys inside Kenning's own windows (the global `shortcut` works in
    /// every app; these only while a Kenning window has focus).
    pub keys: Keys,
    /// How long the corner badge stays, in seconds (2 to 7).
    pub badge_seconds: u32,
    pub autostart: bool,
    /// Soft sounds for the badge and the lookalike window.
    pub sounds: bool,
    /// On-chain lookups (transaction count, contract, verified). Off by
    /// default; when on, only the address itself is sent to the providers
    /// listed in `kenning-net`.
    pub network: bool,
    /// Custom Solana RPC URL (for example a Helius endpoint with your key).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub solana_rpc: Option<String>,
    /// Set once the user has finished onboarding.
    pub onboarded: bool,
    pub lookalike: Rules,
    /// The clipboard guard (desktop): look at every clipboard change for an
    /// address replaced behind your back, or a recovery phrase or private
    /// key left on it. Off by default: it reads every change.
    pub guard: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            books: Vec::new(),
            history: true,
            journal: true,
            clipboard: ClipboardMode::Shortcut,
            shortcut: "Ctrl+Alt+K".into(),
            details_shortcut: "Ctrl+Alt+D".into(),
            keys: Keys::default(),
            badge_seconds: 4,
            autostart: false,
            sounds: true,
            network: false,
            solana_rpc: None,
            onboarded: false,
            lookalike: Rules::default(),
            guard: false,
        }
    }
}

/// Shortcuts inside Kenning's windows. Every one has a modifier, so a key
/// pressed by accident while typing never acts on a warning. Actions use
/// Alt and a letter, like the buttons of a Windows dialog; moving around
/// uses Ctrl.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Keys {
    /// Lookalike window: put the address you know back on the clipboard.
    pub fix: String,
    /// Lookalike window: close it without changing anything.
    pub dismiss: String,
    /// Main window: add an address to the book.
    pub add: String,
    /// Main window: search the book.
    pub find: String,
    /// Main window: list every shortcut.
    pub help: String,
}

impl Default for Keys {
    fn default() -> Self {
        Keys {
            fix: "Alt+C".into(),
            dismiss: "Alt+D".into(),
            add: "Alt+N".into(),
            find: "Ctrl+F".into(),
            help: "Ctrl+/".into(),
        }
    }
}

impl Keys {
    /// The first pair of shortcuts (the global ones included) that use the
    /// same keys, described for the user.
    pub fn clash(&self, global: &str, details: &str) -> Option<String> {
        let all = [
            ("Check what you copied", global),
            ("Show details of the selected address", details),
            ("Copy the correct address", &self.fix),
            ("Dismiss", &self.dismiss),
            ("Add an address", &self.add),
            ("Search the book", &self.find),
            ("Show shortcuts", &self.help),
        ];
        for (i, (a, ka)) in all.iter().enumerate() {
            for (b, kb) in &all[i + 1..] {
                if normalize(ka) == normalize(kb) {
                    return Some(format!("“{a}” and “{b}” both use {ka}"));
                }
            }
        }
        None
    }
}

/// "alt + ctrl+k" and "Ctrl+Alt+K" are the same keys.
fn normalize(combo: &str) -> String {
    let mut parts: Vec<String> = combo
        .split('+')
        .map(|p| p.trim().to_ascii_lowercase())
        .filter(|p| !p.is_empty())
        .collect();
    parts.sort();
    parts.join("+")
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        match fsutil::read_optional(path)? {
            Some(text) => {
                let mut c: Config = toml::from_str(&text).map_err(|e| Error::Format {
                    path: path.to_owned(),
                    message: e.to_string(),
                })?;
                c.badge_seconds = c.badge_seconds.clamp(2, 7);
                Ok(c)
            }
            None => Ok(Config::default()),
        }
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let body = toml::to_string_pretty(self).expect("config serializes");
        fsutil::write_atomic(path, format!("# Kenning settings\n\n{body}").as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_config_uses_defaults() {
        let c: Config = toml::from_str("clipboard = \"watch\"\n[lookalike]\nmin_prefix = 4\n").unwrap();
        assert_eq!(c.clipboard, ClipboardMode::Watch);
        assert_eq!(c.lookalike.min_prefix, 4);
        assert_eq!(c.lookalike.min_suffix, Rules::default().min_suffix);
        assert!(c.history);
    }

    #[test]
    fn default_keys_do_not_clash() {
        let c = Config::default();
        assert_eq!(c.keys.clash(&c.shortcut, &c.details_shortcut), None);
    }

    #[test]
    fn clash_ignores_order_and_case() {
        let keys = Keys {
            dismiss: "alt + ctrl+k".into(),
            ..Keys::default()
        };
        let clash = keys.clash("Ctrl+Alt+K", "Ctrl+Alt+D").unwrap();
        assert!(clash.contains("Dismiss"), "{clash}");
    }

    #[test]
    fn global_shortcuts_must_differ() {
        let clash = Keys::default().clash("Ctrl+Alt+K", "alt+ctrl+k").unwrap();
        assert!(clash.contains("Show details"), "{clash}");
    }

    #[test]
    fn old_config_gets_details_shortcut() {
        let c: Config = toml::from_str("shortcut = \"Ctrl+Shift+K\"
").unwrap();
        assert_eq!(c.details_shortcut, "Ctrl+Alt+D");
    }

    #[test]
    fn default_is_quiet_and_offline() {
        let c = Config::default();
        assert_eq!(c.clipboard, ClipboardMode::Shortcut);
        assert!(!c.autostart);
        assert!(!c.network);
    }
}
