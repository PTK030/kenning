//! `ken`: know what you copied.
//!
//! Exit codes: 0 known (yours, team, contact, public), 10 unknown (new or seen),
//! 20 lookalike, 2 usage or input error, 1 other error. `ken diff` exits 0 when
//! the addresses are the same and 1 when they differ.

mod render;
mod serve;

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use anstream::{eprintln, stdout};
use clap::{Parser, Subcommand};
use kenning_core::interop;
use kenning_core::journal::{self, Action};
use kenning_core::{Chain, Entry, Kenning, Owner, ParseError, State, extract, lookalike};

use render::{BOLD, DIM};

#[derive(Parser)]
#[command(
    name = "ken",
    version,
    about = "Know what you copied. Names every crypto address and spots lookalikes. Local-only.",
    args_conflicts_with_subcommands = true,
    after_help = "Examples:\n  ken 0x28C6c06298d514Db089934071355E5743bf21d60\n  ken add 0x28C6…1d60 Binance --note \"my deposits\"\n  cast logs … | ken check -"
)]
struct Cli {
    /// Output JSON instead of text.
    #[arg(long, global = true)]
    json: bool,

    /// Also ask the chain about each address (transactions, contract).
    /// Sends only the address to the providers listed by `ken paths`.
    #[arg(long, global = true)]
    online: bool,

    /// Kenning directory (default: ~/.kenning, or $KENNING_HOME).
    #[arg(long, global = true, value_name = "DIR")]
    home: Option<PathBuf>,

    #[command(subcommand)]
    command: Option<Command>,

    /// An address, or any text containing addresses.
    #[arg(value_name = "ADDRESS|TEXT")]
    input: Vec<String>,
}

#[derive(Subcommand)]
enum Command {
    /// Add an address to your book, or rename it.
    Add {
        address: String,
        label: String,
        #[arg(long, default_value = "me", value_parser = parse_owner)]
        owner: Owner,
        #[arg(long)]
        note: Option<String>,
    },
    /// Remove an address from your book.
    Rm { address: String },
    /// List your book (and shared books).
    Ls {
        #[arg(long, value_parser = parse_chain)]
        chain: Option<Chain>,
        /// Also list the built-in public labels.
        #[arg(long)]
        public: bool,
    },
    /// Open book.toml in your editor, then check it.
    Edit,
    /// Find and recognise every address in a file or stdin (`-`).
    Check {
        #[arg(default_value = "-")]
        file: String,
    },
    /// Compare two addresses character by character.
    Diff { a: String, b: String },
    /// Import a CSV (Kenning's own format or a Safe address book export).
    Import {
        file: PathBuf,
        /// Owner for rows that do not specify one.
        #[arg(long, default_value = "me", value_parser = parse_owner)]
        owner: Owner,
    },
    /// Export your book as CSV.
    Export {
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Show the verification journal.
    Log {
        #[arg(short = 'n', long, default_value_t = 30)]
        limit: usize,
    },
    /// Show where Kenning keeps its files.
    Paths,
    /// Speak JSON-RPC over stdin/stdout (for other programs).
    Serve {
        #[arg(long, required = true)]
        stdio: bool,
    },
}

fn parse_owner(s: &str) -> Result<Owner, String> {
    s.parse()
}

fn parse_chain(s: &str) -> Result<Chain, String> {
    s.parse()
}

/// Error type for the CLI: a message and an exit code.
struct Fail(u8, String);

impl From<kenning_core::Error> for Fail {
    fn from(e: kenning_core::Error) -> Self {
        Fail(1, e.to_string())
    }
}

impl From<std::io::Error> for Fail {
    fn from(e: std::io::Error) -> Self {
        Fail(1, e.to_string())
    }
}

fn usage(msg: impl Into<String>) -> Fail {
    Fail(2, msg.into())
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(code) => ExitCode::from(code),
        Err(Fail(code, msg)) => {
            eprintln!("ken: {msg}");
            ExitCode::from(code)
        }
    }
}

fn open(cli: &Cli) -> Result<Kenning, Fail> {
    let k = match &cli.home {
        Some(home) => Kenning::open_at(home.clone())?,
        None => Kenning::open()?,
    };
    for w in k.warnings() {
        eprintln!("ken: warning: {w}");
    }
    Ok(k)
}

fn parse_address(s: &str) -> Result<kenning_core::Address, Fail> {
    kenning_core::parse(s).map_err(|e| match e {
        ParseError::BadChecksum { .. } => usage(format!("{s}: {e}. Check the address for typos.")),
        ParseError::NotAnAddress => usage(format!("`{s}` is not an address Kenning recognises")),
    })
}

