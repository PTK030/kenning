//! Provider tests against a local mock HTTP server. No real network.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use kenning_core::parse;

use super::*;

/// Serve canned JSON by "METHOD path" (path without query). Records every
/// request line it receives.
struct Mock {
    base: String,
    seen: Arc<Mutex<Vec<String>>>,
}

fn mock(routes: Vec<(&'static str, u16, &'static str)>) -> Mock {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            let mut len = 0usize;
            loop {
                let mut h = String::new();
                reader.read_line(&mut h).unwrap();
                if h.trim().is_empty() {
                    break;
                }
                if let Some(v) = h.to_ascii_lowercase().strip_prefix("content-length:") {
                    len = v.trim().parse().unwrap_or(0);
                }
            }
            let mut body = vec![0; len];
            reader.read_exact(&mut body).unwrap();
            let mut parts = line.split_whitespace();
            let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
            let path = target.split('?').next().unwrap_or("");
            // JSON-RPC posts to "/" are routed by method name.
            let rpc = serde_json::from_slice::<serde_json::Value>(&body)
                .ok()
                .and_then(|v| v["method"].as_str().map(str::to_owned));
            let key = match rpc {
                Some(m) => format!("RPC {m}"),
                None => format!("{method} {path}"),
            };
            log.lock().unwrap().push(key.clone());
            let (status, json) = routes
                .iter()
                .find(|(k, _, _)| *k == key)
                .map(|(_, s, j)| (*s, *j))
                .unwrap_or((404, r#"{"message":"Not found"}"#));
            let _ = write!(
                stream,
                "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{json}",
                json.len()
            );
        }
    });
    Mock { base, seen }
}

fn net(base: &str) -> Net {
    Net::new(
        Endpoints {
            blockscout: base.into(),
            solana_rpc: base.into(),
            mempool: base.into(),
            trongrid: base.into(),
        },
        None,
    )
}

const ROUTER: &str = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

#[test]
fn evm_verified_contract() {
    let m = mock(vec![
        (
            "GET /api/v2/addresses/0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
            200,
            r#"{"is_contract":true,"is_verified":true,"name":"SwapRouter02"}"#,
        ),
        (
            "GET /api/v2/addresses/0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45/counters",
            200,
            r#"{"transactions_count":"1234567","token_transfers_count":"9"}"#,
        ),
    ]);
    let o = net(&m.base).lookup(&parse(ROUTER).unwrap()).unwrap();
    assert!(o.active && o.contract);
    assert_eq!(o.transactions, Some(1_234_567));
    assert_eq!(
        o.summary(),
        "1,234,567+ transactions · verified contract “SwapRouter02” · Ethereum via Blockscout"
    );
}

#[test]
fn evm_busy_address_asks_the_node() {
    // Blockscout fails the address record for the busiest contracts; its
    // node still says there is code at the address.
    let m = mock(vec![
        (
            "GET /api/v2/addresses/0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
            500,
            r#""Internal server error""#,
        ),
        (
            "RPC eth_getCode",
            200,
            r#"{"jsonrpc":"2.0","id":1,"result":"0x6080604052"}"#,
        ),
    ]);
    let o = net(&m.base).lookup(&parse(ROUTER).unwrap()).unwrap();
    assert!(o.active && o.contract);
    assert_eq!(o.summary(), "contract · Ethereum via Blockscout");
}

#[test]
fn evm_node_that_proves_nothing_is_an_error() {
    // No code, no nonce, no ether: tokens may still have arrived, so this
    // must not read as "never used".
    let m = mock(vec![
        (
            "GET /api/v2/addresses/0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
            503,
            "{}",
        ),
        (
            "RPC eth_getCode",
            200,
            r#"{"jsonrpc":"2.0","id":1,"result":"0x"}"#,
        ),
        (
            "RPC eth_getTransactionCount",
            200,
            r#"{"jsonrpc":"2.0","id":1,"result":"0x0"}"#,
        ),
        (
            "RPC eth_getBalance",
            200,
            r#"{"jsonrpc":"2.0","id":1,"result":"0x0"}"#,
        ),
    ]);
    let e = net(&m.base).lookup(&parse(ROUTER).unwrap()).unwrap_err();
    assert_eq!(e.to_string(), "Blockscout: HTTP 503");
}

