//! Recognition: decide what a copied address is.
//!
//! Order of precedence:
//! 1. exact match in a book (yours, your team's, a contact) or a public label;
//! 2. lookalike of anything known (book, public label, earlier contact);
//! 3. seen before (in history, no label);
//! 4. new.
//!
//! An exact book entry wins over a lookalike so that "This is mine" sticks
//! forever, as the brief requires.

use std::collections::HashMap;

use jiff::Timestamp;
use serde::Serialize;

use crate::book::{Book, Owner};
use crate::chain::{Address, AddressKey, Chain};
use crate::diff::{self, Span};
use crate::history::{Contact, History};
use crate::labels::{Label, LabelKind};
use crate::lookalike::{self, Rules, Similarity};
use crate::message;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum State {
    Mine,
    Team,
    Contact,
    Public,
    Lookalike,
    Seen,
    New,
}

impl State {
    pub fn as_str(self) -> &'static str {
        match self {
            State::Mine => "mine",
            State::Team => "team",
            State::Contact => "contact",
            State::Public => "public",
            State::Lookalike => "lookalike",
            State::Seen => "seen",
            State::New => "new",
        }
    }

    /// Process exit code convention for the CLI: 0 known, 10 unknown, 20 lookalike.
    pub fn exit_code(self) -> i32 {
        match self {
            State::Mine | State::Team | State::Contact | State::Public => 0,
            State::Seen | State::New => 10,
            State::Lookalike => 20,
        }
    }
}

/// Where a known address comes from. Declaration order is precedence when the
/// same address is known from several places.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum KnownKind {
    Mine,
    Team,
    Contact,
    Public,
    History,
}

impl From<Owner> for KnownKind {
    fn from(o: Owner) -> Self {
        match o {
            Owner::Me => KnownKind::Mine,
            Owner::Team => KnownKind::Team,
            Owner::Contact => KnownKind::Contact,
        }
    }
}

#[derive(Clone, Debug)]
struct Known {
    address: Address,
    kind: KnownKind,
    label: Option<String>,
    note: Option<String>,
    /// Book name for book entries, URL for public labels.
    source: Option<String>,
    label_kind: Option<LabelKind>,
    last_seen: Option<Timestamp>,
}

#[derive(Clone, Debug, Serialize)]
pub struct LookalikeMatch {
    pub known: Address,
    /// `known` in groups of 4, like [`Recognition::grouped`].
    pub known_grouped: String,
    pub known_kind: KnownKind,
    pub known_label: Option<String>,
    pub known_last_seen: Option<Timestamp>,
    pub similarity: Similarity,
    /// The copied address, split into matching / differing runs.
    pub candidate_spans: Vec<Span>,
    /// The known address, split the same way.
    pub known_spans: Vec<Span>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Recognition {
    pub address: Address,
    pub grouped: String,
    pub state: State,
    pub label: Option<String>,
    pub note: Option<String>,
    pub source: Option<String>,
    pub label_kind: Option<LabelKind>,
    /// Earlier contact with this exact address, before this copy.
    pub history: Option<Contact>,
    /// Best lookalike match, if any.
    pub lookalike: Option<LookalikeMatch>,
    /// How many other known addresses it also resembles.
    pub more_lookalikes: usize,
    /// One-line UI copy, e.g. "Binance".
    pub headline: String,
    /// Second line, e.g. "my deposits · copied 14× · last 3 days ago".
    pub detail: String,
}

#[derive(Clone, Debug, Default)]
pub struct Recognizer {
    rules: Rules,
    known: Vec<Known>,
    exact: HashMap<AddressKey, usize>,
    buckets: HashMap<(Chain, String), Vec<usize>>,
}

impl Recognizer {
    pub fn new(rules: Rules) -> Self {
        Recognizer {
            rules,
            ..Default::default()
        }
    }

    pub fn rules(&self) -> &Rules {
        &self.rules
    }

    pub fn len(&self) -> usize {
        self.known.len()
    }

    pub fn is_empty(&self) -> bool {
        self.known.is_empty()
    }

