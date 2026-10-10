//! Character-level comparison for display: which characters of an address
//! match the address it resembles.

use serde::Serialize;

use crate::chain::Address;
use crate::lookalike::Similarity;

/// A run of characters that either match the other address or differ.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Span {
    pub text: String,
    pub same: bool,
}

/// Split `address` into runs of matching and differing characters relative to
/// `other`, consistent with [`crate::lookalike::compare`]. The fixed prefix
/// always counts as matching.
pub fn spans(address: &Address, other: &Address, sim: &Similarity) -> Vec<Span> {
    let body = address.body().as_bytes();
    let other_body = other.body().as_bytes();
    let same_len = body.len() == other_body.len();
    let suffix_start = body.len() - sim.same_suffix;

    let mut flags = Vec::with_capacity(body.len());
    for (i, &c) in body.iter().enumerate() {
        let same =
            i < sim.same_prefix || i >= suffix_start || (same_len && c.eq_ignore_ascii_case(&other_body[i]));
        flags.push(same);
    }

    let mut out = Vec::new();
    if !address.fixed_prefix().is_empty() {
        out.push(Span {
            text: address.fixed_prefix().to_owned(),
            same: true,
        });
    }
    for (i, &c) in body.iter().enumerate() {
        match out.last_mut() {
            Some(last) if last.same == flags[i] => last.text.push(c as char),
            _ => out.push(Span {
                text: (c as char).to_string(),
                same: flags[i],
            }),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chain::parse;
    use crate::lookalike::compare;
    use crate::lookalike::tests::evm;

    #[test]
    fn spans_cover_the_whole_address() {
        let known = parse("0x28C6c06298d514Db089934071355E5743bf21d60").unwrap();
        let fake = evm("28c6c0", 'a', "1d60");
        let sim = compare(&fake, &known);
        let s = spans(&fake, &known, &sim);
        let joined: String = s.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(joined, fake.as_str());
        assert!(s.first().unwrap().same);
        assert!(s.last().unwrap().same);
        assert!(s.iter().any(|s| !s.same));
    }
}
