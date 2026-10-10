//! Curated public labels, embedded at compile time so recognition works
//! offline. Every label carries a `source` so anyone can check where it came
//! from. Parsing and validation live in `kenning-core`.

/// One data file: the chain it describes and its TOML text.
pub struct File {
    pub chain: &'static str,
    pub toml: &'static str,
}

pub const FILES: &[File] = &[
    File {
        chain: "evm",
        toml: include_str!("../data/evm.toml"),
    },
    File {
        chain: "solana",
        toml: include_str!("../data/solana.toml"),
    },
    File {
        chain: "bitcoin",
        toml: include_str!("../data/bitcoin.toml"),
    },
    File {
        chain: "tron",
        toml: include_str!("../data/tron.toml"),
    },
];
