# Design

How Kenning looks and moves, and why. Read this before changing anything
visible; [qa.md](qa.md) says how to show that the change is right.

## What the interface is for

Kenning sits between someone and a payment. Most of the time it should be
quiet. When it speaks, it must be believed at a glance.

- **The verdict is the peak.** A recognised address, a lookalike, a swapped
  clipboard: these get the strongest contrast, the clearest words and the
  most careful motion. Everything around them stays calm.
- **Show the work.** Say what was compared and with what ("Matches 6 + 4
  characters, 30 differ", "Compared with 5 addresses in your book"). A bare
  "safe" is not believable.
- **Calm, not empty.** Every empty state says what will appear there and
  offers one thing to do.
- **One look in every window.** The onboarding's pictures, the sandbox and
  the keys demo show the real badge, lookalike window and details window,
  built by the same code (`ui/src/alerts.ts`). Never draw a second version of
  an alert.

## Colour

All colours are tokens in `ui/src/styles/tokens.css`, each a
`light-dark(light, dark)` pair. A new colour goes there, not into a
stylesheet; some older stylesheets still hold literal colours, so don't add
more.

| Tokens | Use |
|---|---|
| `--surface-base`, `--surface`, `--surface-card`, `--surface-raised`, `--surface-sunken`, `--surface-pop` | From the sidebar up to a menu: base, page, card, hover, field, popover. One step up per layer |
| `--ink`, `--ink-body`, `--ink-2` | Headings, body text, secondary text |
| `--line`, `--line-strong`, `--hairline` | Dividers and outlines. Prefer space to a line; prefer a hairline to a border |
| `--brand` | Links, focus, the current tab |
| `--brand-strong` with `--on-brand` | Primary buttons, the same blue in both themes |
| `--mine`, `--new`, `--look` and their `-soft` | Only for those states: yours, new, lookalike. Never decoration |
| `--tint-*` | The backgrounds people choose for their own entries |
| `--elev-*`, `--shade*` | Shadows: low for cards, strong only for sheets and warnings |

Every text and background pair used must reach 4.5:1 in both themes.
`apps/desktop/scripts/check-contrast.mjs` checks the pairs it lists, straight
from `tokens.css`; add a pair there when you add one to the interface.

The lookalike window, the details window and the onboarding's pictures are
dark in both themes (`color-scheme: dark`), like photographs of the product.
Everything else follows the system theme.

## Type

| Font | Token | Use |
|---|---|---|
| Inter | `--font-ui` | Everything by default |
| Bricolage Grotesque | `--font-display` | Page titles and the headline of an alert |
| JetBrains Mono | `--font-mono` | Addresses, keys, numbers that are compared |

- At most three sizes on one screen: a title (about 30px), body (14px),
  secondary (12.5–13px). A section heading differs by weight, not size.
- Addresses are always shown in groups of four (`0x 28C6 c062 …`), so they
  can be read and compared, with differing characters marked rather than
  described.
- Words: plain, sentence case, no exclamation marks. Buttons say what they
  do ("Copy the correct address", not "OK"). Name the address ("your Binance
  deposits") rather than "this address".

## Motion

All motion goes through `ui/src/motion.ts`; nothing calls `animate` with its
own timings. Under `prefers-reduced-motion` every helper jumps to its end.

| Helper | For |
|---|---|
| `rise` | Items arriving, one after another (spring) |
| `sink` | Those items leaving, the way they came |
| `fold` | Opening and closing a section in place (a day in the journal, a release in What's new) |
| `collapse` | Something leaving that held space (the save bar), giving its room back as it goes |
| `sheetIn` / `sheetOut` | A sheet over the window |
| `draw` | A line icon drawing itself |
| `move` | Anything else, with `SPRING`, `POP`, `EASE_OUT` or `LEAVE` |

The rules behind them:

- **What arrives also leaves.** If something animates in, it animates out:
  the same way, reversed, quicker (`LEAVE`, 160 ms, speeding up from the
  first frame). Nothing disappears in a single frame.
- **No springs on height or layout.** A spring overshoots, and an
  overshooting height makes everything below it wobble. Heights use one
  curve both ways (`fold`).
- **No jump at the end.** An animation ends exactly where the layout will
  be once the inline styles go: animate padding and margins with the
  height, measure with `getBoundingClientRect` (not rounded `offsetHeight`),
  and stop margins collapsing through an animated box (`display: flow-root`).
- **No flash at the start.** `move` puts elements in their first keyframe
  before the first frame. Content that waits for an entrance stays hidden
  until the entrance starts.
- **Interruptible.** A second click mid-way turns a fold round from where it
  is; it does not restart it.

## Layout

- Spacing in steps of 4: 4, 8, 12, 16, 24, 32.
- The main window's content has a maximum width; it does not stretch across
  a maximised window.
- A card groups things that belong together. Rows inside it are separated
  by hairlines, not by more cards.
- Controls behave like Windows controls (keyboard, focus, Esc closes a
  sheet) and look like Kenning's.
