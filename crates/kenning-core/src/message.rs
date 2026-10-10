//! UI copy for every state, shared by the CLI and the desktop app.
//!
//! Voice: a calm teammate. Facts and numbers, no adjectives, no alarm words
//! (the banned list is enforced by a test below). Say what matches and what
//! differs.

use jiff::Timestamp;

use crate::classify::{KnownKind, Recognition, State};
use crate::history::Contact;
use crate::labels::LabelKind;

pub(crate) fn describe(r: &Recognition, now: Timestamp) -> (String, String) {
    match r.state {
        State::Mine | State::Team | State::Contact => {
            let headline = r.label.clone().unwrap_or_default();
            let mut parts: Vec<String> = Vec::new();
            if let Some(note) = &r.note {
                parts.push(note.clone());
            }
            match r.state {
                State::Team => parts.push(format!("team book {}", r.source.as_deref().unwrap_or(""))),
                State::Contact => parts.push("contact".into()),
                _ => {}
            }
            parts.push(contact_phrase(r.history.as_ref(), now).unwrap_or_else(|| "in your book".into()));
            (headline, parts.join(" · "))
        }
        State::Public => {
            let headline = r.label.clone().unwrap_or_default();
            let kind = match r.label_kind {
                Some(LabelKind::Token) => "token",
                Some(LabelKind::Contract) => "contract",
                Some(LabelKind::Program) => "program",
                Some(LabelKind::Exchange) => "exchange",
                Some(LabelKind::Other) | None => "address",
            };
            let mut detail = format!("public label · {kind}");
            if let Some(p) = contact_phrase(r.history.as_ref(), now) {
                detail = format!("{detail} · {p}");
            }
            (headline, detail)
        }
        State::Lookalike => {
            let m = r.lookalike.as_ref().expect("lookalike state has a match");
            let label = m.known_label.as_deref().unwrap_or("");
            let headline = match m.known_kind {
                KnownKind::Mine => format!("This is not your {label} address."),
                KnownKind::Team => format!("This is not your team's {label} address."),
                KnownKind::Contact | KnownKind::Public => format!("This is not {label}."),
                KnownKind::History => match m.known_last_seen {
                    Some(t) => format!("This is not the address you copied {}.", relative(t, now)),
                    None => "This is not the address you copied before.".into(),
                },
            };
            let s = &m.similarity;
            let mut detail = format!(
                "Matches {} + {} characters, {} differ.",
                s.same_prefix, s.same_suffix, s.differing
            );
            if r.more_lookalikes > 0 {
                detail.push_str(&format!(
                    " Also resembles {} other known address{}.",
                    r.more_lookalikes,
                    plural_es(r.more_lookalikes)
                ));
            }
            (headline, detail)
        }
        State::Seen => {
            let c = r.history.as_ref().expect("seen state has history");
            let detail = format!(
                "No label · copied {}× · first {}",
                c.count,
                relative(c.first_seen, now)
            );
            ("Seen before".into(), detail)
        }
        State::New => (
            "New address".into(),
            "You have never copied this address before. First contact: today.".into(),
        ),
    }
}

fn contact_phrase(c: Option<&Contact>, now: Timestamp) -> Option<String> {
    c.map(|c| format!("copied {}× · last {}", c.count, relative(c.last_seen, now)))
}

fn plural_es(n: usize) -> &'static str {
    if n == 1 { "" } else { "es" }
}

/// "today", "yesterday", "3 days ago", "2 months ago", "1 year ago".
pub fn relative(t: Timestamp, now: Timestamp) -> String {
    let days = (now.as_second() - t.as_second()).max(0) / 86_400;
    match days {
        0 => "today".into(),
        1 => "yesterday".into(),
        2..=44 => format!("{days} days ago"),
        45..=364 => {
            let m = (days + 15) / 30;
            format!("{m} month{} ago", if m == 1 { "" } else { "s" })
        }
        _ => {
            let y = days / 365;
            format!("{y} year{} ago", if y == 1 { "" } else { "s" })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_times() {
        let now: Timestamp = "2026-10-10T12:00:00Z".parse().unwrap();
        let ago = |d: i64| Timestamp::from_second(now.as_second() - d * 86_400).unwrap();
        assert_eq!(relative(ago(0), now), "today");
        assert_eq!(relative(ago(1), now), "yesterday");
        assert_eq!(relative(ago(3), now), "3 days ago");
        assert_eq!(relative(ago(60), now), "2 months ago");
        assert_eq!(relative(ago(400), now), "1 year ago");
    }

    #[test]
    fn copy_avoids_alarm_words() {
        // Keep to the product vocabulary from the brief.
        let src = include_str!("message.rs");
        let banned = [
            "sc".to_owned() + "am",
            "mal".to_owned() + "icious",
            "thr".to_owned() + "eat",
            "prot".to_owned() + "ect",
            "gu".to_owned() + "ard",
            "shi".to_owned() + "eld",
            "ha".to_owned() + "ck",
        ];
        let lower = src.to_lowercase();
        for w in banned {
            assert!(!lower.contains(&w), "UI copy must not use `{w}`");
        }
    }
}