    fn insert(&mut self, k: Known) {
        let key = k.address.key();
        if let Some(&i) = self.exact.get(&key) {
            if k.kind < self.known[i].kind {
                self.known[i] = k;
            }
            return;
        }
        let i = self.known.len();
        if let Some(b) = lookalike::bucket(&k.address, &self.rules) {
            self.buckets.entry((k.address.chain(), b)).or_default().push(i);
        }
        self.exact.insert(key, i);
        self.known.push(k);
    }

    pub fn add_book(&mut self, book: &Book) {
        for e in book.entries() {
            self.insert(Known {
                address: e.address.clone(),
                kind: e.owner.into(),
                label: Some(e.label.clone()),
                note: e.note.clone(),
                source: Some(book.name().to_owned()),
                label_kind: None,
                last_seen: None,
            });
        }
    }

    pub fn add_labels(&mut self, labels: &[Label]) {
        for l in labels {
            self.insert(Known {
                address: l.address.clone(),
                kind: KnownKind::Public,
                label: Some(l.name.clone()),
                note: None,
                source: Some(l.source.clone()),
                label_kind: Some(l.kind),
                last_seen: None,
            });
        }
    }

    /// Earlier contacts count as known for lookalike purposes, unless they
    /// were lookalikes themselves.
    pub fn add_contact(&mut self, c: &Contact) {
        if c.flagged {
            return;
        }
        self.insert(Known {
            address: c.address.clone(),
            kind: KnownKind::History,
            label: None,
            note: None,
            source: None,
            label_kind: None,
            last_seen: Some(c.last_seen),
        });
    }

    pub fn add_history(&mut self, history: &History) {
        for c in history.contacts() {
            self.add_contact(c);
        }
    }

    /// All lookalike matches for `address`, best first.
    pub fn lookalikes(&self, address: &Address) -> Vec<LookalikeMatch> {
        let key = address.key();
        let Some(b) = lookalike::bucket(address, &self.rules) else {
            return Vec::new();
        };
        let Some(ids) = self.buckets.get(&(address.chain(), b)) else {
            return Vec::new();
        };
        let mut out: Vec<(KnownKind, LookalikeMatch)> = ids
            .iter()
            .map(|&i| &self.known[i])
            .filter(|k| k.address.key() != key)
            .filter_map(|k| {
                let sim = lookalike::compare(address, &k.address);
                lookalike::is_lookalike(&sim, &self.rules, k.kind == KnownKind::Public).then(|| {
                    // Spans for the known side use its own comparison so
                    // suffix runs line up from its end.
                    let back = lookalike::compare(&k.address, address);
                    (
                        k.kind,
                        LookalikeMatch {
                            known: k.address.clone(),
                            known_grouped: k.address.grouped(),
                            known_kind: k.kind,
                            known_label: k.label.clone(),
                            known_last_seen: k.last_seen,
                            similarity: sim,
                            candidate_spans: diff::spans(address, &k.address, &sim),
                            known_spans: diff::spans(&k.address, address, &back),
                        },
                    )
                })
            })
            .collect();
        out.sort_by(|(ka, a), (kb, b)| b.similarity.total().cmp(&a.similarity.total()).then(ka.cmp(kb)));
        out.into_iter().map(|(_, m)| m).collect()
    }

