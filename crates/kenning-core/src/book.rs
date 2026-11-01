//! The address book: `book.toml`, human-editable and friendly to git.
//!
//! ```toml
//! [[entry]]
//! chain = "evm"
//! address = "0x28C6c06298d514Db089934071355E5743bf21d60"
//! label = "Binance"
//! note = "my deposits"
//! owner = "me"
//! emoji = "🏦"
//! tint = "blue"
//! group = "Exchanges"
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
    /// A picture of the user's choosing, shown beside the name.
    pub emoji: Option<String>,
    /// The background of the picture's tile, one of [`TINTS`]; none means
    /// the app chooses one to suit the picture.
    pub tint: Option<String>,
    /// The user's own grouping in the book, e.g. "Exchanges".
    pub group: Option<String>,
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
            emoji: None,
            tint: None,
            group: None,
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
    emoji: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    tint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    group: Option<String>,
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
            let emoji = check_emoji(raw.emoji).map_err(|e| entry_err(e.to_string()))?;
            let tint = check_tint(raw.tint).map_err(|e| entry_err(e.to_string()))?;
            let group = check_group(raw.group).map_err(|e| entry_err(e.to_string()))?;
            entries.push(Entry {
                address,
                label: raw.label,
                owner: raw.owner,
                note: raw.note,
                emoji,
                tint,
                group,
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
    pub fn upsert(&mut self, mut entry: Entry) -> Result<bool> {
        self.ensure_writable()?;
        if entry.label.trim().is_empty() {
            return Err(Error::Invalid("label must not be empty".into()));
        }
        entry.emoji = check_emoji(entry.emoji)?;
        entry.tint = check_tint(entry.tint)?;
        entry.group = check_group(entry.group)?;
        let key = entry.address.key();
        if let Some(existing) = self.entries.iter_mut().find(|e| e.address.key() == key) {
            existing.label = entry.label;
            existing.owner = entry.owner;
            // An import knows nothing of notes, pictures or groups: it keeps them.
            if entry.note.is_some() {
                existing.note = entry.note;
            }
            if entry.emoji.is_some() {
                existing.emoji = entry.emoji;
            }
            if entry.tint.is_some() {
                existing.tint = entry.tint;
            }
            if entry.group.is_some() {
                existing.group = entry.group;
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

    /// Change what the user wrote about an address, exactly: an empty note,
    /// picture or group clears it. The address itself never changes here.
    pub fn edit(&mut self, key: &AddressKey, edit: Edit) -> Result<&Entry> {
        self.ensure_writable()?;
        let label = edit.label.trim();
        if label.is_empty() {
            return Err(Error::Invalid("label must not be empty".into()));
        }
        let emoji = check_emoji(edit.emoji)?;
        let tint = check_tint(edit.tint)?;
        let group = check_group(edit.group)?;
        let e = self
            .entries
            .iter_mut()
            .find(|e| &e.address.key() == key)
            .ok_or_else(|| Error::Invalid("that address is not in the book".into()))?;
        e.label = label.to_owned();
        e.owner = edit.owner;
        e.note = edit.note.map(|n| n.trim().to_owned()).filter(|n| !n.is_empty());
        e.emoji = emoji;
        e.tint = tint;
        e.group = group;
        Ok(e)
    }

    /// Move every entry of group `from` to `to`, or out of any group when
    /// `to` is empty. Returns how many entries moved.
    pub fn rename_group(&mut self, from: &str, to: &str) -> Result<usize> {
        self.ensure_writable()?;
        let to = check_group(Some(to.to_owned()))?;
        let mut moved = 0;
        for e in &mut self.entries {
            if e.group.as_deref() == Some(from) {
                e.group = to.clone();
                moved += 1;
            }
        }
        Ok(moved)
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
                    emoji: e.emoji.clone(),
                    tint: e.tint.clone(),
                    group: e.group.clone(),
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

/// What the user can change about an entry (and writes when adding one).
#[derive(Clone, Debug, Deserialize)]
pub struct Edit {
    pub label: String,
    pub owner: Owner,
    pub note: Option<String>,
    pub emoji: Option<String>,
    pub tint: Option<String>,
    pub group: Option<String>,
}

/// The tile backgrounds the app draws (the --tint-* colours in its tokens).
pub const TINTS: &[&str] = &[
    "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray", "mist", "slate", "snow", "night",
];

fn check_tint(tint: Option<String>) -> Result<Option<String>> {
    let Some(t) = tint.map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty()) else {
        return Ok(None);
    };
    if !TINTS.contains(&t.as_str()) {
        return Err(Error::Invalid(format!("`{t}` is not a tint (expected one of {})", TINTS.join(", "))));
    }
    Ok(Some(t))
}

/// A picture is one emoji, perhaps a few code points joined; never a sentence.
fn check_emoji(emoji: Option<String>) -> Result<Option<String>> {
    let Some(e) = emoji.map(|e| e.trim().to_owned()).filter(|e| !e.is_empty()) else {
        return Ok(None);
    };
    if e.chars().count() > 8 || e.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(Error::Invalid(format!("`{e}` is not one emoji")));
    }
    Ok(Some(e))
}

fn check_group(group: Option<String>) -> Result<Option<String>> {
    let Some(g) = group.map(|g| g.trim().to_owned()).filter(|g| !g.is_empty()) else {
        return Ok(None);
    };
    if g.chars().count() > 40 {
        return Err(Error::Invalid("a group name is at most 40 characters".into()));
    }
    Ok(Some(g))
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
    fn emoji_and_group_round_trip_and_survive_an_import() {
        let dir = tempdir();
        let path = dir.join("book.toml");
        let mut book = Book::load_personal(&path).unwrap();
        let a = addr("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
        let mut e = Entry::new(a.clone(), "Binance", Owner::Me);
        e.emoji = Some("🏦".into());
        e.group = Some(" Exchanges ".into());
        book.upsert(e).unwrap();
        // A later import of the same address names it, nothing more.
        book.upsert(Entry::new(a.clone(), "Binance hot", Owner::Me)).unwrap();
        book.save().unwrap();
        assert!(book.to_toml().contains("emoji = \"🏦\""));

        let again = Book::load_personal(&path).unwrap();
        let got = again.get(&a.key()).unwrap();
        assert_eq!(got.label, "Binance hot");
        assert_eq!(got.emoji.as_deref(), Some("🏦"));
        assert_eq!(got.group.as_deref(), Some("Exchanges"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn edit_sets_exactly_and_clears() {
        let mut book = Book::new("t");
        let a = addr("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
        let mut e = Entry::new(a.clone(), "old", Owner::Me);
        e.note = Some("n".into());
        e.emoji = Some("🔥".into());
        e.group = Some("Hot".into());
        book.upsert(e).unwrap();
        let edit = |label: &str, emoji: Option<&str>| Edit {
            label: label.into(),
            owner: Owner::Contact,
            note: Some("  ".into()),
            emoji: emoji.map(Into::into),
            tint: None,
            group: None,
        };
        let got = book.edit(&a.key(), edit(" new ", None)).unwrap();
        assert_eq!(got.label, "new");
        assert_eq!(got.owner, Owner::Contact);
        assert_eq!((&got.note, &got.emoji, &got.group), (&None, &None, &None));
        assert!(book.edit(&a.key(), edit(" ", None)).is_err());
        assert!(book.edit(&a.key(), edit("x", Some("a whole sentence"))).is_err());
        assert!(book.edit(&a.key(), edit("x", Some("👨‍👩‍👧"))).is_ok());
        let other = addr("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
        assert!(book.edit(&other.key(), edit("x", None)).is_err());
    }

    #[test]
    fn rename_group_moves_every_member() {
        let mut book = Book::new("t");
        for (a, g) in [
            ("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", Some("Hot")),
            ("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", Some("Hot")),
            ("0x28C6c06298d514Db089934071355E5743bf21d60", None),
        ] {
            let mut e = Entry::new(addr(a), "x", Owner::Me);
            e.group = g.map(Into::into);
            book.upsert(e).unwrap();
        }
        assert_eq!(book.rename_group("Hot", "Spending").unwrap(), 2);
        let in_spending = book.entries().iter().filter(|e| e.group.as_deref() == Some("Spending"));
        assert_eq!(in_spending.count(), 2);
        assert_eq!(book.rename_group("Spending", "").unwrap(), 2);
        assert!(book.entries().iter().all(|e| e.group.is_none()));
    }

    #[test]
    fn tint_is_one_of_the_palette() {
        let mut book = Book::new("t");
        let a = addr("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
        let mut e = Entry::new(a.clone(), "x", Owner::Me);
        e.tint = Some(" Blue ".into());
        book.upsert(e).unwrap();
        assert_eq!(book.get(&a.key()).unwrap().tint.as_deref(), Some("blue"));
        let mut e = Entry::new(a, "x", Owner::Me);
        e.tint = Some("#ff0000".into());
        assert!(book.upsert(e).is_err());
    }

    #[test]
    fn rejects_a_sentence_for_an_emoji() {
        let p = Path::new("book.toml");
        let bad = "[[entry]]\nchain = \"tron\"\naddress = \"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"\nlabel = \"x\"\nemoji = \"far too long\"\n";
        assert!(matches!(Book::parse(p, bad), Err(Error::Entry { index: 1, .. })));
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
