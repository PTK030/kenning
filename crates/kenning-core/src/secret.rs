//! Secrets that should never sit on a clipboard: a recovery phrase or a
//! private key. Anything that reads the clipboard (clipboard managers,
//! remote-desktop sync, clipper malware) can read them too, so Kenning's
//! clipboard guard warns when one appears. Only the kind is reported; the
//! text itself is never kept.
//!
//! Recognised:
//! * a BIP-39 recovery phrase: 12, 15, 18, 21 or 24 words, every one from the
//!   English word list (`data/bip39-english.txt`, from bitcoin/bips);
//! * a Bitcoin private key in WIF (Base58Check, version 0x80 or 0xEF);
//! * a Solana keypair secret (Base58, 64 bytes; addresses are 32).
//!
//! Hex private keys are left out on purpose: 64 hex characters are just as
//! often a transaction hash, and a warning on every copied hash would teach
//! people to ignore the real one.

use std::collections::HashSet;
use std::sync::OnceLock;

use serde::Serialize;

/// What kind of secret was found.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Secret {
    /// A recovery phrase of `words` words.
    RecoveryPhrase { words: usize },
    /// A Bitcoin private key (WIF).
    BitcoinKey,
    /// A Solana keypair secret.
    SolanaKey,
}

impl Secret {
    /// A short description for a warning, e.g. "a 12-word recovery phrase".
    pub fn describe(self) -> String {
        match self {
            Secret::RecoveryPhrase { words } => format!("a {words}-word recovery phrase"),
            Secret::BitcoinKey => "a Bitcoin private key".to_owned(),
            Secret::SolanaKey => "a Solana private key".to_owned(),
        }
    }
}

fn words() -> &'static HashSet<&'static str> {
    static WORDS: OnceLock<HashSet<&'static str>> = OnceLock::new();
    WORDS.get_or_init(|| include_str!("../data/bip39-english.txt").lines().collect())
}

/// The secret `text` holds, if it is one (and nothing much besides).
pub fn detect(text: &str) -> Option<Secret> {
    let text = text.trim();
    if text.is_empty() || text.len() > 400 {
        return None;
    }
    phrase(text).or_else(|| key(text))
}

fn phrase(text: &str) -> Option<Secret> {
    // Phrases are often copied numbered ("1. abandon 2. ability…") or one
    // word per line; numbers and punctuation between the words are allowed.
    let tokens: Vec<String> = text
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|t| !t.is_empty())
        .map(str::to_ascii_lowercase)
        .collect();
    let n = tokens.len();
    if ![12, 15, 18, 21, 24].contains(&n) {
        return None;
    }
    let list = words();
    tokens
        .iter()
        .all(|t| list.contains(t.as_str()))
        .then_some(Secret::RecoveryPhrase { words: n })
}

fn key(text: &str) -> Option<Secret> {
    if text.contains(char::is_whitespace) {
        return None;
    }
    // WIF: 51 characters (uncompressed) or 52 (compressed), Base58Check.
    if (51..=52).contains(&text.len())
        && let Ok(bytes) = bs58::decode(text).with_check(None).into_vec()
        && matches!(bytes.first(), Some(0x80 | 0xEF))
        && (bytes.len() == 33 || (bytes.len() == 34 && bytes[33] == 0x01))
    {
        return Some(Secret::BitcoinKey);
    }
    // Solana: a 64-byte keypair in Base58 is 86 to 88 characters.
    if (85..=88).contains(&text.len())
        && let Ok(bytes) = bs58::decode(text).into_vec()
        && bytes.len() == 64
    {
        return Some(Secret::SolanaKey);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_list_is_complete() {
        assert_eq!(words().len(), 2048);
    }

    #[test]
    fn recovery_phrases() {
        let twelve = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        assert_eq!(detect(twelve), Some(Secret::RecoveryPhrase { words: 12 }));
        // Numbered, one per line, mixed case.
        let numbered = (1..=12).map(|i| format!("{i}. Zoo")).collect::<Vec<_>>().join("\n");
        assert_eq!(detect(&numbered), Some(Secret::RecoveryPhrase { words: 12 }));
        // Eleven words, or a word outside the list, is not a phrase.
        assert_eq!(detect(&twelve.replacen("abandon ", "", 1)), None);
        assert_eq!(detect(&twelve.replace("about", "kenning")), None);
    }

    #[test]
    fn ordinary_text_is_not_a_secret() {
        assert_eq!(detect("Please pay the invoice for October by Friday, thank you very much indeed"), None);
        assert_eq!(detect("0x28C6c06298d514Db089934071355E5743bf21d60"), None);
        // A transaction hash looks like a hex key and must not warn.
        assert_eq!(detect("0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060"), None);
        assert_eq!(detect("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), None);
    }

    #[test]
    fn bitcoin_wif_keys() {
        // The well-known example key from the Bitcoin wiki (worthless).
        assert_eq!(detect("5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ"), Some(Secret::BitcoinKey));
        // One character changed: the checksum fails.
        assert_eq!(detect("5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTK"), None);
    }

    #[test]
    fn solana_keypair() {
        let secret = bs58::encode([7u8; 64]).into_string();
        assert_eq!(detect(&secret), Some(Secret::SolanaKey));
    }
}