fn print_json(value: &impl serde::Serialize) -> Result<(), Fail> {
    let mut out = stdout().lock();
    serde_json::to_writer_pretty(&mut out, value).map_err(|e| Fail(1, e.to_string()))?;
    writeln!(out)?;
    Ok(())
}

fn worst(states: impl IntoIterator<Item = State>) -> u8 {
    states.into_iter().map(|s| s.exit_code()).max().unwrap_or(0) as u8
}

fn run(cli: Cli) -> Result<u8, Fail> {
    let Some(command) = &cli.command else {
        return cmd_recognize(&cli);
    };
    match command {
        Command::Add {
            address,
            label,
            owner,
            note,
        } => {
            let mut k = open(&cli)?;
            let address = parse_address(address)?;
            let mut e = Entry::new(address.clone(), label.as_str(), *owner);
            e.note = note.clone();
            e.source = Some("manual".into());
            let added = k.upsert(e)?;
            let r = k.recognize(&address);
            k.journal(Action::Added, &r)?;
            if cli.json {
                print_json(&r)?;
            } else {
                let verb = if added { "Added" } else { "Updated" };
                let mut out = stdout().lock();
                writeln!(
                    out,
                    "{verb} {BOLD}{label}{BOLD:#}  {DIM}{}{DIM:#}",
                    address.grouped()
                )?;
            }
            Ok(0)
        }
        Command::Rm { address } => {
            let mut k = open(&cli)?;
            let address = parse_address(address)?;
            let r = k.recognize(&address);
            match k.remove(&address.key())? {
                Some(e) => {
                    k.journal(Action::Removed, &r)?;
                    if !cli.json {
                        let mut out = stdout().lock();
                        writeln!(out, "Removed {BOLD}{}{BOLD:#}", e.label)?;
                    }
                    Ok(0)
                }
                None => Err(usage(format!("{} is not in your book", address.short()))),
            }
        }
        Command::Ls { chain, public } => cmd_ls(&cli, *chain, *public),
        Command::Edit => cmd_edit(&cli),
        Command::Check { file } => cmd_check(&cli, file),
        Command::Diff { a, b } => cmd_diff(&cli, a, b),
        Command::Import { file, owner } => {
            let mut k = open(&cli)?;
            let text =
                std::fs::read_to_string(file).map_err(|e| Fail(1, format!("{}: {e}", file.display())))?;
            let imported = interop::import_csv(&text, *owner)?;
            let total = imported.entries.len();
            let added = k.upsert_many(imported.entries)?;
            if cli.json {
                print_json(&serde_json::json!({
                    "added": added,
                    "updated": total - added,
                    "skipped": imported.skipped.iter().map(|(row, why)| serde_json::json!({"row": row, "reason": why})).collect::<Vec<_>>(),
                }))?;
            } else {
                let mut out = stdout().lock();
                writeln!(
                    out,
                    "Imported {total} entries: {added} new, {} updated.",
                    total - added
                )?;
                for (row, why) in &imported.skipped {
                    writeln!(out, "  {DIM}row {row} skipped: {why}{DIM:#}")?;
                }
            }
            Ok(if imported.skipped.is_empty() { 0 } else { 2 })
        }
        Command::Export { output } => {
            let k = open(&cli)?;
            let csv = interop::export_csv(k.personal().entries());
            match output {
                Some(path) => {
                    std::fs::write(path, csv).map_err(|e| Fail(1, format!("{}: {e}", path.display())))?
                }
                None => stdout().lock().write_all(csv.as_bytes())?,
            }
            Ok(0)
        }
        Command::Log { limit } => {
            let k = open(&cli)?;
            let records = journal::read(&k.journal_path())?;
            let records = &records[records.len().saturating_sub(*limit)..];
            if cli.json {
                print_json(&records)?;
            } else if records.is_empty() {
                writeln!(stdout().lock(), "The journal is empty.")?;
            } else {
                let mut out = stdout().lock();
                for r in records {
                    let at = r.at.strftime("%Y-%m-%d %H:%M");
                    let address = kenning_core::chain::parse_on(r.chain, &r.address)
                        .map(|a| a.short())
                        .unwrap_or_else(|_| r.address.clone());
                    writeln!(
                        out,
                        "{DIM}{at}{DIM:#}  {:<10} {:<16} {:<10} {address}  {}",
                        r.user,
                        r.action.as_str(),
                        r.state,
                        r.label.as_deref().unwrap_or("")
                    )?;
                }
            }
            Ok(0)
        }
        Command::Paths => {
            let k = open(&cli)?;
            let mut out = stdout().lock();
            writeln!(out, "home     {}", k.home().display())?;
            writeln!(out, "book     {}", k.book_path().display())?;
            writeln!(out, "config   {}", k.home().join("config.toml").display())?;
            writeln!(out, "history  {}", k.home().join("history.json").display())?;
            writeln!(out, "journal  {}", k.journal_path().display())?;
            for b in k.shared() {
                writeln!(
                    out,
                    "shared   {}",
                    b.path().map(|p| p.display().to_string()).unwrap_or_default()
                )?;
            }
            let state = if k.config().network {
                "on"
            } else {
                "off (use --online per command)"
            };
            writeln!(out, "\nnetwork  {state}")?;
            for (host, why) in kenning_net::Endpoints::from_config(k.config()).hosts() {
                writeln!(out, "  {host:<30} {DIM}{why}{DIM:#}")?;
            }
            Ok(0)
        }
        Command::Serve { .. } => {
            let k = open(&cli)?;
            serve::run(k)?;
            Ok(0)
        }
    }
}

