//! The clipboard guard and the clipboard test.
//!
//! A clipper (clipboard-hijacking malware: Laplas, MassJacker, CryptoBandits
//! and many more) runs in the background and watches the clipboard, either
//! through the same change notification Kenning uses or by polling it about
//! twice a second. When the text matches an address pattern it writes its
//! own address over yours, more and more often one chosen to share your
//! first and last characters. Many also read recovery phrases and keys
//! that people copy.
//!
//! The swap leaves traces that no single check would trust, so the guard
//! weighs them together. After you copy an address, a write that puts a
//! different address of the same chain on the clipboard within a couple of
//! seconds is a swap when any of these holds:
//!
//! * no key or mouse input happened between the two writes: a person copies
//!   with a key or a click, a program does not;
//! * the window that wrote it belongs to another process than the window in
//!   front, or there is no window at all;
//! * the new address shares first or last characters with yours, the way
//!   lookalike clippers make them.
//!
//! Later than that (a slow clipper), it takes the first two together.
//!
//! Kenning's own writes and a few tools whose job is to rewrite the
//! clipboard (remote desktop, virtual machines, clipboard managers) are
//! exempt. A clipper that changes the copy inside the copying app itself (a
//! malicious browser extension) never lets your address reach the
//! clipboard; the lookalike check against the book is what catches that.
//!
//! The test writes a decoy address of each chain, kept out of clipboard
//! history, and watches whether anything writes over it.
//!
//! Nothing here is written to disk: the events live until Kenning quits,
//! and a secret is reported by kind, never kept.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use kenning_core::{Address, Chain, extract, lookalike, secret};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::clipboard::{self, Content};
use crate::state::{AlertAction, AppState, Badge};
use crate::{platform, ui};

/// A write this soon after a copy is "right after" it.
const QUICK: Duration = Duration::from_secs(2);
/// A slow clipper is still caught this long after the copy.
const SLOW: Duration = Duration::from_secs(60);
/// Input this long after the previous write counts as between the writes;
/// the system's input clock ticks every 16 ms or so.
const INPUT_SLACK_MS: u64 = 32;
/// Events kept for the Protection view.
const MAX_EVENTS: usize = 50;
/// How long the alert stays.
const ALERT_SECONDS: u64 = 15;

/// Processes that rewrite the clipboard as their job: remote desktop and
/// virtual machine clipboard sharing, and clipboard managers pasting from
/// their history.
const EXEMPT: [&str; 7] = [
    "rdpclip.exe",
    "vmtoolsd.exe",
    "vboxtray.exe",
    "ditto.exe",
    "copyq.exe",
    "clipboardfusion.exe",
    "clipclip.exe",
];

/// Decoy addresses for the test: well-known examples from documentation,
/// never used as a destination by Kenning.
pub const DECOYS: [&str; 4] = [
    "0x52908400098527886E0F7030069857D2E4169EE7",
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
    "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
];

/// What made a write look like a swap.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Clue {
    /// No key or mouse input between your copy and the write.
    NoInput,
    /// Written by a program other than the one in front.
    Background,
    /// The new address shares first or last characters with yours.
    LooksAlike,
}

/// What the guard knows about a write, apart from its text.
#[derive(Clone, Copy, Debug)]
pub struct Signals {
    /// Kenning wrote it, or a tool in [`EXEMPT`].
    pub exempt: bool,
    /// The writer is the process of the window in front.
    pub from_front: bool,
    /// Key or mouse input happened between the copy and this write.
    pub input_between: bool,
}

/// Whether writing `next` over `copied` (written `age` ago) is a swap, and
/// why.
pub fn judge(copied: &Address, age: Duration, next: &Address, s: Signals) -> Option<Vec<Clue>> {
    if s.exempt || next.chain() != copied.chain() || next.key() == copied.key() {
        return None;
    }
    let mut clues = Vec::new();
    if !s.input_between {
        clues.push(Clue::NoInput);
    }
    if !s.from_front {
        clues.push(Clue::Background);
    }
    if lookalike::compare(next, copied).total() >= 2 {
        clues.push(Clue::LooksAlike);
    }
    let swap = if age < QUICK {
        !clues.is_empty()
    } else {
        age < SLOW && clues.contains(&Clue::NoInput) && clues.contains(&Clue::Background)
    };
    swap.then_some(clues)
}

/// A recorded guard event, newest first in [`GuardState::events`].
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Event {
    Swap {
        at: String,
        chain: Chain,
        copied: String,
        found: String,
        process: Option<String>,
        after_ms: u64,
        clues: Vec<Clue>,
    },
    Secret {
        at: String,
        what: String,
        process: Option<String>,
    },
    Test {
        at: String,
        checked: usize,
        swaps: Vec<TestSwap>,
    },
}

