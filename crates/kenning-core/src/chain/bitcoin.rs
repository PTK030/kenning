//! Bitcoin addresses: legacy base58check (P2PKH, P2SH) and segwit
//! bech32 (v0) / bech32m (v1+).

use bech32::primitives::decode::SegwitHrpstringError;
use bech32::segwit;

use super::{Address, Chain, ParseError};

const P2PKH_MAIN: u8 = 0x00;
const P2SH_MAIN: u8 = 0x05;
const P2PKH_TEST: u8 = 0x6f;
const P2SH_TEST: u8 = 0xc4;

pub(super) fn parse_base58(s: &str) -> Result<Address, ParseError> {
    if !(25..=35).contains(&s.len()) {
        return Err(ParseError::NotAnAddress);
    }
    let first = s.as_bytes()[0];
    if !matches!(first, b'1' | b'3' | b'm' | b'n' | b'2') {
        return Err(ParseError::NotAnAddress);
    }
    let payload = match bs58::decode(s).with_check(None).into_vec() {
        Ok(p) => p,
        Err(bs58::decode::Error::InvalidChecksum { .. }) => {
            return Err(ParseError::BadChecksum {
                chain: Chain::Bitcoin,
            });
        }
        Err(_) => return Err(ParseError::NotAnAddress),
    };
    if payload.len() != 21 || !matches!(payload[0], P2PKH_MAIN | P2SH_MAIN | P2PKH_TEST | P2SH_TEST) {
        return Err(ParseError::NotAnAddress);
    }
    Ok(Address::new(Chain::Bitcoin, s.to_owned(), 1))
}

pub(super) fn parse_segwit(s: &str) -> Result<Address, ParseError> {
    // A string that is bech32-shaped but fails the checksum is worth reporting
    // as such; anything else is just not an address.
    let (hrp, _version, _program) = segwit::decode(s).map_err(|e| match e.0 {
        SegwitHrpstringError::Checksum(_) => ParseError::BadChecksum {
            chain: Chain::Bitcoin,
        },
        _ => ParseError::NotAnAddress,
    })?;
    if !(hrp.is_valid_on_mainnet() || hrp.is_valid_on_testnet() || hrp.is_valid_on_regtest()) {
        return Err(ParseError::NotAnAddress);
    }
    let lower = s.to_ascii_lowercase();
    // hrp + '1' + witness version character.
    let fixed = hrp.as_str().len() + 2;
    Ok(Address::new(Chain::Bitcoin, lower, fixed))
}

#[cfg(test)]
mod tests {
    use bech32::{Hrp, hrp};

    use super::*;

    #[test]
    fn legacy_addresses() {
        let genesis = parse_base58("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").unwrap();
        assert_eq!(genesis.body(), "A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
        assert!(matches!(
            parse_base58("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"),
            Err(ParseError::BadChecksum { .. })
        ));
    }

    #[test]
    fn segwit_round_trips() {
        let program20 = [0x75u8; 20];
        let program32 = [0x1eu8; 32];
        let v0 = segwit::encode_v0(hrp::BC, &program20).unwrap();
        let v1 = segwit::encode_v1(hrp::BC, &program32).unwrap();
        let tb = segwit::encode_v0(Hrp::parse("tb").unwrap(), &program32).unwrap();
        for s in [&v0, &v1, &tb] {
            let a = parse_segwit(s).unwrap();
            assert_eq!(a.as_str(), s.as_str());
        }
        assert!(v0.starts_with("bc1q"));
        assert_eq!(parse_segwit(&v0).unwrap().fixed_prefix(), "bc1q");
        assert_eq!(parse_segwit(&v1).unwrap().fixed_prefix(), "bc1p");
    }

    #[test]
    fn bip350_taproot_example() {
        let s = "bc1py3m7vwnghyne9gnvcjw82j7gqt2rafgdmlmwmqnn3hvcmdm09rjqcgrtxs";
        assert_eq!(parse_segwit(s).unwrap().as_str(), s);
        // Uppercase is valid bech32 and normalises to lowercase.
        assert_eq!(parse_segwit(&s.to_ascii_uppercase()).unwrap().as_str(), s);
    }

    #[test]
    fn segwit_rejects_tampering_and_mixed_case() {
        let s = "bc1py3m7vwnghyne9gnvcjw82j7gqt2rafgdmlmwmqnn3hvcmdm09rjqcgrtxt";
        assert!(parse_segwit(s).is_err());
        let mixed = "bc1Py3m7vwnghyne9gnvcjw82j7gqt2rafgdmlmwmqnn3hvcmdm09rjqcgrtxs";
        assert!(parse_segwit(mixed).is_err());
    }
}
