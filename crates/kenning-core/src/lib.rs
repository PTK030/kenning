//! Kenning core: recognises crypto addresses and spots lookalikes.
//!
//! This crate performs no network I/O. `deny.toml` keeps it that way.

pub mod book;
pub mod chain;
pub mod classify;
pub mod config;
pub mod diff;
pub mod error;
pub mod extract;
mod fsutil;
pub mod history;
pub mod interop;
pub mod journal;
mod kenning;
pub mod labels;
pub mod lookalike;
pub mod message;
pub mod secret;

pub use book::{Book, Entry, Owner};
pub use chain::{Address, AddressKey, Chain, ParseError, parse};
pub use classify::{KnownKind, LookalikeMatch, Recognition, Recognizer, State};
pub use config::{ClipboardMode, Config, Keys};
pub use error::{Error, Result};
pub use history::{Contact, History};
pub use kenning::{Kenning, default_home};
