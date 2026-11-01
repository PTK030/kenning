//! Optional on-chain lookups. Off unless the user turns them on.
//!
//! For a single address, this asks public providers how many transactions it
//! has and whether it is a (verified) contract. That answers the question a
//! lookalike raises: "has anyone ever used this address?"
//!
//! An EVM address is the same on every EVM network, and poisoning happens on
//! all of them, so it is asked on each network chosen ([`EVM_NETWORKS`]), at
//! once. Ethereum and Optimism have a Blockscout explorer that answers
//! without a key; the others are asked through their public nodes, which can
//! prove use (a transaction sent, a balance, code) but cannot see tokens
//! received, so silence there is "no sign of use", never "never used".
//!
//! * Only the address is sent. Never clipboard text, never your book.
//! * Hosts are listed by [`Endpoints::hosts`] (shown in the app).
//! * No API keys are needed. A custom Solana RPC, a self-hosted mempool
//!   server and a TronGrid key can be configured.
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

/// The EVM networks an address can be asked about: id (as in the config),
/// name, and who answers. All answer without a key (checked 2026-11):
/// Blockscout's own instances for Base, Arbitrum and Polygon sit behind a
/// browser challenge and its multichain API wants a key, so those are asked
/// through public nodes (polygon-rpc.com is gone; PublicNode serves Polygon).
pub const EVM_NETWORKS: &[(&str, &str, EvmSource<&str>)] = &[
    ("ethereum", "Ethereum", EvmSource::Blockscout("https://eth.blockscout.com")),
    ("base", "Base", EvmSource::Rpc("https://mainnet.base.org")),
    ("arbitrum", "Arbitrum", EvmSource::Rpc("https://arb1.arbitrum.io/rpc")),
    ("optimism", "Optimism", EvmSource::Blockscout("https://explorer.optimism.io")),
    ("polygon", "Polygon", EvmSource::Rpc("https://polygon-bor-rpc.publicnode.com")),
    ("bsc", "BNB Chain", EvmSource::Rpc("https://bsc-dataseed.bnbchain.org")),
];

/// Who answers for an EVM network.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EvmSource<S> {
    /// A Blockscout explorer: activity including tokens, contract details.
    Blockscout(S),
    /// A JSON-RPC node: transactions sent, balance, code.
    Rpc(S),
}

impl<S: AsRef<str>> EvmSource<S> {
    pub fn url(&self) -> &str {
        match self {
            EvmSource::Blockscout(u) | EvmSource::Rpc(u) => u.as_ref(),
        }
    }
}

/// One EVM network's answer, when an address was asked on several.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkUse {
    pub network: String,
    pub source: String,
    /// `Some(true)`: used. `Some(false)`: the explorer has never seen it.
    /// `None`: no transaction sent and no balance, as far as a node can
    /// tell (tokens received are invisible to it), or the network failed.
    pub used: Option<bool>,
    /// From an explorer, all transactions; from a node, those sent.
    pub transactions: Option<u64>,
    pub transactions_capped: bool,
    pub contract: bool,
    /// Why this network could not be asked, if it could not.
    pub error: Option<String>,
}

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
    /// EVM: each network asked, in order. Empty for other chains (and for
    /// answers cached before networks were asked one by one).
    #[serde(default)]
    pub networks: Vec<NetworkUse>,
}

