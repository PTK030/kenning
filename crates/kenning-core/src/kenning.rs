//! `Kenning`: everything loaded from the user's Kenning directory, with the
//! operations the CLI and the desktop app share.
//!
//! Layout of the directory (`~/.kenning`, or `KENNING_HOME`):
//!
//! * `book.toml`     – the personal book
//! * `config.toml`   – settings
//! * `history.json`  – contact history (validated addresses only)
//! * `journal.jsonl` – verification journal

use std::path::{Path, PathBuf};

use jiff::Timestamp;

use crate::book::{Book, Entry, Owner};
use crate::chain::{Address, AddressKey};
use crate::classify::{Recognition, Recognizer, State};
use crate::config::Config;
use crate::error::{Error, Result};
use crate::history::History;
use crate::journal::{self, Action};
use crate::labels::{self, Label};

/// The Kenning directory: `KENNING_HOME` if set, else `~/.kenning`.
pub fn default_home() -> Result<PathBuf> {
    if let Some(dir) = std::env::var_os("KENNING_HOME").filter(|v| !v.is_empty()) {
        return Ok(PathBuf::from(dir));
    }
    directories::BaseDirs::new()
        .map(|d| d.home_dir().join(".kenning"))
        .ok_or(Error::NoHome)
}

pub struct Kenning {
    home: PathBuf,
    config: Config,
    personal: Book,
    shared: Vec<Book>,
    history: History,
    labels: Vec<Label>,
    recognizer: Recognizer,
    warnings: Vec<String>,
}

impl Kenning {
    pub fn open() -> Result<Self> {
        Self::open_at(default_home()?)
    }

    pub fn open_at(home: PathBuf) -> Result<Self> {
        let config = Config::load(&home.join("config.toml"))?;
        let personal = Book::load_personal(&home.join("book.toml"))?;
        let mut warnings = Vec::new();
        let mut shared = Vec::new();
        for path in &config.books {
            let path = expand_home(path);
            match Book::load_shared(&path) {
                Ok(b) => shared.push(b),
                Err(e) => warnings.push(format!("shared book skipped: {e}")),
            }
        }
        let history = if config.history {
            match History::load(&home.join("history.json")) {
                Ok(h) => h,
                Err(e) => {
                    warnings.push(format!("history ignored: {e}"));
                    History::in_memory()
                }
            }
        } else {
            History::in_memory()
        };
        let mut k = Kenning {
            home,
            config,
            personal,
            shared,
            history,
            labels: labels::builtin(),
            recognizer: Recognizer::default(),
            warnings,
        };
        k.rebuild();
        Ok(k)
    }

    /// Rebuild the recognition index after books, labels or rules change.
    pub fn rebuild(&mut self) {
        let mut r = Recognizer::new(self.config.lookalike);
        r.add_book(&self.personal);
        for b in &self.shared {
            r.add_book(b);
        }
        r.add_labels(&self.labels);
        r.add_history(&self.history);
        self.recognizer = r;
    }

