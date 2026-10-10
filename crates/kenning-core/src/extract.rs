//! Find addresses inside arbitrary text: chat messages, logs, JSON, URLs.

use crate::chain::{self, Address};

/// One address found in text, with its byte range in the input.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Found {
    pub address: Address,
    pub start: usize,
    pub end: usize,
}

/// All valid addresses in `text`, in order of appearance, without duplicates.
///
/// Tokens are maximal runs of ASCII alphanumerics, so an address glued to
/// other alphanumerics (part of a longer hash, calldata) is not reported.
pub fn extract(text: &str) -> Vec<Found> {
    let mut out: Vec<Found> = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if !bytes[i].is_ascii_alphanumeric() {
            i += 1;
            continue;
        }
        let start = i;
        while i < bytes.len() && bytes[i].is_ascii_alphanumeric() {
            i += 1;
        }
        let token = &text[start..i];
        if !(25..=90).contains(&token.len()) {
            continue;
        }
        if let Ok(address) = chain::parse(token) {
            if !out.iter().any(|f| f.address.key() == address.key()) {
                out.push(Found {
                    address,
                    start,
                    end: i,
                });
            }
        }
    }
    out
}

/// The single address a clipboard holds, if the text is exactly one address
/// (ignoring surrounding whitespace and common wrapping like quotes).
pub fn single(text: &str) -> Option<Address> {
    let trimmed = text
        .trim()
        .trim_matches(|c: char| matches!(c, '"' | '\'' | '`' | '<' | '>' | '(' | ')' | ','));
    chain::parse(trimmed).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Chain;

    #[test]
    fn finds_addresses_in_prose() {
        let text = "send to 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed, then swap on \
                    JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 (usdt: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)";
        let found: Vec<_> = extract(text).into_iter().map(|f| f.address.chain()).collect();
        assert_eq!(found, vec![Chain::Evm, Chain::Solana, Chain::Tron]);
    }

    #[test]
    fn ignores_hashes_and_calldata() {
        let text = "tx 0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b \
                    data 0x0000000000000000000000005aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
        assert!(extract(text).is_empty());
    }

    #[test]
    fn finds_addresses_in_urls_and_json() {
        let text = r#"https://etherscan.io/address/0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed#code
                      {"to":"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"}"#;
        let found = extract(text);
        assert_eq!(found.len(), 2);
        assert_eq!(
            found[0].address.as_str(),
            "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
        );
    }

    #[test]
    fn deduplicates_case_variants() {
        let text = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
        assert_eq!(extract(text).len(), 1);
    }

    #[test]
    fn single_strips_wrapping() {
        assert!(single("  \"0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed\"\n").is_some());
        assert!(single("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed and more").is_none());
    }

    #[test]
    fn english_words_are_not_solana() {
        let text = "Pneumonoultramicroscopicsilicovolcanoconiosis is a long word indeed";
        assert!(extract(text).is_empty());
    }
}
