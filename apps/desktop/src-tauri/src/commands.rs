//! Commands the web UI may call. This is the whole surface between the UI and
//! the system: the UI has no clipboard, file system or network permission of
//! its own.

use std::path::PathBuf;
use std::sync::atomic::Ordering;

use kenning_core::journal::{self, Action};
use kenning_core::{Chain, ClipboardMode, Config, Entry, Owner, Recognition, extract, interop};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::onchain::{self, Fact};
use crate::state::{AppState, BadgeView, DetailsView};
use crate::{clipboard, hotkey, tray, ui};

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
    /// Hosts contacted when the network is on, and why.
    hosts: Vec<(&'static str, &'static str)>,
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
        hosts: kenning_net::HOSTS.to_vec(),
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

/// Open the address in the chain's public explorer, in the browser.
#[tauri::command]
pub fn open_explorer(app: AppHandle, state: State<AppState>) -> Res<()> {
    let address = details_address(&state)?;
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

#[tauri::command]
pub fn add_entry(
    state: State<AppState>,
    address: String,
    label: String,
    owner: Owner,
    note: Option<String>,
) -> Res<Recognition> {
    let address = kenning_core::parse(&address).map_err(err)?;
    let mut e = Entry::new(address.clone(), label.trim(), owner);
    e.note = note.map(|n| n.trim().to_owned()).filter(|n| !n.is_empty());
    e.source = Some("manual".into());
    let mut k = state.kenning.lock().unwrap();
    k.upsert(e).map_err(err)?;
    let r = k.recognize(&address);
    k.journal(Action::Added, &r).map_err(err)?;
    Ok(r)
}

/// A row of the address book was clicked. Async, so it runs off the main
/// thread: building the details window from a synchronous command leaves its
/// WebView2 unloaded on Windows, and the window never shows.
#[tauri::command]
pub async fn show_entry(app: AppHandle, address: String) -> Res<()> {
    let address = kenning_core::parse(&address).map_err(err)?;
    crate::flow::show_book_details(&app, address);
    Ok(())
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
