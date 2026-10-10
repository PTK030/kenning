//! Public labels shipped with Kenning (see the `kenning-labels` crate).

use serde::{Deserialize, Serialize};

use crate::chain::{self, Address, Chain};
use crate::error::{Error, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LabelKind {
    Token,
    Contract,
    Program,
    Exchange,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Label {
    pub address: Address,
    pub name: String,
    pub kind: LabelKind,
    pub source: String,
}

#[derive(Deserialize)]
struct LabelFile {
    #[serde(rename = "label")]
    labels: Vec<RawLabel>,
}

#[derive(Deserialize)]
struct RawLabel {
    address: String,
    name: String,
    kind: LabelKind,
    source: String,
}

/// Parse one labels file for `chain`.
pub fn parse(chain: Chain, text: &str) -> Result<Vec<Label>> {
    let file: LabelFile = toml::from_str(text).map_err(|e| Error::Invalid(format!("{chain} labels: {e}")))?;
    file.labels
        .into_iter()
        .map(|raw| {
            let address = chain::parse_on(chain, &raw.address)
                .map_err(|e| Error::Invalid(format!("{chain} label `{}`: {e}", raw.name)))?;
            if raw.source.trim().is_empty() {
                return Err(Error::Invalid(format!(
                    "{chain} label `{}` has no source",
                    raw.name
                )));
            }
            Ok(Label {
                address,
                name: raw.name,
                kind: raw.kind,
                source: raw.source,
            })
        })
        .collect()
}

/// All labels embedded in this build.
pub fn builtin() -> Vec<Label> {
    kenning_labels::FILES
        .iter()
        .flat_map(|f| {
            let chain: Chain = f.chain.parse().expect("label file chain is valid");
            parse(chain, f.toml).expect("embedded labels are validated by tests")
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn embedded_labels_are_valid_and_unique() {
        let mut seen = HashSet::new();
        for f in kenning_labels::FILES {
            let chain: Chain = f.chain.parse().unwrap();
            let labels = parse(chain, f.toml).unwrap_or_else(|e| panic!("{e}"));
            assert!(!labels.is_empty(), "{chain} has no labels");
            for l in labels {
                assert!(seen.insert(l.address.key()), "duplicate label {}", l.address);
                assert!(
                    l.source.starts_with("https://"),
                    "{}: source must be a URL",
                    l.name
                );
            }
        }
    }
}
