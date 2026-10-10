//! Tron addresses: base58check of version byte `0x41` + 20 bytes.

use super::{Address, Chain, ParseError};

const VERSION: u8 = 0x41;

pub(super) fn parse(s: &str) -> Result<Address, ParseError> {
    if s.len() != 34 || !s.starts_with('T') {
        return Err(ParseError::NotAnAddress);
    }
    let payload = match bs58::decode(s).with_check(None).into_vec() {
        Ok(p) => p,
        Err(bs58::decode::Error::InvalidChecksum { .. }) => {
            return Err(ParseError::BadChecksum { chain: Chain::Tron });
        }
        Err(_) => return Err(ParseError::NotAnAddress),
    };
    if payload.len() != 21 || payload[0] != VERSION {
        return Err(ParseError::NotAnAddress);
    }
    Ok(Address::new(Chain::Tron, s.to_owned(), 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usdt_contract() {
        let s = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
        let a = parse(s).unwrap();
        assert_eq!(a.as_str(), s);
        assert_eq!(a.body(), &s[1..]);
    }

    #[test]
    fn tampered_checksum() {
        assert_eq!(
            parse("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u"),
            Err(ParseError::BadChecksum { chain: Chain::Tron })
        );
    }
}
