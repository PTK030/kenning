//! Commands the web UI may call. This is the whole surface between the UI and
//! the system: the UI has no clipboard, file system or network permission of
//! its own.

use std::path::PathBuf;
use std::sync::atomic::Ordering;

use kenning_core::journal::{self, Action};
use kenning_core::{
    Chain, ClipboardMode, Config, Edit, Entry, Owner, Recognition, diff, extract, interop, lookalike,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::onchain::{self, Fact};
use crate::state::{AppState, BadgeView, DetailsView};
use crate::guard::{self, Event};
use crate::{clipboard, flow, hotkey, platform, tray, ui};

type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Serialize)]
pub struct Overview {
    version: &'static str,
    config: Config,
    paused: bool,
    home: PathBuf,
    book_path: PathBuf,
    book_count: usize,
    shared_books: Vec<String>,
    public_label_count: usize,
    history_count: usize,
    warnings: Vec<String>,
    /// Hosts contacted when the network is on, and why, as the settings
    /// stand.
    hosts: Vec<(String, String)>,
    /// The EVM networks that can be chosen: id, name, the host asked.
    evm_choices: Vec<(&'static str, &'static str, &'static str)>,
    update_hosts: Vec<(&'static str, &'static str)>,
}

#[derive(Serialize)]
pub struct BookView {
    name: String,
    writable: bool,
    path: Option<PathBuf>,
    entries: Vec<Entry>,
}

#[derive(Serialize)]
pub struct LookalikeView {
    recognition: Recognition,
    variant: usize,
    sounds: bool,
}

#[tauri::command]
pub fn overview(state: State<AppState>) -> Overview {
    let k = state.kenning.lock().unwrap();
    Overview {
        version: env!("CARGO_PKG_VERSION"),
        config: k.config().clone(),
        paused: state.paused.load(Ordering::SeqCst),
        home: k.home().to_owned(),
        book_path: k.book_path(),
        book_count: k.personal().entries().len(),
        shared_books: k.shared().iter().map(|b| b.name().to_owned()).collect(),
        public_label_count: k.labels().len(),
        history_count: k.history().len(),
        warnings: k.warnings().to_vec(),
        hosts: kenning_net::Endpoints::from_config(k.config()).hosts(),
        evm_choices: kenning_net::EVM_NETWORKS
            .iter()
            .map(|(id, name, source)| (*id, *name, source.url()))
            .collect(),
        update_hosts: crate::update::HOSTS.to_vec(),
    }
}

/// The badge page asks for its content once loaded; this also reveals the
/// window, so a freshly created badge never shows an empty frame.
#[tauri::command]
pub fn get_badge(app: AppHandle, state: State<AppState>) -> Option<BadgeView> {
    let badge = state.badge.lock().unwrap().clone();
    ui::badge_ready(&app);
    badge
}

#[tauri::command]
pub fn hide_badge(app: AppHandle) {
    ui::pause_badge(&app);
    ui::hide_badge(&app);
}

/// Pointer over the badge: hold it.
#[tauri::command]
pub fn badge_pause(app: AppHandle) {
    ui::pause_badge(&app);
}

/// Pointer left the badge: hide it after the time that was left.
#[tauri::command]
pub fn badge_resume(app: AppHandle, remaining_ms: u64) {
    ui::schedule_hide(
        &app,
        std::time::Duration::from_millis(remaining_ms.clamp(600, 10_000)),
    );
}

#[tauri::command]
pub fn get_lookalike(state: State<AppState>) -> Option<LookalikeView> {
    let sounds = state.kenning.lock().unwrap().config().sounds;
    state
        .lookalike
        .lock()
        .unwrap()
        .clone()
        .map(|recognition| LookalikeView {
            recognition,
            variant: state.lookalike_variant.load(Ordering::SeqCst) % 3,
            sounds,
        })
}

/// "Copy the correct address": the one deliberate clipboard write.
#[tauri::command]
pub fn copy_correct(app: AppHandle, state: State<AppState>) -> Res<()> {
    let r = state
        .lookalike
        .lock()
        .unwrap()
        .clone()
        .ok_or("nothing to correct")?;
    let m = r.lookalike.as_ref().ok_or("nothing to correct")?;
    clipboard::write(m.known.as_str())?;
    state
        .kenning
        .lock()
        .unwrap()
        .journal(Action::CopiedCorrect, &r)
        .map_err(err)?;
    ui::close_lookalike(&app);
    Ok(())
}

/// "This is mine": remember the copied address under `label`.
#[tauri::command]
pub fn mark_mine(app: AppHandle, state: State<AppState>, label: String) -> Res<()> {
    let label = label.trim();
    if label.is_empty() {
        return Err("Give it a name.".into());
    }
    let r = state.lookalike.lock().unwrap().clone().ok_or("nothing to save")?;
    state
        .kenning
        .lock()
        .unwrap()
        .mark_mine(&r.address, label)
        .map_err(err)?;
    ui::close_lookalike(&app);
    crate::flow::info(&app, &format!("Saved as “{label}”."));
    Ok(())
}

#[tauri::command]
pub fn dismiss_lookalike(app: AppHandle) {
    ui::close_lookalike(&app);
}

#[tauri::command]
pub fn get_details(state: State<AppState>) -> Option<DetailsView> {
    state.details.lock().unwrap().clone()
}

/// The lookalike page measured itself; see `ui::fit_lookalike`.
#[tauri::command]
pub fn fit_lookalike(app: AppHandle, height: f64, reveal: bool) {
    ui::fit_lookalike(&app, height, reveal);
}

/// The details page measured itself; see `ui::fit_details`.
#[tauri::command]
pub fn fit_details(app: AppHandle, height: f64, reveal: bool) {
    ui::fit_details(&app, height, reveal);
}

#[tauri::command]
pub fn close_details(app: AppHandle) {
    ui::close_details(&app);
}

fn details_address(state: &State<AppState>) -> Res<kenning_core::Address> {
    state
        .details
        .lock()
        .unwrap()
        .as_ref()
        .map(|d| d.recognition.address.clone())
        .ok_or_else(|| "nothing to show".into())
}

/// "Copy address" in the details window: an explicit click.
#[tauri::command]
pub fn copy_details_address(app: AppHandle, state: State<AppState>) -> Res<()> {
    let address = details_address(&state)?;
    clipboard::write(address.as_str())?;
    ui::close_details(&app);
    // In watch mode the copy itself brings up the badge.
    if state.kenning.lock().unwrap().config().clipboard != ClipboardMode::Watch {
        crate::flow::info(&app, "Address copied.");
    }
    Ok(())
}

/// "Add to book" in the details window. The window stays and shows the
/// address under its new name.
#[tauri::command]
pub fn add_details_address(state: State<AppState>, label: String, owner: Owner) -> Res<DetailsView> {
    let label = label.trim();
    if label.is_empty() {
        return Err("Give it a name.".into());
    }
    let address = details_address(&state)?;
    let mut e = Entry::new(address.clone(), label, owner);
    e.source = Some("manual".into());
    let r = {
        let mut k = state.kenning.lock().unwrap();
        k.upsert(e).map_err(err)?;
        let r = k.recognize(&address);
        k.journal(Action::Added, &r).map_err(err)?;
        r
    };
    let mut details = state.details.lock().unwrap();
    let view = details.as_mut().ok_or("nothing to show")?;
    view.recognition = r;
    Ok(view.clone())
}

/// Open the address in the chain's public explorer, in the browser: the one
/// given, or else the details window's.
#[tauri::command]
pub fn open_explorer(app: AppHandle, state: State<AppState>, address: Option<String>) -> Res<()> {
    let address = match address {
        Some(a) => kenning_core::parse(&a).map_err(err)?,
        None => details_address(&state)?,
    };
    let a = address.as_str();
    let url = match address.chain() {
        Chain::Evm => format!("https://etherscan.io/address/{a}"),
        Chain::Solana => format!("https://solscan.io/account/{a}"),
        Chain::Bitcoin => format!("https://mempool.space/address/{a}"),
        Chain::Tron => format!("https://tronscan.org/#/address/{a}"),
    };
    app.opener().open_url(url, None::<&str>).map_err(err)
}

#[tauri::command]
pub fn list_books(state: State<AppState>) -> Vec<BookView> {
    let k = state.kenning.lock().unwrap();
    std::iter::once(k.personal())
        .chain(k.shared())
        .map(|b| BookView {
            name: b.name().to_owned(),
            writable: b.is_writable(),
            path: b.path().map(ToOwned::to_owned),
            entries: b.entries().to_vec(),
        })
        .collect()
}

/// Check addresses typed or pasted into the main window. Nothing recorded.
#[tauri::command]
pub fn recognize_text(state: State<AppState>, text: String) -> Vec<Recognition> {
    let k = state.kenning.lock().unwrap();
    extract::extract(&text)
        .into_iter()
        .map(|f| k.recognize(&f.address))
        .collect()
}

/// Two addresses side by side, character by character, as `ken diff`.
#[derive(Serialize)]
pub struct Comparison {
    same: bool,
    chain: Chain,
    similarity: lookalike::Similarity,
    a_grouped: String,
    b_grouped: String,
    a_spans: Vec<diff::Span>,
    b_spans: Vec<diff::Span>,
}

/// Why two addresses could not be compared: which box (`used`, `expected`,
/// or none for both) and what is wrong, for the page to say in its words.
/// `message` says it in a sentence, for anything that only shows text.
#[derive(Debug, Serialize)]
pub struct CompareProblem {
    field: Option<&'static str>,
    /// `checksum`, `not_address` or `chains`.
    kind: &'static str,
    /// The chain of the box at fault (`checksum`), or of each box (`chains`).
    chains: Vec<Chain>,
    message: String,
}

/// Check: the address someone expects against the one in front of them.
/// `a` is the one about to be used, `b` the one expected. Comparing is not
/// checking either against the book: nothing is recorded.
#[tauri::command]
pub fn compare_addresses(a: String, b: String) -> Result<Comparison, CompareProblem> {
    let a = one_address(&a, "used", "The address you are about to use")?;
    let b = one_address(&b, "expected", "The address you expected")?;
    if a.chain() != b.chain() {
        return Err(CompareProblem {
            field: None,
            kind: "chains",
            chains: vec![a.chain(), b.chain()],
            message: format!("These are on different chains: {} and {}.", a.chain().display_name(), b.chain().display_name()),
        });
    }
    let ab = lookalike::compare(&a, &b);
    let ba = lookalike::compare(&b, &a);
    Ok(Comparison {
        same: a.key() == b.key(),
        chain: a.chain(),
        similarity: ab,
        a_grouped: a.grouped(),
        b_grouped: b.grouped(),
        a_spans: diff::spans(&a, &b, &ab),
        b_spans: diff::spans(&b, &a, &ba),
    })
}

/// The address in one of Check's boxes (`field`; `label` as the page names
/// it), or what is wrong with it.
fn one_address(text: &str, field: &'static str, label: &str) -> Result<kenning_core::Address, CompareProblem> {
    if let Some(address) = extract::single(text) {
        return Ok(address);
    }
    let trimmed = text
        .trim()
        .trim_matches(|c: char| matches!(c, '"' | '\'' | '`' | '<' | '>' | '(' | ')' | ','));
    Err(match kenning_core::parse(trimmed) {
        Err(kenning_core::ParseError::BadChecksum { chain }) => CompareProblem {
            field: Some(field),
            kind: "checksum",
            chains: vec![chain],
            message: format!("{label} has a wrong character: its {} checksum does not match.", chain.display_name()),
        },
        _ => CompareProblem { field: Some(field), kind: "not_address", chains: vec![], message: format!("{label} is not one address.") },
    })
}

#[tauri::command]
pub fn add_entry(state: State<AppState>, address: String, fields: Edit) -> Res<Recognition> {
    let address = kenning_core::parse(&address).map_err(err)?;
    let mut e = Entry::new(address.clone(), fields.label.trim(), fields.owner);
    e.note = fields.note.map(|n| n.trim().to_owned()).filter(|n| !n.is_empty());
    e.emoji = fields.emoji;
    e.tint = fields.tint;
    e.group = fields.group;
    e.source = Some("manual".into());
    let mut k = state.kenning.lock().unwrap();
    k.upsert(e).map_err(err)?;
    let r = k.recognize(&address);
    k.journal(Action::Added, &r).map_err(err)?;
    Ok(r)
}

/// The edit form in the book: the fields are set exactly as sent, so an
/// empty note, picture or group clears it.
#[tauri::command]
pub fn edit_entry(state: State<AppState>, address: String, fields: Edit) -> Res<()> {
    let address = kenning_core::parse(&address).map_err(err)?;
    let mut k = state.kenning.lock().unwrap();
    k.edit(&address.key(), fields).map_err(err)?;
    let r = k.recognize(&address);
    k.journal(Action::Edited, &r).map_err(err)
}

#[tauri::command]
pub fn rename_group(state: State<AppState>, from: String, to: String) -> Res<usize> {
    state.kenning.lock().unwrap().rename_group(&from, &to).map_err(err)
}

#[tauri::command]
pub fn remove_entry(state: State<AppState>, address: String) -> Res<bool> {
    let address = kenning_core::parse(&address).map_err(err)?;
    let mut k = state.kenning.lock().unwrap();
    let r = k.recognize(&address);
    let removed = k.remove(&address.key()).map_err(err)?.is_some();
    if removed {
        k.journal(Action::Removed, &r).map_err(err)?;
    }
    Ok(removed)
}

#[tauri::command]
pub fn journal(state: State<AppState>, limit: Option<usize>) -> Res<Vec<journal::Record>> {
    let path = state.kenning.lock().unwrap().journal_path();
    let mut records = journal::read(&path).map_err(err)?;
    records.reverse();
    records.truncate(limit.unwrap_or(500));
    Ok(records)
}

/// Save settings and apply the parts that live outside the config file.
#[tauri::command]
pub fn save_config(app: AppHandle, state: State<AppState>, config: Config) -> Res<Overview> {
    if let Some(clash) = config.keys.clash(&config.shortcut, &config.details_shortcut) {
        return Err(format!("Two shortcuts would do different things: {clash}."));
    }
    for url in [&config.solana_rpc, &config.bitcoin_api].into_iter().flatten() {
        if !url.trim().is_empty() {
            kenning_net::check_url(url)?;
        }
    }
    let (old_check, old_details) = {
        let k = state.kenning.lock().unwrap();
        (k.config().shortcut.clone(), k.config().details_shortcut.clone())
    };
    if (config.shortcut != old_check || config.details_shortcut != old_details)
        && let Err(e) = hotkey::register(&app, &config.shortcut, &config.details_shortcut)
    {
        // Keep the old, working shortcuts.
        let _ = hotkey::register(&app, &old_check, &old_details);
        return Err(e);
    }
    let autolaunch = app.autolaunch();
    let autostart_result = if config.autostart {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    if let Err(e) = autostart_result {
        eprintln!("kenning: autostart: {e}");
    }
    state.kenning.lock().unwrap().set_config(config).map_err(err)?;
    state.onchain.reset();
    tray::refresh(&app);
    Ok(overview(state))
}

/// Facts already known for these addresses (never starts a lookup).
#[tauri::command]
pub fn get_onchain(
    state: State<AppState>,
    addresses: Vec<String>,
) -> std::collections::HashMap<String, Fact> {
    addresses
        .into_iter()
        .filter_map(|a| state.onchain.get(&a).map(|f| (a, f)))
        .collect()
}

/// Look one address up now (Check view). Fails when the network is off.
#[tauri::command]
pub async fn lookup_onchain(app: AppHandle, address: String) -> Res<Fact> {
    let address = kenning_core::parse(&address).map_err(err)?;
    onchain::lookup_now(&app, &address)
}

/// Turn the network on or off (tray menu and settings).
#[tauri::command]
pub fn set_network(app: AppHandle, state: State<AppState>, on: bool) -> Res<Overview> {
    let mut config = state.kenning.lock().unwrap().config().clone();
    config.network = on;
    save_config(app, state, config)
}

#[tauri::command]
pub fn finish_onboarding(app: AppHandle, state: State<AppState>, watch: bool) -> Res<Overview> {
    let mut config = state.kenning.lock().unwrap().config().clone();
    config.onboarded = true;
    config.clipboard = if watch {
        ClipboardMode::Watch
    } else {
        ClipboardMode::Shortcut
    };
    save_config(app, state, config)
}

#[tauri::command]
pub fn clear_history(state: State<AppState>) -> Res<()> {
    state.kenning.lock().unwrap().clear_history().map_err(err)
}

#[derive(Serialize)]
pub struct ImportSummary {
    added: usize,
    updated: usize,
    skipped: Vec<(usize, String)>,
}

#[tauri::command]
pub async fn import_csv(app: AppHandle, owner: Owner) -> Res<Option<ImportSummary>> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("CSV", &["csv"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(err)?;
    let text = std::fs::read_to_string(&path).map_err(err)?;
    let imported = interop::import_csv(&text, owner).map_err(err)?;
    let total = imported.entries.len();
    let state = app.state::<AppState>();
    let added = state
        .kenning
        .lock()
        .unwrap()
        .upsert_many(imported.entries)
        .map_err(err)?;
    Ok(Some(ImportSummary {
        added,
        updated: total - added,
        skipped: imported.skipped,
    }))
}

#[tauri::command]
pub async fn export_csv(app: AppHandle) -> Res<Option<PathBuf>> {
    let csv = {
        let state = app.state::<AppState>();
        let k = state.kenning.lock().unwrap();
        interop::export_csv(k.personal().entries())
    };
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("CSV", &["csv"])
        .set_file_name("kenning-book.csv")
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(err)?;
    std::fs::write(&path, csv).map_err(err)?;
    Ok(Some(path))
}

/// Open book.toml in the default editor.
#[tauri::command]
pub fn open_book_file(app: AppHandle, state: State<AppState>) -> Res<()> {
    let path = {
        let k = state.kenning.lock().unwrap();
        if !k.book_path().exists() {
            k.personal().save().map_err(err)?;
        }
        k.book_path()
    };
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(err)
}

/// Reload books and settings from disk (after editing book.toml by hand).
#[tauri::command]
pub fn reload(app: AppHandle, state: State<AppState>) -> Res<Overview> {
    let home = state.kenning.lock().unwrap().home().to_owned();
    let fresh = kenning_core::Kenning::open_at(home).map_err(err)?;
    *state.kenning.lock().unwrap() = fresh;
    tray::refresh(&app);
    Ok(overview(state))
}

#[tauri::command]
pub fn open_main(app: AppHandle, tab: String) {
    ui::open_main(&app, &tab);
}

/// What the clipboard guard has seen since Kenning started, newest first.
#[tauri::command]
pub fn guard_events(state: State<AppState>) -> Vec<Event> {
    state.guard.events()
}

/// "Show the file": Explorer opens on the program the guard caught, with
/// its file selected. Only files of caught programs are shown.
#[tauri::command]
pub fn show_caught_file(state: State<AppState>, path: String) -> Res<()> {
    if !state.guard.caught_path(&path) || !std::path::Path::new(&path).is_file() {
        return Err("That file is no longer there.".into());
    }
    platform::reveal_file(&path).map_err(err)
}

/// Write a decoy address of each chain and watch for anything swapping it.
/// Takes a few seconds; the clipboard is put back afterwards.
#[tauri::command]
pub async fn run_clipboard_test(app: AppHandle) -> Res<Event> {
    tauri::async_runtime::spawn_blocking(move || guard::run_test(&app))
        .await
        .map_err(|e| e.to_string())
}

/// The button on a guard alert: put the copied address back, or clear the
/// clipboard.
#[tauri::command]
pub fn guard_action(app: AppHandle, state: State<AppState>, action: String) -> Res<()> {
    match action.as_str() {
        "restore" => {
            let address = state.guard.take_restore().ok_or("Nothing to put back.")?;
            clipboard::write(&address)?;
            flow::info(&app, "Your address is back on the clipboard. Check it once more before you send.");
        }
        "clear" => {
            clipboard::clear()?;
            flow::info(&app, "Clipboard cleared.");
        }
        _ => return Err(format!("unknown action {action}")),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::compare_addresses;

    const KNOWN: &str = "0x28C6c06298d514Db089934071355E5743bf21d60";
    const POISON: &str = "0x28C6C0aaAAaAAAaaAaAaAAaaAAaaaaaaAAaA1d60";

    #[test]
    fn compare_marks_a_lookalike() {
        let c = compare_addresses(POISON.into(), KNOWN.into()).unwrap();
        assert!(!c.same);
        assert_eq!((c.similarity.same_prefix, c.similarity.same_suffix), (6, 4));
        assert!(c.a_spans.iter().any(|s| !s.same) && c.b_spans.iter().any(|s| !s.same));
    }

    #[test]
    fn compare_ignores_case_and_wrapping() {
        let c = compare_addresses(format!(" \"{KNOWN}\" "), KNOWN.to_lowercase()).unwrap();
        assert!(c.same);
    }

    #[test]
    fn compare_refuses_text_and_mixed_chains() {
        assert!(compare_addresses("pay me".into(), KNOWN.into()).is_err());
        let err = compare_addresses(KNOWN.into(), "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa".into())
            .err()
            .unwrap();
        assert_eq!(err.kind, "chains");
        assert!(err.message.contains("different chains"), "{}", err.message);
    }

    #[test]
    fn compare_names_the_box_and_a_bad_checksum() {
        // One letter of KNOWN in the wrong case.
        let typo = "0x28c6c06298d514Db089934071355E5743bf21d60";
        let err = compare_addresses(typo.into(), KNOWN.into()).err().unwrap();
        assert_eq!((err.field, err.kind), (Some("used"), "checksum"));
        assert!(err.message.starts_with("The address you are about to use"), "{}", err.message);
        let err = compare_addresses(KNOWN.into(), "pay me".into()).err().unwrap();
        assert_eq!((err.field, err.kind), (Some("expected"), "not_address"));
    }
}

/// "Check for updates": ask now, whatever the daily setting says.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Res<Option<crate::update::Available>> {
    crate::update::check(&app).await
}

/// The newer version the last check found, for a window opening later.
#[tauri::command]
pub fn update_found(app: AppHandle) -> Option<crate::update::Available> {
    crate::update::found(&app)
}

/// Download, verify and install the update found; Kenning then restarts.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Res<()> {
    crate::update::install(&app).await
}

/// "Resume" on the sidebar's "Watching paused" card.
#[tauri::command]
pub fn set_paused(app: AppHandle, paused: bool) {
    tray::set_paused(&app, paused);
}

/// The main window's page has drawn itself: show the window (see `ui::open_main`).
#[tauri::command]
pub fn main_ready(app: AppHandle) {
    ui::reveal_main(&app);
}