#[derive(Clone, Debug, Serialize)]
pub struct TestSwap {
    pub chain: Chain,
    pub wrote: String,
    /// What came back instead: an address, or None when it was not one.
    pub found: Option<String>,
    pub process: Option<String>,
}

/// Progress of a running test, for the Protection view.
#[derive(Clone, Debug, Serialize)]
struct TestStep {
    index: usize,
    chain: Chain,
    /// None while the decoy is out, then whether it came back untouched.
    clean: Option<bool>,
}

/// The last address copied, as the baseline for the next write.
struct Seen {
    address: Address,
    at: Instant,
}

#[derive(Default)]
pub struct GuardState {
    last: Mutex<Option<Seen>>,
    events: Mutex<VecDeque<Event>>,
    /// The address the last alert offers to put back.
    restore: Mutex<Option<String>>,
    /// The clipboard sequence number the last alert was about, so the
    /// recognition badge for the same write does not cover it.
    alarm_seq: Mutex<Option<u32>>,
    /// When the last secret warning was shown (an app may write twice).
    secret_at: Mutex<Option<Instant>>,
    /// The sequence number of the last write looked at: Windows often
    /// announces one write two or three times.
    seen_seq: Mutex<Option<u32>>,
    /// The test is borrowing the clipboard.
    testing: AtomicBool,
}

impl GuardState {
    pub fn events(&self) -> Vec<Event> {
        self.events.lock().unwrap().iter().cloned().collect()
    }

    /// Whether the clipboard holds the write the last alert was about.
    pub fn alarmed_now(&self) -> bool {
        let alarm = *self.alarm_seq.lock().unwrap();
        alarm.is_some() && alarm == clipboard::seq()
    }

    pub fn take_restore(&self) -> Option<String> {
        self.restore.lock().unwrap().take()
    }

    fn push(&self, app: &AppHandle, event: Event) {
        let _ = app.emit_to(ui::MAIN, "guard", &event);
        let mut events = self.events.lock().unwrap();
        events.push_front(event);
        events.truncate(MAX_EVENTS);
    }
}

fn now() -> String {
    jiff::Timestamp::now().to_string()
}

fn name_of(pid: Option<u32>) -> Option<String> {
    pid.and_then(platform::process_name)
}

/// "0x5290…9EE7"
fn short(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= 12 {
        return text.to_owned();
    }
    let head: String = chars[..6].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}…{tail}")
}

/// A clipboard write, looked at the moment it is announced: a clipper
/// listening for the same announcement can write over it within
/// milliseconds, and then the address you copied is never seen again.
pub fn on_write(app: &AppHandle) {
    let st = app.state::<AppState>();
    let g = &st.guard;
    if g.testing.load(Ordering::SeqCst)
        || st.paused.load(Ordering::SeqCst)
        || st.quiet_until.lock().unwrap().is_some_and(|t| Instant::now() < t)
        || !st.kenning.lock().unwrap().config().guard
    {
        return;
    }

    let already = |seq: Option<u32>| seq.is_some() && *g.seen_seq.lock().unwrap() == seq;
    if already(clipboard::seq()) {
        return;
    }
    // Who is in front and when the last input was, before anything changes.
    let front = platform::foreground_pid();
    let idle = platform::idle_ms();
    // A clipboard still held by its writer is not "something else copied":
    // forgetting your address there would let the swap that follows pass
    // as a fresh copy. Only text that is not an address resets it.
    let Some(snap) = clipboard::read_within(Duration::from_millis(250)) else {
        return;
    };
    if already(snap.seq) {
        return;
    }
    let (seq, writer) = (snap.seq, snap.owner);
    *g.seen_seq.lock().unwrap() = seq;
    let Content::Text(text) = snap.content else {
        return;
    };

    if let Some(found) = secret::detect(&text) {
        drop(text);
        *g.last.lock().unwrap() = None;
        warn_secret(app, found, name_of(writer), seq);
        return;
    }

    let Some(address) = extract::single(&text) else {
        *g.last.lock().unwrap() = None;
        return;
    };
    drop(text);

    let own = std::process::id();
    let writer_name = name_of(writer);
    let exempt = writer == Some(own)
        || writer_name
            .as_deref()
            .is_some_and(|n| EXEMPT.contains(&n.to_ascii_lowercase().as_str()));
    // Store apps run inside a frame host, so their windows never match the
    // process that writes their clipboard.
    let front_is_frame = name_of(front).is_some_and(|n| n.eq_ignore_ascii_case("ApplicationFrameHost.exe"));
    let from_front = writer.is_some() && (writer == front || front_is_frame);

    let mut last = g.last.lock().unwrap();
    let verdict = last.as_ref().and_then(|seen| {
        let age = seen.at.elapsed();
        let input_between = idle.is_some_and(|ms| u64::from(ms) + INPUT_SLACK_MS < age.as_millis() as u64);
        let signals = Signals {
            exempt,
            from_front,
            input_between,
        };
        judge(&seen.address, age, &address, signals).map(|clues| (seen.address.clone(), age, clues))
    });

    match verdict {
        Some((copied, age, clues)) => {
            // Keep your address as the baseline: a clipper that swaps again
            // after it is put back is caught again.
            drop(last);
            warn_swap(app, &copied, &address, writer_name, age, clues, seq);
        }
        None => {
            *last = Some(Seen {
                address,
                at: Instant::now(),
            });
        }
    }
}

