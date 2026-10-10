//! Solana addresses: base58 encoding of a 32-byte public key. No checksum.

use super::{Address, Chain, ParseError};

pub(super) fn parse(s: &str) -> Result<Address, ParseError> {
    if !(32..=44).contains(&s.len()) {
        return Err(ParseError::NotAnAddress);
    }
    let bytes = bs58::decode(s).into_vec().map_err(|_| ParseError::NotAnAddress)?;
    if bytes.len() != 32 {
        return Err(ParseError::NotAnAddress);
    }
    // Reject non-canonical encodings so that one key has one text form.
    if bs58::encode(&bytes).into_string() != s {
        return Err(ParseError::NotAnAddress);
    }
    Ok(Address::new(Chain::Solana, s.to_owned(), 0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_program_and_mint_addresses() {
        for s in [
            "11111111111111111111111111111111",
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        ] {
            assert_eq!(parse(s).unwrap().as_str(), s);
        }
    }

    #[test]
    fn rejects_wrong_length_and_alphabet() {
        // 0, O, I and l are not in the base58 alphabet.
        assert!(parse("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt10").is_err());
        assert!(parse("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt").is_err());
        // A 64-byte transaction signature is not an address.
        assert!(
            parse("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW")
                .is_err()
        );
    }
}
