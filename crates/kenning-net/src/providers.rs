//! One function per provider. Each sends only the address.

use jiff::Timestamp;
use kenning_core::{Address, Chain};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{NetError, Onchain};

type Agent = ureq::Agent;

fn fail(provider: &'static str, message: impl ToString) -> NetError {
    NetError::Provider {
        provider,
        message: message.to_string(),
    }
}

/// GET returning (status, JSON body or Null).
fn get(agent: &Agent, provider: &'static str, url: &str) -> Result<(u16, Value), NetError> {
    let mut resp = agent.get(url).call().map_err(|e| fail(provider, e))?;
    let status = resp.status().as_u16();
    let body = resp.body_mut().read_json::<Value>().unwrap_or(Value::Null);
    Ok((status, body))
}

fn post(agent: &Agent, provider: &'static str, url: &str, body: &Value) -> Result<(u16, Value), NetError> {
    let mut resp = agent.post(url).send_json(body).map_err(|e| fail(provider, e))?;
    let status = resp.status().as_u16();
    let body = resp.body_mut().read_json::<Value>().unwrap_or(Value::Null);
    Ok((status, body))
}

fn ok_or_fail(provider: &'static str, status: u16) -> Result<(), NetError> {
    if (200..300).contains(&status) {
        Ok(())
    } else {
        Err(fail(provider, format!("HTTP {status}")))
    }
}

fn number(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

// ---------------------------------------------------------------- EVM

const BLOCKSCOUT: &str = "Blockscout";

pub(crate) fn blockscout(agent: &Agent, base: &str, address: &Address) -> Result<Onchain, NetError> {
    let mut out = Onchain {
        chain: Chain::Evm,
        network: "Ethereum".into(),
        source: BLOCKSCOUT.into(),
        active: false,
        transactions: None,
        transactions_capped: false,
        contract: false,
        verified: None,
        name: None,
        fetched_at: Timestamp::now(),
    };
    let (status, info) = get(agent, BLOCKSCOUT, &format!("{base}/api/v2/addresses/{address}"))?;
    if status == 404 {
        return Ok(out);
    }
    ok_or_fail(BLOCKSCOUT, status)?;
    out.contract = info["is_contract"].as_bool().unwrap_or(false);
    out.verified = if out.contract {
        info["is_verified"].as_bool()
    } else {
        None
    };
    out.name = info["name"].as_str().filter(|s| !s.is_empty()).map(str::to_owned);

    let (status, counters) = get(
        agent,
        BLOCKSCOUT,
        &format!("{base}/api/v2/addresses/{address}/counters"),
    )?;
    ok_or_fail(BLOCKSCOUT, status)?;
    let txs = number(&counters["transactions_count"]).unwrap_or(0);
    let transfers = number(&counters["token_transfers_count"]).unwrap_or(0);
    // Blockscout computes counters lazily and may answer 0 for busy
    // addresses, so 0 is "unknown", never a fact. Activity comes from the
    // address record itself.
    out.transactions = (txs > 0).then_some(txs);
    out.transactions_capped = txs > 0;
    let balance = info["coin_balance"].as_str().is_some_and(|b| b != "0");
    out.active = out.contract
        || balance
        || info["has_token_transfers"].as_bool().unwrap_or(false)
        || info["has_logs"].as_bool().unwrap_or(false)
        || txs > 0
        || transfers > 0;
    Ok(out)
}

// ---------------------------------------------------------------- Solana

const SOLANA: &str = "Solana RPC";
/// `getSignaturesForAddress` returns at most this many per call.
const SOLANA_PAGE: u64 = 1000;

pub(crate) fn solana(agent: &Agent, rpc: &str, address: &Address) -> Result<Onchain, NetError> {
    let call = |method: &str, params: Value| -> Result<Value, NetError> {
        let (status, body) = post(
            agent,
            SOLANA,
            rpc,
            &json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}),
        )?;
        ok_or_fail(SOLANA, status)?;
        if let Some(err) = body.get("error") {
            return Err(fail(SOLANA, err["message"].as_str().unwrap_or("RPC error")));
        }
        Ok(body["result"].clone())
    };
    let account = call(
        "getAccountInfo",
        json!([address.as_str(), {"encoding": "base64"}]),
    )?;
    let sigs = call(
        "getSignaturesForAddress",
        json!([address.as_str(), {"limit": SOLANA_PAGE}]),
    )?;
    let count = sigs.as_array().map(|a| a.len() as u64).unwrap_or(0);
    let value = &account["value"];
    Ok(Onchain {
        chain: Chain::Solana,
        network: "Solana".into(),
        source: "Solana RPC".into(),
        active: !value.is_null() || count > 0,
        transactions: Some(count),
        transactions_capped: count >= SOLANA_PAGE,
        contract: value["executable"].as_bool().unwrap_or(false),
        verified: None,
        name: None,
        fetched_at: Timestamp::now(),
    })
}