fn warn_swap(
    app: &AppHandle,
    copied: &Address,
    found: &Address,
    process: Option<String>,
    age: Duration,
    clues: Vec<Clue>,
    seq: Option<u32>,
) {
    let st = app.state::<AppState>();
    let g = &st.guard;
    let who = process.clone().unwrap_or_else(|| "A program with no window".to_owned());
    // A lookalike shortens to the same text as yours: that is the point of
    // it, so the alert names the trick instead of showing two equal stubs.
    let mine = short(copied.as_str());
    let text = if clues.contains(&Clue::LooksAlike) {
        format!("{who} swapped in a lookalike of your {mine}. Do not paste it.")
    } else {
        format!("{who} replaced your {mine} with {}. Do not paste it.", short(found.as_str()))
    };
    *g.restore.lock().unwrap() = Some(copied.as_str().to_owned());
    *g.alarm_seq.lock().unwrap() = seq;
    g.push(
        app,
        Event::Swap {
            at: now(),
            chain: copied.chain(),
            copied: copied.as_str().to_owned(),
            found: found.as_str().to_owned(),
            process,
            after_ms: age.as_millis() as u64,
            clues,
        },
    );
    ui::show_badge(
        app,
        Badge::Alert {
            title: "The address you copied was swapped".to_owned(),
            text,
            action: Some(AlertAction {
                id: "restore".to_owned(),
                label: "Put mine back".to_owned(),
            }),
        },
        ALERT_SECONDS,
    );
}

fn warn_secret(app: &AppHandle, found: secret::Secret, process: Option<String>, seq: Option<u32>) {
    let st = app.state::<AppState>();
    let g = &st.guard;
    {
        let mut at = g.secret_at.lock().unwrap();
        if at.is_some_and(|t| t.elapsed() < Duration::from_secs(3)) {
            return;
        }
        *at = Some(Instant::now());
    }
    *g.alarm_seq.lock().unwrap() = seq;
    let what = found.describe();
    g.push(
        app,
        Event::Secret {
            at: now(),
            what: what.clone(),
            process,
        },
    );
    let title = match found {
        secret::Secret::RecoveryPhrase { .. } => "Recovery phrase on the clipboard",
        secret::Secret::BitcoinKey | secret::Secret::SolanaKey => "Private key on the clipboard",
    };
    ui::show_badge(
        app,
        Badge::Alert {
            title: title.to_owned(),
            text: format!("It looks like {what}. Any program running can read it: clear it once pasted."),
            action: Some(AlertAction {
                id: "clear".to_owned(),
                label: "Clear clipboard".to_owned(),
            }),
        },
        ALERT_SECONDS,
    );
}

