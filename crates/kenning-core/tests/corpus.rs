//! Runs every case in `tests/lookalikes/*.toml` at the repository root.

use std::path::PathBuf;

use jiff::Timestamp;
use kenning_core::{Book, Chain, Entry, History, Owner, Recognizer, labels, lookalike::Rules, parse};
use serde::Deserialize;

#[derive(Deserialize)]
struct Corpus {
    #[serde(rename = "case")]
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    name: String,
    #[serde(default)]
    book: Vec<BookEntry>,
    copied: String,
    state: String,
    same_prefix: Option<usize>,
    same_suffix: Option<usize>,
}

#[derive(Deserialize)]
struct BookEntry {
    chain: Chain,
    address: String,
    label: String,
    #[serde(default)]
    owner: Owner,
}

fn corpus_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/lookalikes")
}

#[test]
fn lookalike_corpus() {
    let labels = labels::builtin();
    let now: Timestamp = "2026-10-10T12:00:00Z".parse().unwrap();
    let mut failures = Vec::new();
    let mut count = 0;

    for file in std::fs::read_dir(corpus_dir()).unwrap() {
        let path = file.unwrap().path();
        if path.extension().is_none_or(|e| e != "toml") {
            continue;
        }
        let corpus: Corpus = toml::from_str(&std::fs::read_to_string(&path).unwrap())
            .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        for case in corpus.cases {
            count += 1;
            let mut book = Book::new("personal");
            for e in &case.book {
                let address = kenning_core::chain::parse_on(e.chain, &e.address)
                    .unwrap_or_else(|err| panic!("{}: book address {}: {err}", case.name, e.address));
                book.upsert(Entry::new(address, e.label.clone(), e.owner))
                    .unwrap();
            }
            let mut r = Recognizer::new(Rules::default());
            r.add_book(&book);
            r.add_labels(&labels);

            let copied = match parse(&case.copied) {
                Ok(a) => a,
                Err(e) => {
                    failures.push(format!(
                        "{}: copied {} does not parse: {e}",
                        case.name, case.copied
                    ));
                    continue;
                }
            };
            let got = r.recognize(&copied, &History::in_memory(), now);

            if got.state.as_str() != case.state {
                failures.push(format!(
                    "{}: expected {}, got {} ({})",
                    case.name,
                    case.state,
                    got.state.as_str(),
                    got.detail
                ));
                continue;
            }
            if let Some(m) = &got.lookalike {
                let (p, s) = (m.similarity.same_prefix, m.similarity.same_suffix);
                if case.same_prefix.is_some_and(|x| x != p) || case.same_suffix.is_some_and(|x| x != s) {
                    failures.push(format!(
                        "{}: expected {:?} + {:?}, got {p} + {s}",
                        case.name, case.same_prefix, case.same_suffix
                    ));
                }
            }
        }
    }
    assert!(count > 10, "corpus looks empty");
    assert!(
        failures.is_empty(),
        "{} of {count} cases failed:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