#[test]
fn evm_failed_counters_keep_the_record() {
    let m = mock(vec![
        (
            "GET /api/v2/addresses/0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
            200,
            r#"{"is_contract":true,"is_verified":true,"name":"SwapRouter02"}"#,
        ),
        (
            "GET /api/v2/addresses/0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45/counters",
            500,
            r#""Internal server error""#,
        ),
    ]);
    let o = net(&m.base).lookup(&parse(ROUTER).unwrap()).unwrap();
    assert_eq!(o.transactions, None);
    assert_eq!(
        o.summary(),
        "verified contract “SwapRouter02” · Ethereum via Blockscout"
    );
}

#[test]
fn evm_unknown_address_is_never_used() {
    let m = mock(vec![]);
    let o = net(&m.base).lookup(&parse(ROUTER).unwrap()).unwrap();
    assert!(!o.active);
    assert_eq!(o.summary(), "Never used on chain · Ethereum via Blockscout");
}

#[test]
fn solana_counts_signatures() {
    let m = mock(vec![
        (
            "RPC getAccountInfo",
            200,
            r#"{"jsonrpc":"2.0","id":1,"result":{"value":{"executable":false,"lamports":5}}}"#,
        ),
        (
            "RPC getSignaturesForAddress",
            200,
            r#"{"jsonrpc":"2.0","id":1,"result":[{"signature":"a"},{"signature":"b"}]}"#,
        ),
    ]);
    let o = net(&m.base)
        .lookup(&parse("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").unwrap())
        .unwrap();
    assert_eq!((o.active, o.transactions, o.contract), (true, Some(2), false));
}

#[test]
fn bitcoin_and_errors() {
    let m = mock(vec![(
        "GET /api/address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        200,
        r#"{"chain_stats":{"tx_count":4000},"mempool_stats":{"tx_count":2}}"#,
    )]);
    let n = net(&m.base);
    let o = n
        .lookup(&parse("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").unwrap())
        .unwrap();
    assert_eq!(o.transactions, Some(4002));
    // A provider error is reported, not swallowed.
    assert!(
        n.lookup(&parse("34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo").unwrap())
            .is_err()
    );
}

#[test]
fn tron_contract() {
    let m = mock(vec![
        (
            "GET /v1/accounts/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
            200,
            r#"{"data":[{}],"success":true}"#,
        ),
        (
            "POST /wallet/getcontract",
            200,
            r#"{"contract_address":"41a614f8","name":"TetherToken"}"#,
        ),
        (
            "GET /v1/accounts/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/transactions",
            200,
            r#"{"data":[]}"#,
        ),
    ]);
    let o = net(&m.base)
        .lookup(&parse("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").unwrap())
        .unwrap();
    assert!(o.contract);
    assert_eq!(o.name.as_deref(), Some("TetherToken"));
}

#[test]
fn cache_answers_without_asking_again() {
    let m = mock(vec![]);
    let n = net(&m.base);
    let a = parse(ROUTER).unwrap();
    assert!(n.cached(&a).is_none());
    n.lookup(&a).unwrap();
    let asked = m.seen.lock().unwrap().len();
    n.lookup(&a).unwrap();
    assert_eq!(
        m.seen.lock().unwrap().len(),
        asked,
        "second lookup must come from the cache"
    );
    assert!(n.cached(&a).is_some());
}

#[test]
fn only_the_address_is_sent() {
    let m = mock(vec![]);
    net(&m.base).lookup(&parse(ROUTER).unwrap()).unwrap();
    for request in m.seen.lock().unwrap().iter() {
        assert!(request.contains(ROUTER), "unexpected request {request}");
    }
}

#[test]
fn thousands_separator() {
    assert_eq!(thousands(0), "0");
    assert_eq!(thousands(999), "999");
    assert_eq!(thousands(1000), "1,000");
    assert_eq!(thousands(1234567), "1,234,567");
}
