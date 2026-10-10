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
    /// How long the corner badge stays, in seconds (2 to 7).
    pub badge_seconds: u32,
    pub autostart: bool,
    /// Soft sounds for the badge and the lookalike window.
    pub sounds: bool,
    /// Set once the user has finished onboarding.
    pub onboarded: bool,
    pub lookalike: Rules,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            books: Vec::new(),
            history: true,
            journal: true,
            clipboard: ClipboardMode::Shortcut,
            shortcut: "Ctrl+Alt+K".into(),
            badge_seconds: 4,
            autostart: false,
            sounds: true,
            onboarded: false,
            lookalike: Rules::default(),
        }
    }
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
    fn default_is_quiet_and_offline() {
        let c = Config::default();
        assert_eq!(c.clipboard, ClipboardMode::Shortcut);
        assert!(!c.autostart);
    }
}