    pub fn home(&self) -> &Path {
        &self.home
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    pub fn personal(&self) -> &Book {
        &self.personal
    }

    pub fn shared(&self) -> &[Book] {
        &self.shared
    }

    pub fn history(&self) -> &History {
        &self.history
    }

    pub fn labels(&self) -> &[Label] {
        &self.labels
    }

    /// Problems found while loading that did not stop Kenning from working.
    pub fn warnings(&self) -> &[String] {
        &self.warnings
    }

    pub fn journal_path(&self) -> PathBuf {
        self.home.join("journal.jsonl")
    }

    pub fn book_path(&self) -> PathBuf {
        self.home.join("book.toml")
    }

    /// Recognise without recording anything.
    pub fn recognize(&self, address: &Address) -> Recognition {
        self.recognizer
            .recognize(address, &self.history, Timestamp::now())
    }

    /// Recognise a copied address and record the contact in history.
    /// Lookalikes are written to the journal.
    pub fn observe(&mut self, address: &Address) -> Result<Recognition> {
        let r = self.recognize(address);
        if self.config.history {
            let contact = self
                .history
                .record(address, Timestamp::now(), r.state == State::Lookalike)
                .clone();
            self.recognizer.add_contact(&contact);
            self.history.save()?;
        }
        if r.state == State::Lookalike {
            self.journal(Action::LookalikeShown, &r)?;
        }
        Ok(r)
    }

    /// Append a journal record about `r`, if the journal is enabled.
    pub fn journal(&self, action: Action, r: &Recognition) -> Result<()> {
        if !self.config.journal {
            return Ok(());
        }
        journal::append(
            &self.journal_path(),
            &journal::Record {
                at: Timestamp::now(),
                user: journal::current_user(),
                action,
                chain: r.address.chain(),
                address: r.address.as_str().to_owned(),
                state: r.state.as_str().to_owned(),
                label: r
                    .label
                    .clone()
                    .or_else(|| r.lookalike.as_ref().and_then(|m| m.known_label.clone())),
                related: r.lookalike.as_ref().map(|m| m.known.as_str().to_owned()),
            },
        )
    }

    /// Book entry for `key` in any loaded book, with the book's name.
    pub fn find(&self, key: &AddressKey) -> Option<(&Book, &Entry)> {
        std::iter::once(&self.personal)
            .chain(&self.shared)
            .find_map(|b| b.get(key).map(|e| (b, e)))
    }

    /// Add or update an entry in the personal book and save it.
    pub fn upsert(&mut self, entry: Entry) -> Result<bool> {
        let added = self.personal.upsert(entry)?;
        self.personal.save()?;
        self.rebuild();
        Ok(added)
    }

    /// Add many entries at once (import). Returns how many were new.
    pub fn upsert_many(&mut self, entries: Vec<Entry>) -> Result<usize> {
        let mut added = 0;
        for e in entries {
            if self.personal.upsert(e)? {
                added += 1;
            }
        }
        self.personal.save()?;
        self.rebuild();
        Ok(added)
    }

    pub fn remove(&mut self, key: &AddressKey) -> Result<Option<Entry>> {
        let removed = self.personal.remove(key)?;
        if removed.is_some() {
            self.personal.save()?;
            self.rebuild();
        }
        Ok(removed)
    }

    /// "This is mine": remember a lookalike as the user's own address.
    pub fn mark_mine(&mut self, address: &Address, label: &str) -> Result<()> {
        let before = self.recognize(address);
        let mut e = Entry::new(address.clone(), label, Owner::Me);
        e.source = Some("marked mine".into());
        self.upsert(e)?;
        if self.history.forget(&address.key()) {
            // Re-record it unflagged so it can serve as a reference.
            let c = self.history.record(address, Timestamp::now(), false).clone();
            self.recognizer.add_contact(&c);
            self.history.save()?;
        }
        self.journal(Action::MarkedMine, &before)
    }

    pub fn set_config(&mut self, config: Config) -> Result<()> {
        let rules_changed = config.lookalike != self.config.lookalike;
        let books_changed = config.books != self.config.books;
        config.save(&self.home.join("config.toml"))?;
        self.config = config;
        if books_changed {
            // Reload everything so shared books match the new list.
            let reloaded = Kenning::open_at(self.home.clone())?;
            *self = reloaded;
        } else if rules_changed {
            self.rebuild();
        }
        Ok(())
    }

    pub fn clear_history(&mut self) -> Result<()> {
        self.history.clear();
        self.history.save()?;
        self.rebuild();
        Ok(())
    }
}

fn expand_home(path: &Path) -> PathBuf {
    if let Ok(rest) = path.strip_prefix("~") {
        if let Some(d) = directories::BaseDirs::new() {
            return d.home_dir().join(rest);
        }
    }
    path.to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book::tests::tempdir;
    use crate::chain::parse;
    use crate::lookalike::tests::evm;

    #[test]
    fn end_to_end_in_a_temp_home() {
        let home = tempdir();
        let mut k = Kenning::open_at(home.clone()).unwrap();
        let mine = parse("0x28C6c06298d514Db089934071355E5743bf21d60").unwrap();
        k.upsert(Entry::new(mine.clone(), "Binance", Owner::Me)).unwrap();

        assert_eq!(k.observe(&mine).unwrap().state, State::Mine);
        let fake = evm("28c6c0", 'a', "1d60");
        assert_eq!(k.observe(&fake).unwrap().state, State::Lookalike);
        assert_eq!(journal::read(&k.journal_path()).unwrap().len(), 1);

        // Reopen: book and history persisted.
        let mut k = Kenning::open_at(home.clone()).unwrap();
        let r = k.recognize(&mine);
        assert_eq!(r.history.as_ref().unwrap().count, 1);
        assert_eq!(k.recognize(&fake).state, State::Lookalike);

        k.mark_mine(&fake, "Vanity").unwrap();
        assert_eq!(k.recognize(&fake).state, State::Mine);
        std::fs::remove_dir_all(home).ok();
    }

    #[test]
    fn missing_shared_book_is_a_warning() {
        let home = tempdir();
        std::fs::write(home.join("config.toml"), "books = [\"does-not-exist.toml\"]\n").unwrap();
        let k = Kenning::open_at(home.clone()).unwrap();
        assert_eq!(k.warnings().len(), 1);
        std::fs::remove_dir_all(home).ok();
    }
}