/// `ken <address|text>`: full card for each address.
fn cmd_recognize(cli: &Cli) -> Result<u8, Fail> {
    if cli.input.is_empty() {
        return Err(usage(
            "give an address (or text containing one). Try `ken --help`.",
        ));
    }
    let text = cli.input.join(" ");
    let addresses: Vec<_> = match extract::single(&text) {
        Some(a) => vec![a],
        None => {
            let found: Vec<_> = extract::extract(&text).into_iter().map(|f| f.address).collect();
            if found.is_empty() {
                // Give the precise reason for a single token (bad checksum).
                if cli.input.len() == 1 {
                    parse_address(&cli.input[0])?;
                }
                return Err(usage("no address found"));
            }
            found
        }
    };
    let k = open(cli)?;
    let results: Vec<_> = addresses.iter().map(|a| k.recognize(a)).collect();
    for r in &results {
        k.journal(Action::Checked, r)?;
    }
    // On-chain facts only with --online, or when the network is turned on
    // in settings.
    let onchain: Vec<Option<Result<kenning_net::Onchain, String>>> = if cli.online || k.config().network {
        let net = kenning_net::Net::new(
            kenning_net::Endpoints::from_config(k.config()),
            Some(k.home().join("net-cache.json")),
        );
        results
            .iter()
            .map(|r| Some(net.lookup(&r.address).map_err(|e| e.to_string())))
            .collect()
    } else {
        vec![None; results.len()]
    };
    if cli.json {
        let items: Vec<_> = results
            .iter()
            .zip(&onchain)
            .map(|(r, o)| {
                let mut v = serde_json::to_value(r).expect("serializable");
                if let Some(o) = o {
                    v["onchain"] = match o {
                        Ok(o) => serde_json::to_value(o).expect("serializable"),
                        Err(e) => serde_json::json!({ "error": e }),
                    };
                }
                v
            })
            .collect();
        if items.len() == 1 {
            print_json(&items[0])?;
        } else {
            print_json(&items)?;
        }
    } else {
        let mut out = stdout().lock();
        for (i, (r, o)) in results.iter().zip(&onchain).enumerate() {
            if i > 0 {
                writeln!(out)?;
            }
            render::card(&mut out, r)?;
            match o {
                Some(Ok(o)) => writeln!(out, "  {DIM}on chain:{DIM:#} {}", o.summary())?,
                Some(Err(e)) => writeln!(out, "  {DIM}on chain: lookup failed: {e}{DIM:#}")?,
                None => {}
            }
        }
    }
    Ok(worst(results.iter().map(|r| r.state)))
}

fn cmd_check(cli: &Cli, file: &str) -> Result<u8, Fail> {
    let text = if file == "-" {
        let mut s = String::new();
        std::io::stdin().read_to_string(&mut s)?;
        s
    } else {
        std::fs::read_to_string(file).map_err(|e| Fail(1, format!("{file}: {e}")))?
    };
    let k = open(cli)?;
    let results: Vec<_> = extract::extract(&text)
        .into_iter()
        .map(|f| k.recognize(&f.address))
        .collect();
    if cli.json {
        print_json(&results)?;
    } else {
        let mut out = stdout().lock();
        for r in &results {
            render::line(&mut out, r)?;
        }
    }
    Ok(worst(results.iter().map(|r| r.state)))
}

