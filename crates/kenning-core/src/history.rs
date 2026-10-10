//! Local contact history: which addresses the user has copied, how often and
//! when. Only validated addresses are stored, never raw clipboard text.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use jiff::Timestamp;
use serde::{Deserialize, Serialize};

use crate::chain::{self, Address, AddressKey, Chain};
use crate::error::{Error, Result};
use crate::fsutil;

/// Oldest contacts are dropped beyond this many, to keep the file small.
const MAX_CONTACTS: usize = 20_000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Contact {
    pub address: Address,
    pub first_seen: Timestamp,
    pub last_seen: Timestamp,
    pub count: u32,
    /// The address was a lookalike when first seen. Flagged contacts never
    /// serve as the "known" side of a lookalike match.
    pub flagged: bool,
}

#[derive(Serialize, Deserialize)]
struct RawContact {
    chain: Chain,
    address: String,
    first_seen: Timestamp,
    last_seen: Timestamp,
    count: u32,
    #[serde(default)]
    flagged: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct HistoryFile {
    version: u32,
    contacts: Vec<RawContact>,
}

#[derive(Clone, Debug, Default)]
pub struct History {
    path: Option<PathBuf>,
    contacts: Vec<Contact>,
    index: HashMap<AddressKey, usize>,
}

impl History {
    pub fn in_memory() -> Self {
        History::default()
    }

    pub fn load(path: &Path) -> Result<Self> {
        let mut history = History {
            path: Some(path.to_owned()),
            ..Default::default()
        };
        if let Some(text) = fsutil::read_optional(path)? {
            let file: HistoryFile = serde_json::from_str(&text).map_err(|e| Error::Format {
                path: path.to_owned(),
                message: e.to_string(),
            })?;
            for raw in file.contacts {
                // Skip anything that no longer validates rather than failing:
                // history is a cache, not a source of truth.
                if let Ok(address) = chain::parse_on(raw.chain, &raw.address) {
                    history.push(Contact {
                        address,
                        first_seen: raw.first_seen,
                        last_seen: raw.last_seen,
                        count: raw.count,
                        flagged: raw.flagged,
                    });
                }
            }
        }
        Ok(history)
    }

    fn push(&mut self, c: Contact) {
        let key = c.address.key();
        if !self.index.contains_key(&key) {
            self.index.insert(key, self.contacts.len());
            self.contacts.push(c);
        }
    }

    pub fn get(&self, key: &AddressKey) -> Option<&Contact> {
        self.index.get(key).map(|&i| &self.contacts[i])
    }

    pub fn contacts(&self) -> &[Contact] {
        &self.contacts
    }

    pub fn len(&self) -> usize {
        self.contacts.len()
    }

    pub fn is_empty(&self) -> bool {
        self.contacts.is_empty()
    }

    /// Record one copy of `address` at `now`. Returns the updated contact.
    pub fn record(&mut self, address: &Address, now: Timestamp, flagged: bool) -> &Contact {
        let key = address.key();
        let i = match self.index.get(&key) {
            Some(&i) => {
                let c = &mut self.contacts[i];
                c.last_seen = now;
                c.count = c.count.saturating_add(1);
                i
            }
            None => {
                let i = self.contacts.len();
                self.contacts.push(Contact {
                    address: address.clone(),
                    first_seen: now,
                    last_seen: now,
                    count: 1,
                    flagged,
                });
                self.index.insert(key, i);
                i
            }
        };
        &self.contacts[i]
    }

    /// Forget one address. Returns whether it was present.
    pub fn forget(&mut self, key: &AddressKey) -> bool {
        let Some(i) = self.index.remove(key) else {
            return false;
        };
        self.contacts.remove(i);
        self.reindex();
        true
    }

    pub fn clear(&mut self) {
        self.contacts.clear();
        self.index.clear();
    }

    fn reindex(&mut self) {
        self.index = self
            .contacts
            .iter()
            .enumerate()
            .map(|(i, c)| (c.address.key(), i))
            .collect();
    }

    pub fn save(&mut self) -> Result<()> {
        let Some(path) = self.path.clone() else {
            return Ok(());
        };
        if self.contacts.len() > MAX_CONTACTS {
            self.contacts.sort_by_key(|c| std::cmp::Reverse(c.last_seen));
            self.contacts.truncate(MAX_CONTACTS);
            self.reindex();
        }
        let file = HistoryFile {
            version: 1,
            contacts: self
                .contacts
                .iter()
                .map(|c| RawContact {
                    chain: c.address.chain(),
                    address: c.address.as_str().to_owned(),
                    first_seen: c.first_seen,
                    last_seen: c.last_seen,
                    count: c.count,
                    flagged: c.flagged,
                })
                .collect(),
        };
        let json = serde_json::to_string_pretty(&file).expect("history serializes");
        fsutil::write_atomic(&path, json.as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book::tests::tempdir;

    #[test]
    fn records_and_persists() {
        let dir = tempdir();
        let path = dir.join("history.json");
        let a = chain::parse("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").unwrap();
        let t0: Timestamp = "2026-10-01T10:00:00Z".parse().unwrap();
        let t1: Timestamp = "2026-10-03T10:00:00Z".parse().unwrap();

        let mut h = History::load(&path).unwrap();
        h.record(&a, t0, false);
        let c = h.record(&a, t1, true);
        assert_eq!(
            (c.count, c.first_seen, c.last_seen, c.flagged),
            (2, t0, t1, false)
        );
        h.save().unwrap();

        let h = History::load(&path).unwrap();
        assert_eq!(h.get(&a.key()).unwrap().count, 2);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn forget_reindexes() {
        let mut h = History::in_memory();
        let a = chain::parse("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").unwrap();
        let b = chain::parse("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").unwrap();
        h.record(&a, Timestamp::now(), false);
        h.record(&b, Timestamp::now(), false);
        assert!(h.forget(&a.key()));
        assert!(h.get(&a.key()).is_none());
        assert_eq!(h.get(&b.key()).unwrap().address, b);
    }
}
