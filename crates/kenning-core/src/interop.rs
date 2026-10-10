//! CSV import and export.
//!
//! Export columns: `chain,address,label,owner,note`.
//! Import accepts that format and the Safe{Wallet} address book export
//! (`address,name,chainId`), which is always EVM.

use crate::book::{Entry, Owner};
use crate::chain::{self, Chain};
use crate::error::{Error, Result};

#[derive(Debug, Default)]
pub struct Imported {
    pub entries: Vec<Entry>,
    /// Rows that could not be imported, with a reason (1-based row numbers,
    /// header excluded).
    pub skipped: Vec<(usize, String)>,
}

pub fn export_csv(entries: &[Entry]) -> String {
    let mut w = csv::Writer::from_writer(Vec::new());
    w.write_record(["chain", "address", "label", "owner", "note"])
        .expect("in-memory write");
    for e in entries {
        w.write_record([
            e.address.chain().as_str(),
            e.address.as_str(),
            &e.label,
            e.owner.as_str(),
            e.note.as_deref().unwrap_or(""),
        ])
        .expect("in-memory write");
    }
    String::from_utf8(w.into_inner().expect("in-memory flush")).expect("csv is utf-8")
}

/// Parse CSV in either supported format. `default_owner` applies to rows that
/// do not say (Safe exports never do).
pub fn import_csv(text: &str, default_owner: Owner) -> Result<Imported> {
    let mut r = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(text.as_bytes());
    let headers: Vec<String> = r
        .headers()
        .map_err(|e| Error::Invalid(format!("CSV header: {e}")))?
        .iter()
        .map(|h| h.to_ascii_lowercase())
        .collect();
    let col = |name: &str| headers.iter().position(|h| h == name);

    let address_col = col("address").ok_or_else(|| Error::Invalid("CSV needs an `address` column".into()))?;
    let label_col = col("label")
        .or_else(|| col("name"))
        .ok_or_else(|| Error::Invalid("CSV needs a `label` or `name` column".into()))?;
    let chain_col = col("chain");
    let safe_format = chain_col.is_none() && col("chainid").is_some();
    let owner_col = col("owner");
    let note_col = col("note");

    let mut out = Imported::default();
    for (i, row) in r.records().enumerate() {
        let n = i + 1;
        let row = match row {
            Ok(row) => row,
            Err(e) => {
                out.skipped.push((n, e.to_string()));
                continue;
            }
        };
        let get = |c: Option<usize>| c.and_then(|c| row.get(c)).filter(|s| !s.is_empty());
        let Some(raw) = get(Some(address_col)) else {
            out.skipped.push((n, "empty address".into()));
            continue;
        };
        let parsed = match get(chain_col) {
            Some(c) => match c.parse::<Chain>() {
                Ok(chain) => chain::parse_on(chain, raw),
                Err(e) => {
                    out.skipped.push((n, e));
                    continue;
                }
            },
            None if safe_format => chain::parse_on(Chain::Evm, raw),
            None => chain::parse(raw),
        };
        let address = match parsed {
            Ok(a) => a,
            Err(e) => {
                out.skipped.push((n, format!("`{raw}`: {e}")));
                continue;
            }
        };
        let Some(label) = get(Some(label_col)) else {
            out.skipped.push((n, "empty label".into()));
            continue;
        };
        let owner = match get(owner_col).map(str::parse::<Owner>) {
            Some(Ok(o)) => o,
            Some(Err(e)) => {
                out.skipped.push((n, e));
                continue;
            }
            None => default_owner,
        };
        let mut entry = Entry::new(address, label, owner);
        entry.note = get(note_col).map(str::to_owned);
        entry.source = Some(if safe_format {
            "import: safe".into()
        } else {
            "import: csv".into()
        });
        out.entries.push(entry);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let csv = "chain,address,label,owner,note\n\
                   evm,0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed,\"Binance, deposits\",me,main\n\
                   tron,TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t,USDT,contact,\n";
        let imported = import_csv(csv, Owner::Me).unwrap();
        assert!(imported.skipped.is_empty(), "{:?}", imported.skipped);
        assert_eq!(imported.entries.len(), 2);
        assert_eq!(imported.entries[0].label, "Binance, deposits");
        assert_eq!(imported.entries[1].owner, Owner::Contact);

        let again = import_csv(&export_csv(&imported.entries), Owner::Me).unwrap();
        assert_eq!(again.entries.len(), 2);
        assert_eq!(again.entries[0].note.as_deref(), Some("main"));
    }

    #[test]
    fn safe_export_format() {
        let csv = "address,name,chainId\n\
                   0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed,Payroll,1\n\
                   0xnotanaddress,Broken,1\n";
        let imported = import_csv(csv, Owner::Team).unwrap();
        assert_eq!(imported.entries.len(), 1);
        assert_eq!(imported.entries[0].owner, Owner::Team);
        assert_eq!(
            imported.entries[0].address.as_str(),
            "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
        );
        assert_eq!(imported.skipped.len(), 1);
        assert_eq!(imported.skipped[0].0, 2);
    }
}
