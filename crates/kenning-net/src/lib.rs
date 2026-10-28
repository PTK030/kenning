//! Optional on-chain lookups. Off unless the user turns them on.
//!
//! For a single address, this asks one public provider per chain how many
//! transactions it has and whether it is a (verified) contract. That answers
//! the question a lookalike raises: "has anyone ever used this address?"
//!
//! * Only the address is sent. Never clipboard text, never your book.
//! * Hosts are fixed and listed in [`HOSTS`] (shown in the app).
//! * No API keys are needed. A custom Solana RPC can be configured.
//! * Answers are cached for an hour in `net-cache.json`.
//!
//! `kenning-core` has no network code; this crate is the only place that
//! talks to the internet.

mod providers;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use jiff::Timestamp;
use kenning_core::{Address, Chain};
use serde::{Deserialize, Serialize};

/// Every host Kenning may contact, and why.
pub const HOSTS: &[(&str, &str)] = &[
    ("eth.blockscout.com", "EVM addresses (Ethereum mainnet)"),
    (
        "api.mainnet-beta.solana.com",
        "Solana addresses (mainnet, or your own RPC)",
    ),
    ("mempool.space", "Bitcoin addresses (mainnet)"),
    ("api.trongrid.io", "Tron addresses (mainnet)"),
];

/// How long a cached answer is used before asking again.
pub const CACHE_TTL: Duration = Duration::from_secs(60 * 60);

/// What the chain says about an address.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Onchain {
    pub chain: Chain,
    /// The network the answer is about, e.g. "Ethereum".
    pub network: String,
    /// Who answered, e.g. "Blockscout".
    pub source: String,
    /// Whether the address has ever appeared on chain.
    pub active: bool,
    pub transactions: Option<u64>,
    /// `transactions` is a lower bound (the provider stops counting).
    pub transactions_capped: bool,
    pub contract: bool,
    pub verified: Option<bool>,
    pub name: Option<String>,
    pub fetched_at: Timestamp,
}

impl Onchain {
    /// One line for the UI, e.g. "1,204 transactions · verified contract ·
    /// Ethereum via Blockscout".
    pub fn summary(&self) -> String {
        let via = format!("{} via {}", self.network, self.source);
        if !self.active {
            return format!("Never used on chain · {via}");
        }
        let mut parts = Vec::new();
        if let Some(n) = self.transactions {
            let plus = if self.transactions_capped { "+" } else { "" };
            let word = if n == 1 && !self.transactions_capped {
                "transaction"
            } else {
                "transactions"
            };
            parts.push(format!("{}{plus} {word}", thousands(n)));
        }
        if self.contract {
            let kind = match self.verified {
                Some(true) => "verified contract",
                Some(false) => "unverified contract",
                None => "contract",
            };
            parts.push(match &self.name {
                Some(name) => format!("{kind} “{name}”"),
                None => kind.to_owned(),
            });
        }
        if parts.is_empty() {
            parts.push("Used on chain".to_owned());
        }
        parts.push(via);
        parts.join(" · ")
    }
}

fn thousands(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    out
}

#[derive(Debug, thiserror::Error)]
pub enum NetError {
    #[error("{0} is not supported for on-chain lookups yet")]
    Unsupported(String),
    #[error("{provider}: {message}")]
    Provider { provider: &'static str, message: String },
}

/// Provider base URLs. Tests point these at a local mock server.
#[derive(Clone, Debug)]
pub struct Endpoints {
    pub blockscout: String,
    pub solana_rpc: String,
    pub mempool: String,
    pub trongrid: String,
}

impl Default for Endpoints {
    fn default() -> Self {
        Endpoints {
            blockscout: "https://eth.blockscout.com".into(),
            solana_rpc: "https://api.mainnet-beta.solana.com".into(),
            mempool: "https://mempool.space".into(),
            trongrid: "https://api.trongrid.io".into(),
        }
    }
}

impl Endpoints {
    /// Public endpoints, with an optional custom Solana RPC.
    pub fn with_solana_rpc(solana_rpc: Option<&str>) -> Self {
        let mut e = Endpoints::default();
        if let Some(url) = solana_rpc.filter(|u| !u.trim().is_empty()) {
            e.solana_rpc = url.trim().trim_end_matches('/').to_owned();
        }
        e
    }
}

pub struct Net {
    agent: ureq::Agent,
    endpoints: Endpoints,
    cache: Mutex<HashMap<String, Onchain>>,
    cache_path: Option<PathBuf>,
}

impl Net {
    /// A client. Creating it opens no connection; only [`Net::lookup`] does.
    pub fn new(endpoints: Endpoints, cache_path: Option<PathBuf>) -> Self {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(8)))
            .http_status_as_error(false)
            .user_agent(concat!("kenning/", env!("CARGO_PKG_VERSION")))
            .build()
            .into();
        let cache = cache_path
            .as_ref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Net {
            agent,
            endpoints,
            cache: Mutex::new(cache),
            cache_path,
        }
    }

    pub fn endpoints(&self) -> &Endpoints {
        &self.endpoints
    }

    /// A cached answer, if fresh. Never touches the network.
    pub fn cached(&self, address: &Address) -> Option<Onchain> {
        let cache = self.cache.lock().unwrap();
        cache.get(&key(address)).filter(|o| fresh(o)).cloned()
    }

    /// Ask the provider for `address`, or use a fresh cached answer.
    pub fn lookup(&self, address: &Address) -> Result<Onchain, NetError> {
        if let Some(hit) = self.cached(address) {
            return Ok(hit);
        }
        let result = match address.chain() {
            Chain::Evm => providers::blockscout(&self.agent, &self.endpoints.blockscout, address),
            Chain::Solana => providers::solana(&self.agent, &self.endpoints.solana_rpc, address),
            Chain::Bitcoin => providers::mempool(&self.agent, &self.endpoints.mempool, address),
            Chain::Tron => providers::trongrid(&self.agent, &self.endpoints.trongrid, address),
        }?;
        self.store(address, &result);
        Ok(result)
    }

    fn store(&self, address: &Address, value: &Onchain) {
        let mut cache = self.cache.lock().unwrap();
        cache.retain(|_, o| fresh(o));
        cache.insert(key(address), value.clone());
        if let Some(path) = &self.cache_path
            && let Ok(json) = serde_json::to_string(&*cache)
        {
            let _ = std::fs::write(path, json);
        }
    }
}

fn key(address: &Address) -> String {
    let k = address.key();
    format!("{}:{}", k.chain, k.text)
}

fn fresh(o: &Onchain) -> bool {
    let age = Timestamp::now().as_second() - o.fetched_at.as_second();
    (0..CACHE_TTL.as_secs() as i64).contains(&age)
}

#[cfg(test)]
mod tests;
