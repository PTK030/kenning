//! On-chain lookups for the windows. Runs only when the user has turned the
//! network on; the lookup happens in the background after the badge or the
//! lookalike window is already showing, and fills in when it arrives.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use kenning_core::Address;
use kenning_net::{Endpoints, Net};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

/// What a window shows for one address.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Fact {
    Pending,
    Ok {
        summary: String,
        active: bool,
        onchain: Box<kenning_net::Onchain>,
    },
    Error {
        message: String,
    },
}

#[derive(Clone, Serialize)]
struct Update {
    address: String,
    fact: Fact,
}

#[derive(Default)]
pub struct OnchainState {
    net: Mutex<Option<Arc<Net>>>,
    facts: Mutex<HashMap<String, Fact>>,
}

impl OnchainState {
    pub fn get(&self, address: &str) -> Option<Fact> {
        self.facts.lock().unwrap().get(address).cloned()
    }

    /// Drop the client so the next lookup picks up new settings.
    pub fn reset(&self) {
        *self.net.lock().unwrap() = None;
    }
}

fn net(app: &AppHandle) -> Option<Arc<Net>> {
    let st = app.state::<AppState>();
    let (enabled, endpoints, home) = {
        let k = st.kenning.lock().unwrap();
        (
            k.config().network,
            Endpoints::from_config(k.config()),
            k.home().to_owned(),
        )
    };
    if !enabled {
        return None;
    }
    let mut slot = st.onchain.net.lock().unwrap();
    Some(
        slot.get_or_insert_with(|| {
            Arc::new(Net::new(endpoints, Some(home.join("net-cache.json"))))
        })
        .clone(),
    )
}

/// Look up `addresses` in the background (if the network is on) and tell
/// every window as each answer arrives.
pub fn spawn_lookup(app: &AppHandle, addresses: Vec<Address>) {
    let Some(net) = net(app) else { return };
    for address in addresses {
        let key = address.as_str().to_owned();
        let st = app.state::<AppState>();
        st.onchain
            .facts
            .lock()
            .unwrap()
            .insert(key.clone(), Fact::Pending);
        let _ = app.emit(
            "onchain",
            Update {
                address: key.clone(),
                fact: Fact::Pending,
            },
        );

        let app = app.clone();
        let net = net.clone();
        std::thread::spawn(move || {
            let fact = lookup_blocking(&net, &address);
            app.state::<AppState>()
                .onchain
                .facts
                .lock()
                .unwrap()
                .insert(key.clone(), fact.clone());
            let _ = app.emit("onchain", Update { address: key, fact });
        });
    }
}

fn lookup_blocking(net: &Net, address: &Address) -> Fact {
    match net.lookup(address) {
        Ok(o) => Fact::Ok {
            summary: o.summary(),
            active: o.active,
            onchain: Box::new(o),
        },
        Err(e) => Fact::Error {
            message: e.to_string(),
        },
    }
}

/// Synchronous lookup for the main window's Check view.
pub fn lookup_now(app: &AppHandle, address: &Address) -> Result<Fact, String> {
    let net = net(app).ok_or("The network is off. Turn it on in Settings to look addresses up.")?;
    let fact = lookup_blocking(&net, address);
    let key = address.as_str().to_owned();
    app.state::<AppState>()
        .onchain
        .facts
        .lock()
        .unwrap()
        .insert(key.clone(), fact.clone());
    let _ = app.emit(
        "onchain",
        Update {
            address: key,
            fact: fact.clone(),
        },
    );
    Ok(fact)
}
