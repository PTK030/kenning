//! Lookalike detection.
//!
//! Address poisoning works because people check the first and last few
//! characters. An attacker grinds an address whose start and end match one the
//! victim knows. So: two different addresses on the same chain that share
//! enough leading *and* trailing characters are lookalikes.
//!
//! Comparison runs on the address body (after the fixed prefix such as `0x`)
//! and ignores letter case, since a human scanning `7xKX` and `7xkx` will not
//! notice the difference either. The full rules are in `docs/detection-rules.md`.

use serde::{Deserialize, Serialize};

use crate::chain::Address;

/// Thresholds. The defaults are tuned so that false alarms against the large
/// public label set stay rare (see the false-positive estimate in the docs).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Rules {
    /// Minimum matching characters at the start of the body.
    pub min_prefix: usize,
    /// Minimum matching characters at the end of the body.
    pub min_suffix: usize,
    /// Minimum prefix + suffix when the known address is the user's own
    /// (book or history).
    pub min_total_personal: usize,
    /// Minimum prefix + suffix when the known address is a public label.
    pub min_total_public: usize,
}

impl Default for Rules {
    fn default() -> Self {
        Rules {
            min_prefix: 3,
            min_suffix: 3,
            min_total_personal: 7,
            min_total_public: 8,
        }
    }
}

/// How two addresses on the same chain compare, character by character.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Similarity {
    /// Matching characters at the start of the body.
    pub same_prefix: usize,
    /// Matching characters at the end of the body (not overlapping the prefix).
    pub same_suffix: usize,
    /// Characters of the candidate body that differ from the known one.
    pub differing: usize,
    /// Length of the candidate body.
    pub length: usize,
}

impl Similarity {
    pub fn total(&self) -> usize {
        self.same_prefix + self.same_suffix
    }
}

/// Compare the bodies of two addresses, case-insensitively.
pub fn compare(candidate: &Address, known: &Address) -> Similarity {
    let a = candidate.body().as_bytes();
    let b = known.body().as_bytes();
    let eq = |x: u8, y: u8| x.eq_ignore_ascii_case(&y);

    let max = a.len().min(b.len());
    let same_prefix = a.iter().zip(b).take_while(|(x, y)| eq(**x, **y)).count();
    let same_suffix = a
        .iter()
        .rev()
        .zip(b.iter().rev())
        .take(max - same_prefix)
        .take_while(|(x, y)| eq(**x, **y))
        .count();

    // Middle characters can only line up position by position when the
    // bodies have equal length (always true except for Solana).
    let middle_same = if a.len() == b.len() {
        (same_prefix..a.len() - same_suffix)
            .filter(|&i| eq(a[i], b[i]))
            .count()
    } else {
        0
    };

    Similarity {
        same_prefix,
        same_suffix,
        differing: a.len() - same_prefix - same_suffix - middle_same,
        length: a.len(),
    }
}

/// Whether `candidate` is a lookalike of `known` under `rules`.
pub fn is_lookalike(sim: &Similarity, rules: &Rules, public: bool) -> bool {
    let min_total = if public {
        rules.min_total_public
    } else {
        rules.min_total_personal
    };
    sim.differing > 0
        && sim.same_prefix >= rules.min_prefix
        && sim.same_suffix >= rules.min_suffix
        && sim.total() >= min_total
}

/// Key used to find candidates quickly: chain plus the first `min_prefix`
/// characters of the body, lowercased.
pub(crate) fn bucket(address: &Address, rules: &Rules) -> Option<String> {
    let body = address.body();
    body.get(..rules.min_prefix).map(str::to_ascii_lowercase)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::chain::{Chain, parse};

    /// A lowercase EVM address with the given body prefix and suffix, padded
    /// with `fill` in between.
    pub(crate) fn evm(prefix: &str, fill: char, suffix: &str) -> Address {
        let middle: String = std::iter::repeat_n(fill, 40 - prefix.len() - suffix.len()).collect();
        parse(&format!("0x{prefix}{middle}{suffix}")).unwrap()
    }

    const BINANCE_14: &str = "0x28C6c06298d514Db089934071355E5743bf21d60";

    #[test]
    fn classic_poisoning_pair() {
        // Same first 6 and last 4 hex characters, everything else different.
        let known = parse(BINANCE_14).unwrap();
        let fake = evm("28c6c0", 'a', "1d60");
        let sim = compare(&fake, &known);
        assert_eq!((sim.same_prefix, sim.same_suffix), (6, 4));
        assert!(sim.differing >= 28);
        assert!(is_lookalike(&sim, &Rules::default(), false));
        assert!(is_lookalike(&sim, &Rules::default(), true));
    }

    #[test]
    fn identical_is_not_a_lookalike() {
        let a = parse(BINANCE_14).unwrap();
        let sim = compare(&a, &a);
        assert_eq!(sim.differing, 0);
        assert!(!is_lookalike(&sim, &Rules::default(), false));
    }

    #[test]
    fn short_match_is_not_enough() {
        let known = parse(BINANCE_14).unwrap();
        let other = evm("28c", '0', "1d61");
        let sim = compare(&other, &known);
        assert_eq!((sim.same_prefix, sim.same_suffix), (3, 0));
        assert!(!is_lookalike(&sim, &Rules::default(), false));
    }

    #[test]
    fn public_labels_need_a_longer_match() {
        let known = parse(BINANCE_14).unwrap();
        let fake = evm("28c", '0', "1d60");
        let sim = compare(&fake, &known);
        assert_eq!((sim.same_prefix, sim.same_suffix), (3, 4));
        assert!(is_lookalike(&sim, &Rules::default(), false));
        assert!(!is_lookalike(&sim, &Rules::default(), true));
    }

    #[test]
    fn solana_ignores_case_and_handles_length() {
        let known = parse("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").unwrap();
        // Case-flipped start, different middle, same end, one char shorter.
        // Built directly: grinding a real key is not the point of this test.
        let fake = Address::new(
            Chain::Solana,
            "EPJfWdcjkx7z1C6oZz4fG2D4tq8Lr9kyLY9WTDt1v".into(),
            0,
        );
        let sim = compare(&fake, &known);
        assert_eq!(sim.same_prefix, 6);
        assert_eq!(sim.same_suffix, 5);
        assert_eq!(sim.differing, fake.body().len() - 11);
        assert!(is_lookalike(&sim, &Rules::default(), false));
    }
}
