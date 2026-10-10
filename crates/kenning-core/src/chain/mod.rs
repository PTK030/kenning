//! Address parsing and canonical forms for every supported chain.
//!
//! Each chain module exposes `parse(&str) -> Result<Address, ParseError>`. The
//! top-level [`parse`] tries them in an order that cannot produce ambiguity:
//! the formats differ in prefix, alphabet or decoded byte length.

mod bitcoin;
mod evm;
mod solana;
mod tron;

use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Chain {
    Evm,
    Solana,
    Bitcoin,
    Tron,
}

impl Chain {
    pub const ALL: [Chain; 4] = [Chain::Evm, Chain::Solana, Chain::Bitcoin, Chain::Tron];

    pub fn as_str(self) -> &'static str {
        match self {
            Chain::Evm => "evm",
            Chain::Solana => "solana",
            Chain::Bitcoin => "bitcoin",
            Chain::Tron => "tron",
        }
    }

    /// Human name for UI copy.
    pub fn display_name(self) -> &'static str {
        match self {
            Chain::Evm => "EVM",
            Chain::Solana => "Solana",
            Chain::Bitcoin => "Bitcoin",
            Chain::Tron => "Tron",
        }
    }

    /// Whether two addresses on this chain that differ only in letter case
    /// are the same address.
    pub fn case_insensitive(self) -> bool {
        matches!(self, Chain::Evm)
    }
}

impl fmt::Display for Chain {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for Chain {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "evm" | "eth" | "ethereum" => Ok(Chain::Evm),
            "solana" | "sol" => Ok(Chain::Solana),
            "bitcoin" | "btc" => Ok(Chain::Bitcoin),
            "tron" | "trx" => Ok(Chain::Tron),
            other => Err(format!(
                "unknown chain `{other}` (expected evm, solana, bitcoin or tron)"
            )),
        }
    }
}

/// A validated address in its canonical text form.
///
/// * EVM: EIP-55 mixed-case checksum form.
/// * Bitcoin bech32/bech32m: lowercase.
/// * Base58 formats (Solana, Tron, legacy Bitcoin): unchanged, they are case-sensitive.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Address {
    chain: Chain,
    text: String,
    /// Length of the fixed prefix every address of this kind starts with
    /// (`0x`, `T`, `bc1q`...). Comparisons for lookalikes skip it, because an
    /// attacker gets it for free.
    #[serde(skip)]
    fixed: usize,
}

impl Address {
    pub(crate) fn new(chain: Chain, text: String, fixed: usize) -> Self {
        Address { chain, text, fixed }
    }

    pub fn chain(&self) -> Chain {
        self.chain
    }

    pub fn as_str(&self) -> &str {
        &self.text
    }

    /// The part of the address an attacker has to grind: everything after the
    /// fixed prefix.
    pub fn body(&self) -> &str {
        &self.text[self.fixed..]
    }

    pub fn fixed_prefix(&self) -> &str {
        &self.text[..self.fixed]
    }

    /// Key for exact-match lookups. Case-folded only where the chain treats
    /// case as insignificant.
    pub fn key(&self) -> AddressKey {
        let text = if self.chain.case_insensitive() {
            self.text.to_ascii_lowercase()
        } else {
            self.text.clone()
        };
        AddressKey {
            chain: self.chain,
            text,
        }
    }

    /// The address split into groups of 4 characters after the fixed prefix,
    /// e.g. `0x 5aAe b605 3F3E ...`.
    pub fn grouped(&self) -> String {
        let mut out = String::with_capacity(self.text.len() + self.text.len() / 4 + 1);
        out.push_str(self.fixed_prefix());
        for (i, ch) in self.body().chars().enumerate() {
            if i % 4 == 0 && !out.is_empty() {
                out.push(' ');
            }
            out.push(ch);
        }
        out
    }

    /// Shortened form for compact UI: first 6 and last 4 characters of the body.
    pub fn short(&self) -> String {
        let body = self.body();
        if body.len() <= 12 {
            return self.text.clone();
        }
        format!(
            "{}{}…{}",
            self.fixed_prefix(),
            &body[..6],
            &body[body.len() - 4..]
        )
    }
}

impl fmt::Display for Address {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.text)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AddressKey {
    pub chain: Chain,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ParseError {
    #[error("not a recognised address")]
    NotAnAddress,
    #[error("{chain} address has an invalid checksum")]
    BadChecksum { chain: Chain },
}

/// Parse a single address. Surrounding whitespace is ignored.
pub fn parse(input: &str) -> Result<Address, ParseError> {
    let s = input.trim();
    if s.len() < 25 || s.len() > 90 || !s.is_ascii() {
        return Err(ParseError::NotAnAddress);
    }
    let lower_prefix = s.get(..4).map(str::to_ascii_lowercase).unwrap_or_default();
    if lower_prefix.starts_with("0x") {
        return evm::parse(s);
    }
    if lower_prefix.starts_with("bc1") || lower_prefix.starts_with("tb1") || lower_prefix == "bcrt" {
        return bitcoin::parse_segwit(s);
    }
    if s.starts_with('T') && s.len() == 34 {
        // Could still be Solana in theory; base58check settles it.
        match tron::parse(s) {
            Ok(a) => return Ok(a),
            Err(ParseError::BadChecksum { .. }) => {
                if let Ok(a) = solana::parse(s) {
                    return Ok(a);
                }
                return Err(ParseError::BadChecksum { chain: Chain::Tron });
            }
            Err(ParseError::NotAnAddress) => {}
        }
    }
    match bitcoin::parse_base58(s) {
        Ok(a) => Ok(a),
        Err(btc_err) => solana::parse(s).map_err(|_| btc_err),
    }
}

/// Parse an address that must belong to `chain`.
pub fn parse_on(chain: Chain, input: &str) -> Result<Address, ParseError> {
    let a = parse(input)?;
    if a.chain() == chain {
        Ok(a)
    } else {
        Err(ParseError::NotAnAddress)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatches_each_chain() {
        let cases = [
            ("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", Chain::Evm),
            ("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", Chain::Solana),
            ("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", Chain::Bitcoin),
            (
                "bc1py3m7vwnghyne9gnvcjw82j7gqt2rafgdmlmwmqnn3hvcmdm09rjqcgrtxs",
                Chain::Bitcoin,
            ),
            ("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", Chain::Tron),
        ];
        for (s, chain) in cases {
            let a = parse(s).unwrap_or_else(|e| panic!("{s}: {e}"));
            assert_eq!(a.chain(), chain, "{s}");
            assert_eq!(a.as_str(), s);
        }
    }

    #[test]
    fn rejects_noise() {
        for s in [
            "",
            "hello",
            "0x1234",
            "not an address at all, really not",
            "🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂",
        ] {
            assert!(parse(s).is_err(), "{s}");
        }
    }

    #[test]
    fn grouped_and_short() {
        let a = parse("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed").unwrap();
        assert_eq!(
            a.grouped(),
            "0x 5aAe b605 3F3E 94C9 b9A0 9f33 6694 35E7 Ef1B eAed"
        );
        assert_eq!(a.short(), "0x5aAeb6…eAed");
        assert_eq!(a.body().len(), 40);
    }
}
