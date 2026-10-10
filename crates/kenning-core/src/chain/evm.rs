//! EVM addresses: `0x` + 20 bytes hex, EIP-55 checksum.

use tiny_keccak::{Hasher, Keccak};

use super::{Address, Chain, ParseError};

pub(super) fn parse(s: &str) -> Result<Address, ParseError> {
    let hex = s
        .strip_prefix("0x")
        .or_else(|| s.strip_prefix("0X"))
        .ok_or(ParseError::NotAnAddress)?;
    if hex.len() != 40 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ParseError::NotAnAddress);
    }
    let checksummed = checksum(hex);
    let has_lower = hex.bytes().any(|b| b.is_ascii_lowercase());
    let has_upper = hex.bytes().any(|b| b.is_ascii_uppercase());
    // Single-case input carries no checksum (EIP-55 allows it). Mixed case
    // must match exactly, otherwise someone edited the address.
    if has_lower && has_upper && checksummed[2..] != *hex {
        return Err(ParseError::BadChecksum { chain: Chain::Evm });
    }
    Ok(Address::new(Chain::Evm, checksummed, 2))
}

/// EIP-55 checksum form, `0x`-prefixed.
pub(crate) fn checksum(hex: &str) -> String {
    let lower = hex.to_ascii_lowercase();
    let mut hash = [0u8; 32];
    let mut keccak = Keccak::v256();
    keccak.update(lower.as_bytes());
    keccak.finalize(&mut hash);

    let mut out = String::with_capacity(42);
    out.push_str("0x");
    for (i, ch) in lower.chars().enumerate() {
        let nibble = (hash[i / 2] >> (if i % 2 == 0 { 4 } else { 0 })) & 0x0f;
        if ch.is_ascii_alphabetic() && nibble >= 8 {
            out.push(ch.to_ascii_uppercase());
        } else {
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test vectors from EIP-55.
    const VECTORS: [&str; 8] = [
        "0x52908400098527886E0F7030069857D2E4169EE7",
        "0x8617E340B3D01FA5F11F306F4090FD50E238070D",
        "0xde709f2102306220921060314715629080e2fb77",
        "0x27b1fdb04752bbc536007a920d24acb045561c26",
        "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
        "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
        "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
        "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
    ];

    #[test]
    fn eip55_vectors_checksum_to_themselves() {
        for v in VECTORS {
            assert_eq!(checksum(&v[2..]), v, "{v}");
            assert_eq!(parse(v).unwrap().as_str(), v);
        }
    }

    #[test]
    fn single_case_is_accepted_and_normalised() {
        let v = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
        assert_eq!(parse(&v.to_ascii_lowercase()).unwrap().as_str(), v);
        let upper = format!("0x{}", v[2..].to_ascii_uppercase());
        assert_eq!(parse(&upper).unwrap().as_str(), v);
    }

    #[test]
    fn wrong_mixed_case_is_rejected() {
        let tampered = "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
        assert_eq!(
            parse(tampered),
            Err(ParseError::BadChecksum { chain: Chain::Evm })
        );
    }

    #[test]
    fn wrong_length_or_alphabet() {
        assert!(parse("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeA").is_err());
        assert!(parse("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAedaa").is_err());
        assert!(parse("0xZaAeb6053F3E94C9b9A09f33669435E7Ef1BeAed").is_err());
        // A transaction hash is not an address.
        assert!(parse("0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b").is_err());
    }
}