fn cmd_diff(cli: &Cli, a: &str, b: &str) -> Result<u8, Fail> {
    let a = parse_address(a)?;
    let b = parse_address(b)?;
    if a.chain() != b.chain() {
        return Err(usage(format!(
            "different chains: {} and {}",
            a.chain().display_name(),
            b.chain().display_name()
        )));
    }
    let ab = lookalike::compare(&a, &b);
    let ba = lookalike::compare(&b, &a);
    let same = a.key() == b.key();
    if cli.json {
        print_json(&serde_json::json!({
            "same": same,
            "similarity": ab,
            "a": kenning_core::diff::spans(&a, &b, &ab),
            "b": kenning_core::diff::spans(&b, &a, &ba),
        }))?;
    } else {
        let mut out = stdout().lock();
        write!(out, "  a  ")?;
        render::spans(&mut out, &a, &kenning_core::diff::spans(&a, &b, &ab))?;
        writeln!(out)?;
        write!(out, "  b  ")?;
        render::spans(&mut out, &b, &kenning_core::diff::spans(&b, &a, &ba))?;
        writeln!(out)?;
        if same {
            writeln!(out, "\nSame address.")?;
        } else {
            writeln!(
                out,
                "\nDifferent addresses. Matches {} + {} characters, {} differ.",
                ab.same_prefix, ab.same_suffix, ab.differing
            )?;
        }
    }
    Ok(if same { 0 } else { 1 })
}

fn cmd_ls(cli: &Cli, chain: Option<Chain>, public: bool) -> Result<u8, Fail> {
    let k = open(cli)?;
    let keep = |c: Chain| chain.is_none_or(|x| x == c);
    if cli.json {
        let mut books = vec![serde_json::json!({
            "name": k.personal().name(),
            "path": k.book_path(),
            "entries": k.personal().entries().iter().filter(|e| keep(e.address.chain())).collect::<Vec<_>>(),
        })];
        for b in k.shared() {
            books.push(serde_json::json!({
                "name": b.name(),
                "path": b.path(),
                "entries": b.entries().iter().filter(|e| keep(e.address.chain())).collect::<Vec<_>>(),
            }));
        }
        if public {
            books.push(serde_json::json!({
                "name": "public",
                "entries": k.labels().iter().filter(|l| keep(l.address.chain())).collect::<Vec<_>>(),
            }));
        }
        print_json(&books)?;
        return Ok(0);
    }

    let mut out = stdout().lock();
    let books = std::iter::once(k.personal()).chain(k.shared());
    let mut any = false;
    for b in books {
        let mut entries: Vec<&Entry> = b.entries().iter().filter(|e| keep(e.address.chain())).collect();
        if entries.is_empty() {
            continue;
        }
        entries.sort_by(|x, y| {
            (x.address.chain(), x.label.to_lowercase()).cmp(&(y.address.chain(), y.label.to_lowercase()))
        });
        any = true;
        let title = if b.is_writable() {
            "Your book".to_owned()
        } else {
            format!("Shared book: {}", b.name())
        };
        let n = entries.len();
        writeln!(
            out,
            "{BOLD}{title}{BOLD:#}  {DIM}{n} entr{}{DIM:#}",
            if n == 1 { "y" } else { "ies" }
        )?;
        for e in entries {
            let note = e.note.as_deref().map(|n| format!(" · {n}")).unwrap_or_default();
            writeln!(
                out,
                "  {:<8} {:<44} {}{DIM}{note} · {}{DIM:#}",
                e.address.chain().as_str(),
                e.address.as_str(),
                e.label,
                e.owner.as_str()
            )?;
        }
        writeln!(out)?;
    }
    if public {
        any = true;
        writeln!(out, "{BOLD}Public labels{BOLD:#}  {DIM}built in{DIM:#}")?;
        for l in k.labels().iter().filter(|l| keep(l.address.chain())) {
            writeln!(
                out,
                "  {:<8} {:<44} {}",
                l.address.chain().as_str(),
                l.address.as_str(),
                l.name
            )?;
        }
    }
    if !any {
        writeln!(
            out,
            "Your book is empty. Add an address with:\n  ken add <address> <label>\n{DIM}Book: {}{DIM:#}",
            k.book_path().display()
        )?;
    }
    Ok(0)
}

fn cmd_edit(cli: &Cli) -> Result<u8, Fail> {
    let k = open(cli)?;
    let path = k.book_path();
    if !path.exists() {
        k.personal().save()?;
    }
    let editor = std::env::var("VISUAL")
        .or_else(|_| std::env::var("EDITOR"))
        .unwrap_or_else(|_| {
            if cfg!(windows) {
                "notepad".into()
            } else {
                "vi".into()
            }
        });
    let status = std::process::Command::new(&editor)
        .arg(&path)
        .status()
        .map_err(|e| Fail(1, format!("could not start `{editor}`: {e}")))?;
    if !status.success() {
        return Err(Fail(1, format!("`{editor}` exited with {status}")));
    }
    match kenning_core::Book::load_personal(&path) {
        Ok(b) => {
            writeln!(stdout().lock(), "Book OK: {} entries.", b.entries().len())?;
            Ok(0)
        }
        Err(e) => Err(usage(format!(
            "the book has a problem, fix it and run `ken edit` again:\n  {e}"
        ))),
    }
}