    /// Recognise `address`. `history` supplies contact stats; it is not
    /// modified (recording a copy is the caller's choice).
    pub fn recognize(&self, address: &Address, history: &History, now: Timestamp) -> Recognition {
        let key = address.key();
        let contact = history.get(&key).cloned();
        let exact = self
            .exact
            .get(&key)
            .map(|&i| &self.known[i])
            .filter(|k| k.kind != KnownKind::History);

        let mut r = Recognition {
            address: address.clone(),
            grouped: address.grouped(),
            state: State::New,
            label: None,
            note: None,
            source: None,
            label_kind: None,
            history: contact,
            lookalike: None,
            more_lookalikes: 0,
            headline: String::new(),
            detail: String::new(),
        };

        if let Some(k) = exact {
            r.state = match k.kind {
                KnownKind::Mine => State::Mine,
                KnownKind::Team => State::Team,
                KnownKind::Contact => State::Contact,
                KnownKind::Public | KnownKind::History => State::Public,
            };
            r.label = k.label.clone();
            r.note = k.note.clone();
            r.source = k.source.clone();
            r.label_kind = k.label_kind;
        } else {
            let mut matches = self.lookalikes(address).into_iter();
            if let Some(best) = matches.next() {
                r.state = State::Lookalike;
                r.lookalike = Some(best);
                r.more_lookalikes = matches.count();
            } else if r.history.is_some() {
                r.state = State::Seen;
            }
        }

        let (headline, detail) = message::describe(&r, now);
        r.headline = headline;
        r.detail = detail;
        r
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book::Entry;
    use crate::chain::parse;
    use crate::lookalike::tests::evm;

    const BINANCE_14: &str = "0x28C6c06298d514Db089934071355E5743bf21d60";

    fn setup() -> (Recognizer, History) {
        let mut book = Book::new("personal");
        let mut e = Entry::new(parse(BINANCE_14).unwrap(), "Binance", Owner::Me);
        e.note = Some("my deposits".into());
        book.upsert(e).unwrap();
        let mut r = Recognizer::new(Rules::default());
        r.add_book(&book);
        r.add_labels(&crate::labels::builtin());
        (r, History::in_memory())
    }

    fn now() -> Timestamp {
        "2026-10-10T12:00:00Z".parse().unwrap()
    }

    #[test]
    fn own_address_beats_public_label() {
        let (r, h) = setup();
        let rec = r.recognize(&parse(BINANCE_14).unwrap(), &h, now());
        assert_eq!(rec.state, State::Mine);
        assert_eq!(rec.headline, "Binance");
        assert_eq!(rec.detail, "my deposits · in your book");
    }

    #[test]
    fn public_label() {
        let (r, h) = setup();
        let rec = r.recognize(
            &parse("0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45").unwrap(),
            &h,
            now(),
        );
        assert_eq!(rec.state, State::Public);
        assert_eq!(rec.headline, "Uniswap V3: Router 2");
    }

    #[test]
    fn lookalike_of_own_address() {
        let (r, h) = setup();
        let rec = r.recognize(&evm("28c6c0", 'a', "1d60"), &h, now());
        assert_eq!(rec.state, State::Lookalike);
        let m = rec.lookalike.as_ref().unwrap();
        assert_eq!(m.known_kind, KnownKind::Mine);
        assert_eq!(rec.headline, "This is not your Binance address.");
        assert!(
            rec.detail.starts_with("Matches 6 + 4 characters,"),
            "{}",
            rec.detail
        );
    }

    #[test]
    fn marking_a_lookalike_as_mine_sticks() {
        let (mut r, h) = setup();
        let fake = evm("28c6c0", 'a', "1d60");
        let mut book = Book::new("personal");
        book.upsert(Entry::new(fake.clone(), "My vanity", Owner::Me))
            .unwrap();
        r.add_book(&book);
        assert_eq!(r.recognize(&fake, &h, now()).state, State::Mine);
    }

    #[test]
    fn seen_then_lookalike_of_history() {
        let (mut r, mut h) = setup();
        let friend = evm("abcdef", '1', "9876");
        assert_eq!(r.recognize(&friend, &h, now()).state, State::New);
        h.record(&friend, "2026-10-07T12:00:00Z".parse().unwrap(), false);
        r.add_history(&h);
        let again = r.recognize(&friend, &h, now());
        assert_eq!(again.state, State::Seen);

        let fake = evm("abcdef", '2', "9876");
        let rec = r.recognize(&fake, &h, now());
        assert_eq!(rec.state, State::Lookalike);
        assert_eq!(rec.headline, "This is not the address you copied 3 days ago.");
    }

    #[test]
    fn flagged_contacts_are_not_references() {
        let (mut r, mut h) = setup();
        let fake = evm("abcdef", '2', "9876");
        h.record(&fake, now(), true);
        r.add_history(&h);
        let other = evm("abcdef", '3', "9876");
        assert_eq!(r.recognize(&other, &h, now()).state, State::New);
    }
}
