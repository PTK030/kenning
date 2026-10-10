//! `ken serve --stdio`: newline-delimited JSON-RPC 2.0 over stdin/stdout.
//!
//! Lets another process (a different desktop shell, an editor plugin, tests)
//! use Kenning without linking Rust. One request per line, one response per
//! line. Methods:
//!
//! * `recognize {text}`        – every address in `text`, nothing recorded
//! * `observe {text}`          – the single address in `text`, recorded in history
//! * `add {address, label, owner?, note?}`
//! * `remove {address}`
//! * `mark_mine {address, label}`
//! * `list {}`                 – personal and shared book entries
//! * `journal {limit?}`

use std::io::{BufRead, Write};

use kenning_core::{Entry, Kenning, Owner, extract, journal};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
struct Request {
    #[serde(default)]
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
}

pub fn run(mut k: Kenning) -> std::io::Result<()> {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Request>(&line) {
            Ok(req) => match handle(&mut k, &req.method, &req.params) {
                Ok(result) => json!({"jsonrpc": "2.0", "id": req.id, "result": result}),
                Err(message) => {
                    json!({"jsonrpc": "2.0", "id": req.id, "error": {"code": -32000, "message": message}})
                }
            },
            Err(e) => {
                json!({"jsonrpc": "2.0", "id": null, "error": {"code": -32700, "message": e.to_string()}})
            }
        };
        writeln!(stdout, "{response}")?;
        stdout.flush()?;
    }
    Ok(())
}

fn str_param<'a>(params: &'a Value, name: &str) -> Result<&'a str, String> {
    params
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("missing string parameter `{name}`"))
}

fn address_param(params: &Value) -> Result<kenning_core::Address, String> {
    kenning_core::parse(str_param(params, "address")?).map_err(|e| e.to_string())
}

fn handle(k: &mut Kenning, method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "recognize" => {
            let text = str_param(params, "text")?;
            let found: Vec<_> = extract::extract(text)
                .into_iter()
                .map(|f| k.recognize(&f.address))
                .collect();
            Ok(to_value(&found))
        }
        "observe" => {
            let text = str_param(params, "text")?;
            match extract::single(text) {
                Some(a) => Ok(to_value(&k.observe(&a).map_err(|e| e.to_string())?)),
                None => Ok(Value::Null),
            }
        }
        "add" => {
            let address = address_param(params)?;
            let label = str_param(params, "label")?;
            let owner = match params.get("owner").and_then(Value::as_str) {
                Some(o) => o.parse::<Owner>()?,
                None => Owner::Me,
            };
            let mut e = Entry::new(address, label, owner);
            e.note = params.get("note").and_then(Value::as_str).map(str::to_owned);
            e.source = Some("manual".into());
            let added = k.upsert(e).map_err(|e| e.to_string())?;
            Ok(json!({ "added": added }))
        }
        "remove" => {
            let address = address_param(params)?;
            let removed = k.remove(&address.key()).map_err(|e| e.to_string())?;
            Ok(json!({ "removed": removed.is_some() }))
        }
        "mark_mine" => {
            let address = address_param(params)?;
            let label = str_param(params, "label")?;
            k.mark_mine(&address, label).map_err(|e| e.to_string())?;
            Ok(json!({ "ok": true }))
        }
        "list" => {
            let mut books = vec![json!({
                "name": k.personal().name(),
                "writable": true,
                "entries": to_value(k.personal().entries()),
            })];
            for b in k.shared() {
                books.push(json!({ "name": b.name(), "writable": false, "entries": to_value(b.entries()) }));
            }
            Ok(Value::Array(books))
        }
        "journal" => {
            let limit = params.get("limit").and_then(Value::as_u64).unwrap_or(100) as usize;
            let records = journal::read(&k.journal_path()).map_err(|e| e.to_string())?;
            let start = records.len().saturating_sub(limit);
            Ok(to_value(&records[start..]))
        }
        other => Err(format!("unknown method `{other}`")),
    }
}

fn to_value<T: serde::Serialize + ?Sized>(v: &T) -> Value {
    serde_json::to_value(v).expect("serializable")
}