impl Onchain {
    /// One line for the UI, e.g. "1,204 transactions · verified contract ·
    /// Ethereum via Blockscout".
    pub fn summary(&self) -> String {
        if self.networks.len() > 1 {
            return self.networks_summary();
        }
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

impl Onchain {
    /// An address asked on several EVM networks: where it was used, then
    /// the leading network's numbers.
    fn networks_summary(&self) -> String {
        let used: Vec<&str> = self
            .networks
            .iter()
            .filter(|n| n.used == Some(true))
            .map(|n| n.network.as_str())
            .collect();
        let failed = self.networks.iter().filter(|n| n.error.is_some()).count();
        let asked = self.networks.len() - failed;
        let mut parts = Vec::new();
        if used.is_empty() {
            parts.push(format!("No sign of use on {asked} EVM networks"));
        } else {
            parts.push(format!("Used on {}", list(&used)));
            if let Some(n) = self.transactions {
                let plus = if self.transactions_capped { "+" } else { "" };
                parts.push(format!("{}{plus} transactions on {}", thousands(n), self.network));
            }
            if self.contract {
                parts.push(match (self.verified, &self.name) {
                    (Some(true), Some(name)) => format!("verified contract “{name}”"),
                    (Some(true), None) => "verified contract".into(),
                    (Some(false), _) => "unverified contract".into(),
                    _ => "contract".into(),
                });
            }
        }
        if failed > 0 {
            parts.push(format!("{failed} not reachable"));
        }
        parts.join(" · ")
    }
}

/// "A", "A and B", "A, B and C".
fn list(items: &[&str]) -> String {
    match items {
        [] => String::new(),
        [one] => (*one).to_owned(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
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

/// One EVM network to ask: its name and who answers.
#[derive(Clone, Debug)]
pub struct EvmEndpoint {
    pub name: String,
    pub source: EvmSource<String>,
}

/// Provider base URLs. Tests point these at a local mock server.
#[derive(Clone, Debug)]
pub struct Endpoints {
    /// The EVM networks asked, in order; the first answers alone when it is
    /// the only one.
    pub evm: Vec<EvmEndpoint>,
    pub solana_rpc: String,
    pub mempool: String,
    pub trongrid: String,
    /// Sent to TronGrid as `TRON-PRO-API-KEY`, for its higher limits.
    pub trongrid_key: Option<String>,
}

const SOLANA_RPC: &str = "https://api.mainnet-beta.solana.com";
const MEMPOOL_URL: &str = "https://mempool.space";
const TRONGRID_URL: &str = "https://api.trongrid.io";

impl Default for Endpoints {
    /// Every EVM network, and the public providers.
    fn default() -> Self {
        let all: Vec<String> = EVM_NETWORKS.iter().map(|(id, ..)| (*id).to_owned()).collect();
        Endpoints::new(&all, None, None, None)
    }
}

impl Endpoints {
    /// The EVM networks with these ids (unknown ones are skipped), and the
    /// public providers unless a custom Solana RPC, a mempool server of your
    /// own or a TronGrid key is given.
    pub fn new(evm: &[String], solana_rpc: Option<&str>, mempool: Option<&str>, trongrid_key: Option<&str>) -> Self {
        let custom = |url: Option<&str>, default: &str| {
            url.map(|u| u.trim().trim_end_matches('/'))
                .filter(|u| !u.is_empty())
                .unwrap_or(default)
                .to_owned()
        };
        Endpoints {
            evm: EVM_NETWORKS
                .iter()
                .filter(|(id, ..)| evm.iter().any(|e| e == id))
                .map(|(_, name, source)| EvmEndpoint {
                    name: (*name).to_owned(),
                    source: match source {
                        EvmSource::Blockscout(u) => EvmSource::Blockscout((*u).to_owned()),
                        EvmSource::Rpc(u) => EvmSource::Rpc((*u).to_owned()),
                    },
                })
                .collect(),
            solana_rpc: custom(solana_rpc, SOLANA_RPC),
            mempool: custom(mempool, MEMPOOL_URL),
            trongrid: TRONGRID_URL.to_owned(),
            trongrid_key: trongrid_key.map(str::trim).filter(|k| !k.is_empty()).map(str::to_owned),
        }
    }

    /// The endpoints the settings ask for.
    pub fn from_config(c: &kenning_core::Config) -> Self {
        Endpoints::new(
            &c.evm_networks,
            c.solana_rpc.as_deref(),
            c.bitcoin_api.as_deref(),
            c.trongrid_key.as_deref(),
        )
    }

    /// Every host these endpoints reach, and for what, for the app to show.
    pub fn hosts(&self) -> Vec<(String, String)> {
        let mut out: Vec<(String, String)> = self
            .evm
            .iter()
            .map(|e| (host(e.source.url()), format!("EVM addresses on {}", e.name)))
            .collect();
        out.push((host(&self.solana_rpc), "Solana addresses".into()));
        out.push((host(&self.mempool), "Bitcoin addresses".into()));
        out.push((host(&self.trongrid), "Tron addresses".into()));
        out
    }
}

/// "https://eth.blockscout.com/x" -> "eth.blockscout.com".
fn host(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    rest.split(['/', '?']).next().unwrap_or(rest).to_owned()
}

/// Whether `url` can be an endpoint: http or https, with a host.
pub fn check_url(url: &str) -> Result<(), String> {
    let u = url.trim();
    let rest = u
        .strip_prefix("https://")
        .or_else(|| u.strip_prefix("http://"))
        .ok_or_else(|| format!("“{u}” must start with https:// (or http:// for a server on your own network)."))?;
    if rest.split('/').next().unwrap_or("").is_empty() {
        return Err(format!("“{u}” has no host."));
    }
    Ok(())
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
        cache.get(&self.key(address)).filter(|o| fresh(o)).cloned()
    }

    /// Ask the provider for `address`, or use a fresh cached answer.
    pub fn lookup(&self, address: &Address) -> Result<Onchain, NetError> {
        if let Some(hit) = self.cached(address) {
            return Ok(hit);
        }
        let result = match address.chain() {
            Chain::Evm => self.evm(address),
            Chain::Solana => providers::solana(&self.agent, &self.endpoints.solana_rpc, address),
            Chain::Bitcoin => providers::mempool(&self.agent, &self.endpoints.mempool, address),
            Chain::Tron => providers::trongrid(
                &self.agent,
                &self.endpoints.trongrid,
                self.endpoints.trongrid_key.as_deref(),
                address,
            ),
        }?;
        self.store(address, &result);
        Ok(result)
    }

    /// Ask every chosen EVM network at once. One network alone answers as
    /// before; several are summed up, the explorers' details first.
    fn evm(&self, address: &Address) -> Result<Onchain, NetError> {
        let networks = &self.endpoints.evm;
        let ask = |e: &EvmEndpoint| match &e.source {
            EvmSource::Blockscout(base) => providers::blockscout(&self.agent, base, &e.name, address),
            EvmSource::Rpc(url) => providers::evm_node(&self.agent, url, &e.name, address),
        };
        match networks.as_slice() {
            [] => Err(NetError::Unsupported("EVM with no network chosen".into())),
            [one] => ask(one),
            _ => {
                let answers: Vec<Result<Onchain, NetError>> = std::thread::scope(|s| {
                    let running: Vec<_> = networks.iter().map(|e| s.spawn(move || ask(e))).collect();
                    running
                        .into_iter()
                        .map(|t| t.join().unwrap_or_else(|_| Err(NetError::Unsupported("a lookup".into()))))
                        .collect()
                });
                combine(networks, answers)
            }
        }
    }

    fn store(&self, address: &Address, value: &Onchain) {
        let mut cache = self.cache.lock().unwrap();
        cache.retain(|_, o| fresh(o));
        cache.insert(self.key(address), value.clone());
        if let Some(path) = &self.cache_path
            && let Ok(json) = serde_json::to_string(&*cache)
        {
            let _ = std::fs::write(path, json);
        }
    }
}

impl Net {
    /// The cache key: the address, and for EVM the networks asked, so a
    /// change of networks is never answered from an older set.
    fn key(&self, address: &Address) -> String {
        let k = address.key();
        let mut key = format!("{}:{}", k.chain, k.text);
        if address.chain() == Chain::Evm {
            for e in &self.endpoints.evm {
                key.push('|');
                key.push_str(&e.name);
            }
        }
        key
    }
}

/// Several EVM networks' answers as one: used anywhere is used; the numbers
/// and contract details come from the first network that has them (the
/// explorers come first). An error only when every network failed.
fn combine(networks: &[EvmEndpoint], answers: Vec<Result<Onchain, NetError>>) -> Result<Onchain, NetError> {
    let mut uses = Vec::new();
    let mut first_error = None;
    for (e, answer) in networks.iter().zip(&answers) {
        uses.push(match answer {
            Ok(o) => NetworkUse {
                network: e.name.clone(),
                source: o.source.clone(),
                used: if o.active {
                    Some(true)
                } else if matches!(e.source, EvmSource::Blockscout(_)) {
                    Some(false)
                } else {
                    None
                },
                transactions: o.transactions,
                transactions_capped: o.transactions_capped,
                contract: o.contract,
                error: None,
            },
            Err(err) => {
                first_error.get_or_insert_with(|| err.to_string());
                NetworkUse {
                    network: e.name.clone(),
                    source: String::new(),
                    used: None,
                    transactions: None,
                    transactions_capped: false,
                    contract: false,
                    error: Some(err.to_string()),
                }
            }
        });
    }
    let ok: Vec<&Onchain> = answers.iter().filter_map(|a| a.as_ref().ok()).collect();
    if ok.is_empty() {
        return Err(NetError::Provider {
            provider: "EVM networks",
            message: first_error.unwrap_or_default(),
        });
    }
    // The answer whose numbers lead: an explorer's (it counts everything)
    // before a node's (it counts only what was sent); counted before not.
    let explorer = |o: &&&Onchain| o.source == "Blockscout";
    let lead = ok
        .iter()
        .find(|o| explorer(o) && o.active && o.transactions.is_some())
        .or_else(|| ok.iter().find(|o| o.active && o.transactions.is_some()))
        .or_else(|| ok.iter().find(|o| o.active))
        .unwrap_or(&ok[0]);
    // Contract details from the network that knows them best.
    let contract = ok
        .iter()
        .find(|o| o.contract && o.verified.is_some())
        .or_else(|| ok.iter().find(|o| o.contract));
    Ok(Onchain {
        chain: Chain::Evm,
        network: lead.network.clone(),
        source: lead.source.clone(),
        active: ok.iter().any(|o| o.active),
        transactions: lead.transactions,
        transactions_capped: lead.transactions_capped,
        contract: contract.is_some(),
        verified: contract.and_then(|c| c.verified),
        name: contract.and_then(|c| c.name.clone()),
        fetched_at: Timestamp::now(),
        networks: uses,
    })
}

fn fresh(o: &Onchain) -> bool {
    let age = Timestamp::now().as_second() - o.fetched_at.as_second();
    (0..CACHE_TTL.as_secs() as i64).contains(&age)
}

#[cfg(test)]
mod tests;