// ---------------------------------------------------------------- Bitcoin

const MEMPOOL: &str = "mempool.space";

#[derive(Deserialize)]
struct MempoolStats {
    tx_count: u64,
}

#[derive(Deserialize)]
struct MempoolAddress {
    chain_stats: MempoolStats,
    mempool_stats: MempoolStats,
}

pub(crate) fn mempool(agent: &Agent, base: &str, address: &Address) -> Result<Onchain, NetError> {
    let s = address.as_str();
    if !(s.starts_with("bc1") || s.starts_with('1') || s.starts_with('3')) {
        return Err(NetError::Unsupported("Bitcoin testnet".into()));
    }
    let (status, body) = get(agent, MEMPOOL, &format!("{base}/api/address/{s}"))?;
    ok_or_fail(MEMPOOL, status)?;
    let info: MempoolAddress = serde_json::from_value(body).map_err(|e| fail(MEMPOOL, e))?;
    let txs = info.chain_stats.tx_count + info.mempool_stats.tx_count;
    Ok(Onchain {
        chain: Chain::Bitcoin,
        network: "Bitcoin".into(),
        source: MEMPOOL.into(),
        active: txs > 0,
        transactions: Some(txs),
        transactions_capped: false,
        contract: false,
        verified: None,
        name: None,
        fetched_at: Timestamp::now(),
    })
}

// ---------------------------------------------------------------- Tron

const TRONGRID: &str = "TronGrid";
const TRON_PAGE: u64 = 200;

pub(crate) fn trongrid(agent: &Agent, base: &str, address: &Address) -> Result<Onchain, NetError> {
    let s = address.as_str();
    let (status, account) = get(agent, TRONGRID, &format!("{base}/v1/accounts/{s}"))?;
    ok_or_fail(TRONGRID, status)?;
    let activated = account["data"].as_array().is_some_and(|d| !d.is_empty());

    let (status, contract) = post(
        agent,
        TRONGRID,
        &format!("{base}/wallet/getcontract"),
        &json!({"value": s, "visible": true}),
    )?;
    ok_or_fail(TRONGRID, status)?;
    let is_contract = contract.get("contract_address").is_some();

    let (status, txs) = get(
        agent,
        TRONGRID,
        &format!("{base}/v1/accounts/{s}/transactions?limit={TRON_PAGE}&only_confirmed=true"),
    )?;
    ok_or_fail(TRONGRID, status)?;
    let count = txs["data"].as_array().map(|a| a.len() as u64).unwrap_or(0);

    Ok(Onchain {
        chain: Chain::Tron,
        network: "Tron".into(),
        source: TRONGRID.into(),
        active: activated || is_contract || count > 0,
        transactions: if is_contract { None } else { Some(count) },
        transactions_capped: count >= TRON_PAGE,
        contract: is_contract,
        verified: None,
        name: contract["name"]
            .as_str()
            .filter(|n| !n.is_empty())
            .map(str::to_owned),
        fetched_at: Timestamp::now(),
    })
}