/// Run the clipboard test: write each decoy, watch whether anything writes
/// over it, then put back what was on the clipboard. Blocks for a few
/// seconds; call it off the main thread.
pub fn run_test(app: &AppHandle) -> Event {
    const WATCH: Duration = Duration::from_millis(1500);
    let st = app.state::<AppState>();
    let g = &st.guard;
    g.testing.store(true, Ordering::SeqCst);
    *st.quiet_until.lock().unwrap() = Some(Instant::now() + WATCH * (DECOYS.len() as u32 + 2));

    let saved = clipboard::save();
    let mut swaps = Vec::new();
    for (index, decoy) in DECOYS.iter().enumerate() {
        let chain = kenning_core::chain::parse(decoy)
            .map(|a| a.chain())
            .expect("decoys are valid addresses");
        let _ = app.emit_to(ui::MAIN, "guard-test", TestStep { index, chain, clean: None });
        if clipboard::write_hidden(decoy).is_err() {
            continue;
        }
        let wrote = clipboard::seq();
        let deadline = Instant::now() + WATCH;
        let mut touched = false;
        while Instant::now() < deadline {
            if clipboard::seq() != wrote {
                touched = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let mut clean = true;
        if touched {
            // Let it finish writing, then see what it left.
            std::thread::sleep(Duration::from_millis(40));
            let process = name_of(platform::clipboard_owner_pid());
            let found = match clipboard::read() {
                Content::Text(t) => extract::single(&t).map(|a| a.as_str().to_owned()),
                _ => None,
            };
            let same = found.as_deref().is_some_and(|f| f.eq_ignore_ascii_case(decoy));
            if !same {
                clean = false;
                swaps.push(TestSwap {
                    chain,
                    wrote: (*decoy).to_owned(),
                    found,
                    process,
                });
            }
        }
        let _ = app.emit_to(ui::MAIN, "guard-test", TestStep { index, chain, clean: Some(clean) });
    }

    match saved {
        Some(saved) => clipboard::restore(&saved),
        None => {
            let _ = clipboard::clear();
        }
    }
    *st.quiet_until.lock().unwrap() = Some(Instant::now() + Duration::from_millis(400));
    g.testing.store(false, Ordering::SeqCst);

    let event = Event::Test {
        at: now(),
        checked: DECOYS.len(),
        swaps,
    };
    g.push(app, event.clone());
    event
}

#[cfg(test)]
mod tests {
    use super::*;
    use kenning_core::chain::parse;

    const MINE: &str = "0x28C6c06298d514Db089934071355E5743bf21d60";
    /// Same first 3 and last 3 characters of the body as MINE.
    const ALIKE: &str = "0x28c0000000000000000000000000000000000d60";
    const OTHER: &str = "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2";

    fn sig(input_between: bool, from_front: bool) -> Signals {
        Signals {
            exempt: false,
            from_front,
            input_between,
        }
    }

    #[test]
    fn decoys_parse() {
        let chains: Vec<Chain> = DECOYS.iter().map(|d| parse(d).unwrap().chain()).collect();
        assert_eq!(chains, [Chain::Evm, Chain::Bitcoin, Chain::Tron, Chain::Solana]);
    }

    #[test]
    fn a_person_copying_again_is_not_a_swap() {
        let (a, b) = (parse(MINE).unwrap(), parse(OTHER).unwrap());
        assert_eq!(judge(&a, Duration::from_millis(900), &b, sig(true, true)), None);
    }

    #[test]
    fn instant_rewrite_without_input_is_a_swap() {
        let (a, b) = (parse(MINE).unwrap(), parse(OTHER).unwrap());
        // A listener-based clipper inside the app in front.
        let clues = judge(&a, Duration::from_millis(8), &b, sig(false, true)).unwrap();
        assert_eq!(clues, [Clue::NoInput]);
    }

    #[test]
    fn background_writer_is_a_swap() {
        let (a, b) = (parse(MINE).unwrap(), parse(OTHER).unwrap());
        // A polling clipper, after the copy key came up.
        let clues = judge(&a, Duration::from_millis(450), &b, sig(true, false)).unwrap();
        assert_eq!(clues, [Clue::Background]);
    }

    #[test]
    fn lookalike_replacement_is_a_swap() {
        let (a, b) = (parse(MINE).unwrap(), parse(ALIKE).unwrap());
        let clues = judge(&a, Duration::from_millis(300), &b, sig(false, false)).unwrap();
        assert_eq!(clues, [Clue::NoInput, Clue::Background, Clue::LooksAlike]);
    }

    #[test]
    fn slow_swap_needs_no_input_and_background() {
        let (a, b) = (parse(MINE).unwrap(), parse(OTHER).unwrap());
        let late = Duration::from_secs(10);
        assert!(judge(&a, late, &b, sig(false, false)).is_some());
        assert_eq!(judge(&a, late, &b, sig(true, false)), None);
        assert_eq!(judge(&a, late, &b, sig(false, true)), None);
        assert_eq!(judge(&a, Duration::from_secs(90), &b, sig(false, false)), None);
    }

    #[test]
    fn same_address_other_chain_or_exempt_is_not_a_swap() {
        let a = parse(MINE).unwrap();
        let lower = parse(&MINE.to_ascii_lowercase()).unwrap();
        let tron = parse(DECOYS[2]).unwrap();
        let fast = Duration::from_millis(5);
        assert_eq!(judge(&a, fast, &lower, sig(false, false)), None);
        assert_eq!(judge(&a, fast, &tron, sig(false, false)), None);
        let exempt = Signals {
            exempt: true,
            ..sig(false, false)
        };
        assert_eq!(judge(&a, fast, &parse(OTHER).unwrap(), exempt), None);
    }

    #[test]
    fn short_keeps_ends() {
        assert_eq!(short(DECOYS[0]), "0x5290…9EE7");
        assert_eq!(short("abc"), "abc");
    }
}
