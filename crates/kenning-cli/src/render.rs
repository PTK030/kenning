//! Human-readable output. Colours follow the terminal's own palette (ANSI
//! names) so they read well on light and dark themes; every state also has
//! its own symbol and word, never colour alone.

use std::io::Write;

use anstyle::{AnsiColor, Style};
use kenning_core::classify::KnownKind;
use kenning_core::diff::Span;
use kenning_core::{Address, Recognition, State};

pub const DIM: Style = Style::new().dimmed();
pub const BOLD: Style = Style::new().bold();
const MINE: Style = Style::new().fg_color(Some(anstyle::Color::Ansi(AnsiColor::Green)));
const PUBLIC: Style = Style::new().fg_color(Some(anstyle::Color::Ansi(AnsiColor::Blue)));
const NEW: Style = Style::new().fg_color(Some(anstyle::Color::Ansi(AnsiColor::Yellow)));
const LOOKALIKE: Style = Style::new().fg_color(Some(anstyle::Color::Ansi(AnsiColor::Red)));
const DIFF: Style = Style::new()
    .fg_color(Some(anstyle::Color::Ansi(AnsiColor::Red)))
    .bold()
    .underline();

pub fn symbol(state: State) -> &'static str {
    match state {
        State::Mine | State::Team | State::Contact => "✓",
        State::Public => "◆",
        State::Seen => "↺",
        State::New => "+",
        State::Lookalike => "!",
    }
}

pub fn style(state: State) -> Style {
    match state {
        State::Mine | State::Team | State::Contact => MINE,
        State::Public => PUBLIC,
        State::Seen => Style::new(),
        State::New => NEW,
        State::Lookalike => LOOKALIKE,
    }
}

/// The full card for one address.
pub fn card(out: &mut impl Write, r: &Recognition) -> std::io::Result<()> {
    let st = style(r.state);
    writeln!(
        out,
        "{st}{} {}{st:#}  {DIM}{}{DIM:#}",
        symbol(r.state),
        r.headline,
        r.state.as_str()
    )?;
    writeln!(out, "  {}", r.detail)?;

    match &r.lookalike {
        Some(m) => {
            let known_name = match m.known_kind {
                KnownKind::Mine => "yours",
                KnownKind::Team => "team",
                KnownKind::Contact => "contact",
                KnownKind::Public => "public",
                KnownKind::History => "earlier",
            };
            writeln!(out)?;
            write!(out, "  {DIM}copied{DIM:#}  ")?;
            spans(out, &r.address, &m.candidate_spans)?;
            writeln!(out)?;
            write!(out, "  {DIM}{known_name:<6}{DIM:#}  ")?;
            spans(out, &m.known, &m.known_spans)?;
            if let Some(label) = &m.known_label {
                write!(out, "  {DIM}{label}{DIM:#}")?;
            }
            writeln!(out)?;
            writeln!(out)?;
            writeln!(out, "  The address you know is the second line: {}", m.known)?;
            writeln!(
                out,
                "  {DIM}If the copied one is yours too: ken add {} \"<label>\"{DIM:#}",
                r.address
            )?;
        }
        None => {
            writeln!(out, "  {}", r.grouped)?;
            let mut meta = vec![r.address.chain().display_name().to_owned()];
            if let Some(src) = &r.source {
                meta.push(match r.state {
                    State::Public => format!("source: {src}"),
                    _ => format!("book: {src}"),
                });
            }
            writeln!(out, "  {DIM}{}{DIM:#}", meta.join(" · "))?;
        }
    }
    Ok(())
}

/// One compact line, for `ken check`.
pub fn line(out: &mut impl Write, r: &Recognition) -> std::io::Result<()> {
    let st = style(r.state);
    writeln!(
        out,
        "{st}{} {:<9}{st:#} {:<44} {}{}",
        symbol(r.state),
        r.state.as_str(),
        r.address.as_str(),
        r.headline,
        if r.detail.is_empty() {
            String::new()
        } else {
            format!(" {DIM}· {}{DIM:#}", r.detail)
        }
    )
}

/// An address in groups of 4 with differing characters highlighted.
pub fn spans(out: &mut impl Write, address: &Address, spans: &[Span]) -> std::io::Result<()> {
    let start = address.group_start();
    let mut i = 0usize;
    for span in spans {
        for ch in span.text.chars() {
            if i >= start && (i - start).is_multiple_of(4) && i > 0 {
                write!(out, " ")?;
            }
            if span.same {
                write!(out, "{DIM}{ch}{DIM:#}")?;
            } else {
                write!(out, "{DIFF}{ch}{DIFF:#}")?;
            }
            i += 1;
        }
    }
    Ok(())
}
