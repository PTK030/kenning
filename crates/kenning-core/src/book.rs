//! The address book: `book.toml`, human-editable and friendly to git.
//!
//! ```toml
//! [[entry]]
//! chain = "evm"
//! address = "0x28C6c06298d514Db089934071355E5743bf21d60"
//! label = "Binance"
//! note = "my deposits"
//! owner = "me"
//! added_at = "2026-10-10T12:00:00Z"
//! ```

use std::path::{Path, PathBuf};

use jiff::Timestamp;
use serde::{Deserialize, Serialize};

use crate::chain::{self, Address, AddressKey, Chain};
use crate::error::{Error, Result};
use crate::fsutil;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Owner {
    /// The user's own address.
    #[default]
    Me,
    /// An address owned by the user's team (shared book).
    Team,
    /// Someone else's address the user pays or receives from.
    Contact,
}

impl Owner {
    pub fn as_str(self) -> &'static str {
        match self {
            Owner::Me => "me",
            Owner::Team => "team",
            Owner::Contact => "contact",
        }
    }
}

impl std::str::FromStr for Owner {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "me" | "mine" => Ok(Owner::Me),
            "team" => Ok(Owner::Team),
            "contact" => Ok(Owner::Contact),
            other => Err(format!("unknown owner `{other}` (expected me, team or contact)")),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Entry {
    pub address: Address,
    pub label: String,
    pub owner: Owner,
    pub note: Option<String>,
    pub added_at: Option<Timestamp>,
    pub source: Option<String>,
}

impl Entry {
    pub fn new(address: Address, label: impl Into<String>, owner: Owner) -> Self {
        Entry {
            address,
            label: label.into(),
            owner,
            note: None,
            added_at: Some(Timestamp::now()),
            source: None,
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
struct BookFile {
    #[serde(default, rename = "entry")]
    entries: Vec<RawEntry>,
}

#[derive(Serialize, Deserialize)]
struct RawEntry {
    chain: Chain,
    address: String,
    label: String,
    #[serde(default)]
    owner: Owner,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    added_at: Option<Timestamp>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Book {
    name: String,
    path: Option<PathBuf>,
    writable: bool,
    entries: Vec<Entry>,
}

impl Book {
    /// An empty in-memory book.
    pub fn new(name: impl Into<String>) -> Self {
        Book {
            name: name.into(),
            path: None,
            writable: true,
            entries: Vec::new(),
        }
    }

    /// Load the user's own book. A missing file is an empty book.
    pub fn load_personal(path: &Path) -> Result<Self> {
        let mut book = Self::load(path, "personal", true)?;
        book.path = Some(path.to_owned());
        Ok(book)
    }

    /// Load a shared, read-only book (for example a team book in a repo).
    /// Entries marked `me` there belong to the team, not to this user.
    pub fn load_shared(path: &Path) -> Result<Self> {
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("shared")
            .to_owned();
        let mut book = Self::load(path, &name, false)?;
        for e in &mut book.entries {
            if e.owner == Owner::Me {
                e.owner = Owner::Team;
            }
        }
        Ok(book)
    }

    fn load(path: &Path, name: &str, writable: bool) -> Result<Self> {
        let text = fsutil::read_optional(path)?;
        let mut book = Book {
            name: name.to_owned(),
            path: Some(path.to_owned()),
            writable,
            entries: Vec::new(),
        };
        if let Some(text) = text {
            book.entries = Self::parse(path, &text)?;
        } else if !writable {
            return Err(Error::Invalid(format!(
                "shared book {} does not exist",
                path.display()
            )));
        }
        Ok(book)
    }

    fn parse(path: &Path, text: &str) -> Result<Vec<Entry>> {
        let file: BookFile = toml::from_str(text).map_err(|e| Error::Format {
            path: path.to_owned(),
            message: e.to_string(),
        })?;
        let mut entries = Vec::with_capacity(file.entries.len());
        for (i, raw) in file.entries.into_iter().enumerate() {
            let entry_err = |message: String| Error::Entry {
                path: path.to_owned(),
                index: i + 1,
                message,
            };
            let address = chain::parse_on(raw.chain, &raw.address).map_err(|e| {
                entry_err(format!(
                    "`{}` is not a valid {} address: {e}",
                    raw.address, raw.chain
                ))
            })?;
            if raw.label.trim().is_empty() {
                return Err(entry_err("label is empty".into()));
            }
            if entries.iter().any(|e: &Entry| e.address.key() == address.key()) {
                return Err(entry_err(format!("{} is listed twice", raw.address)));
            }
            entries.push(Entry {
                address,
                label: raw.label,
                owner: raw.owner,
                note: raw.note,
                added_at: raw.added_at,
                source: raw.source,
            });
        }
        Ok(entries)
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    pub fn is_writable(&self) -> bool {
        self.writable
    }

    pub fn entries(&self) -> &[Entry] {
        &self.entries
    }

    pub fn get(&self, key: &AddressKey) -> Option<&Entry> {
        self.entries.iter().find(|e| &e.address.key() == key)
    }

    /// Add an entry, or replace the label, owner and note of an existing one.
    /// Returns `true` if the address was new.
    pub fn upsert(&mut self, entry: Entry) -> Result<bool> {
        self.ensure_writable()?;
        if entry.label.trim().is_empty() {
            return Err(Error::Invalid("label must not be empty".into()));
        }
        let key = entry.address.key();
        if let Some(existing) = self.entries.iter_mut().find(|e| e.address.key() == key) {
            existing.label = entry.label;
            existing.owner = entry.owner;
            if entry.note.is_some() {
                existing.note = entry.note;
            }
            if entry.source.is_some() {
                existing.source = entry.source;
            }
            Ok(false)
        } else {
            self.entries.push(entry);
            Ok(true)
        }
    }

    pub fn remove(&mut self, key: &AddressKey) -> Result<Option<Entry>> {
        self.ensure_writable()?;
        Ok(self
            .entries
            .iter()
            .position(|e| &e.address.key() == key)
            .map(|i| self.entries.remove(i)))
    }

    fn ensure_writable(&self) -> Result<()> {
        if self.writable {
            Ok(())
        } else {
            Err(Error::Invalid(format!("book `{}` is read-only", self.name)))
        }
    }

    /// Serialize with a stable order (chain, then label, then address) so
    /// diffs in git stay small.
    pub fn to_toml(&self) -> String {
        let mut entries: Vec<&Entry> = self.entries.iter().collect();
        entries.sort_by(|a, b| {
            (a.address.chain(), a.label.to_lowercase(), a.address.as_str()).cmp(&(
                b.address.chain(),
                b.label.to_lowercase(),
                b.address.as_str(),
            ))
        });
        let file = BookFile {
            entries: entries
                .into_iter()
                .map(|e| RawEntry {
                    chain: e.address.chain(),
                    address: e.address.as_str().to_owned(),
                    label: e.label.clone(),
                    owner: e.owner,
                    note: e.note.clone(),
                    added_at: e.added_at,
                    source: e.source.clone(),
                })
                .collect(),
        };
        let body = toml::to_string_pretty(&file).expect("book serializes");
        format!("# Kenning address book. Edit freely; `ken ls` checks it.\n\n{body}")
    }

    pub fn save(&self) -> Result<()> {
        self.ensure_writable()?;
        let path = self
            .path
            .as_deref()
            .ok_or_else(|| Error::Invalid("in-memory book has no path".into()))?;
        fsutil::write_atomic(path, self.to_toml().as_bytes())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn addr(s: &str) -> Address {
        chain::parse(s).unwrap()
    }

    #[test]
    fn round_trip_through_toml() {
        let dir = tempdir();
        let path = dir.join("book.toml");
        let mut book = Book::load_personal(&path).unwrap();
        assert!(book.entries().is_empty());
        let mut e = Entry::new(
            addr("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"),
            "Binance",
            Owner::Me,
        );
        e.note = Some("my deposits".into());
        assert!(book.upsert(e).unwrap());
        assert!(
            book.upsert(Entry::new(
                addr("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),
                "USDT",
                Owner::Contact
            ))
            .unwrap()
        );
        book.save().unwrap();

        let again = Book::load_personal(&path).unwrap();
        assert_eq!(again.entries().len(), 2);
        let key = addr("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed").key();
        assert_eq!(again.get(&key).unwrap().note.as_deref(), Some("my deposits"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn upsert_updates_label() {
        let mut book = Book::new("t");
        let a = addr("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
        book.upsert(Entry::new(a.clone(), "old", Owner::Me)).unwrap();
        assert!(!book.upsert(Entry::new(a.clone(), "new", Owner::Contact)).unwrap());
        assert_eq!(book.get(&a.key()).unwrap().label, "new");
        assert_eq!(book.entries().len(), 1);
    }

    #[test]
    fn rejects_invalid_and_duplicate_entries() {
        let p = Path::new("book.toml");
        let bad = "[[entry]]\nchain = \"evm\"\naddress = \"0x1234\"\nlabel = \"x\"\n";
        assert!(matches!(Book::parse(p, bad), Err(Error::Entry { index: 1, .. })));
        let wrong_chain = "[[entry]]\nchain = \"solana\"\naddress = \"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"\nlabel = \"x\"\n";
        assert!(Book::parse(p, wrong_chain).is_err());
        let dup = "[[entry]]\nchain = \"evm\"\naddress = \"0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed\"\nlabel = \"a\"\n\
                   [[entry]]\nchain = \"evm\"\naddress = \"0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed\"\nlabel = \"b\"\n";
        assert!(matches!(Book::parse(p, dup), Err(Error::Entry { index: 2, .. })));
    }

    #[test]
    fn shared_books_are_read_only_and_team_owned() {
        let dir = tempdir();
        let path = dir.join("ops.toml");
        std::fs::write(&path, "[[entry]]\nchain = \"tron\"\naddress = \"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"\nlabel = \"Treasury\"\n").unwrap();
        let mut book = Book::load_shared(&path).unwrap();
        assert_eq!(book.name(), "ops");
        assert_eq!(book.entries()[0].owner, Owner::Team);
        let key = book.entries()[0].address.key();
        assert!(book.remove(&key).is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    pub(crate) fn tempdir() -> PathBuf {
        let n: u64 = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;
        let dir = std::env::temp_dir().join(format!("kenning-test-{n}-{:?}", std::thread::current().id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
}
