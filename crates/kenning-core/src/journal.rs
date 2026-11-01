//! Verification journal: an append-only local log of checks and decisions,
//! so a signer can show what was verified, when, and with what result.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

use jiff::Timestamp;
use serde::{Deserialize, Serialize};

use crate::chain::Chain;
use crate::error::{Error, Result};
use crate::fsutil;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    /// The user explicitly checked an address (CLI, shortcut, card).
    Checked,
    /// A lookalike was shown.
    LookalikeShown,
    /// The user clicked "Copy the correct address".
    CopiedCorrect,
    /// The user clicked "This is mine" on a lookalike.
    MarkedMine,
    Added,
    /// The user changed the name, note, picture or group of an entry.
    Edited,
    Removed,
}

impl Action {
    pub fn as_str(self) -> &'static str {
        match self {
            Action::Checked => "checked",
            Action::LookalikeShown => "lookalike shown",
            Action::CopiedCorrect => "copied correct",
            Action::MarkedMine => "marked mine",
            Action::Added => "added",
            Action::Edited => "edited",
            Action::Removed => "removed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Record {
    pub at: Timestamp,
    pub user: String,
    pub action: Action,
    pub chain: Chain,
    pub address: String,
    /// Recognition state at the time, e.g. "mine", "lookalike".
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// For lookalikes and corrections: the known address involved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related: Option<String>,
}

/// The OS user name, for the `user` field.
pub fn current_user() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".into())
}

pub fn append(path: &Path, record: &Record) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| Error::io(dir, e))?;
    }
    let mut line = serde_json::to_string(record).expect("record serializes");
    line.push('\n');
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| Error::io(path, e))?;
    f.write_all(line.as_bytes()).map_err(|e| Error::io(path, e))
}

/// All records, oldest first. Unreadable lines are skipped.
pub fn read(path: &Path) -> Result<Vec<Record>> {
    Ok(fsutil::read_optional(path)?
        .map(|text| {
            text.lines()
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect()
        })
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book::tests::tempdir;

    #[test]
    fn append_and_read() {
        let dir = tempdir();
        let path = dir.join("journal.jsonl");
        let r = Record {
            at: "2026-10-10T12:00:00Z".parse().unwrap(),
            user: "ania".into(),
            action: Action::Checked,
            chain: Chain::Tron,
            address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t".into(),
            state: "public".into(),
            label: Some("USDT (TRC-20)".into()),
            related: None,
        };
        append(&path, &r).unwrap();
        append(&path, &r).unwrap();
        assert_eq!(read(&path).unwrap(), vec![r.clone(), r]);
        std::fs::remove_dir_all(dir).ok();
    }
}
