// The picture a book entry can carry beside its name, and the tile it sits
// on. The book stores the character itself; how it looks is up to the
// artwork in assets/emoji (one PNG per emoji, named by its code points),
// and, for any emoji without a file there, the system's emoji font.

import { clear, h } from "./dom";
import { AUTO_TINT } from "./emojiTints";
import { EASE_IN, EASE_OUT, move } from "./motion";

/** The tile backgrounds: the --tint-* colours in tokens.css, and the list
 *  the book accepts (TINTS in kenning-core's book.rs). */
export const TINTS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray", "mist", "slate", "snow", "night"] as const;
export type Tint = (typeof TINTS)[number];

/** The choices offered in the picker, a few for each kind of address. */
export const EMOJI_GROUPS: { name: string; items: { char: string; name: string }[] }[] = [
  {
    name: "Money",
    items: [
      { char: "🏦", name: "Bank" },
      { char: "💰", name: "Money bag" },
      { char: "💵", name: "Cash" },
      { char: "💳", name: "Card" },
      { char: "💸", name: "Payouts" },
      { char: "🪙", name: "Coin" },
      { char: "🐷", name: "Savings" },
      { char: "🧾", name: "Invoices" },
      { char: "💎", name: "Gem" },
      { char: "📈", name: "Trading" },
    ],
  },
  {
    name: "Places",
    items: [
      { char: "💼", name: "Work" },
      { char: "🏢", name: "Company" },
      { char: "🏠", name: "Home" },
      { char: "🏪", name: "Shop" },
      { char: "🛒", name: "Shopping" },
      { char: "🏛️", name: "Institution" },
      { char: "🌍", name: "World" },
      { char: "✈️", name: "Travel" },
    ],
  },
  {
    name: "Safety",
    items: [
      { char: "🔒", name: "Locked" },
      { char: "🔑", name: "Key" },
      { char: "🛡️", name: "Shield" },
      { char: "🧊", name: "Cold" },
      { char: "🔥", name: "Hot" },
      { char: "⚡", name: "Fast" },
      { char: "🚨", name: "Alert" },
    ],
  },
  {
    name: "People",
    items: [
      { char: "👤", name: "Person" },
      { char: "👥", name: "People" },
      { char: "🤝", name: "Partner" },
      { char: "👑", name: "Owner" },
      { char: "🎁", name: "Gifts" },
      { char: "💬", name: "Chat" },
      { char: "📦", name: "Delivery" },
    ],
  },
  {
    name: "Things",
    items: [
      { char: "🚀", name: "Rocket" },
      { char: "🎮", name: "Games" },
      { char: "🎨", name: "Art" },
      { char: "🧪", name: "Testing" },
      { char: "⛽", name: "Gas" },
      { char: "🎯", name: "Target" },
      { char: "💻", name: "Computer" },
      { char: "📱", name: "Phone" },
      { char: "🎵", name: "Music" },
    ],
  },
  {
    name: "Nature",
    items: [
      { char: "🌱", name: "Staking" },
      { char: "🍀", name: "Luck" },
      { char: "🐋", name: "Whale" },
      { char: "🦊", name: "Fox" },
      { char: "🐱", name: "Cat" },
      { char: "🐶", name: "Dog" },
      { char: "🦄", name: "Unicorn" },
      { char: "🌙", name: "Moon" },
      { char: "☀️", name: "Sun" },
      { char: "⭐", name: "Star" },
      { char: "❤️", name: "Heart" },
    ],
  },
  {
    name: "Colours",
    items: [
      { char: "🔴", name: "Red" },
      { char: "🟠", name: "Orange" },
      { char: "🟡", name: "Yellow" },
      { char: "🟢", name: "Green" },
      { char: "🔵", name: "Blue" },
      { char: "🟣", name: "Purple" },
      { char: "🟤", name: "Brown" },
      { char: "⚫", name: "Black" },
      { char: "⚪", name: "White" },
    ],
  },
];
const EMOJI = EMOJI_GROUPS.flatMap((g) => g.items);

const ART = import.meta.glob<string>("./assets/emoji/*.png", { eager: true, query: "?url", import: "default" });

/** "🏦" → "1f3e6", "❤️" → "2764": code points in hex, joined by "-", without
 *  the variation selector, the way most emoji artwork names its files. */
function fileName(char: string): string {
  return Array.from(char, (c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== "fe0f")
    .join("-");
}

/** The background a tile takes: the user's choice, else the one picked to
 *  suit the emoji (scripts/emoji-art.py), else none (the caller's own). */
export function tileTint(emoji: string | null, tint: string | null): Tint | null {
  if (tint && (TINTS as readonly string[]).includes(tint)) return tint as Tint;
  return emoji ? (AUTO_TINT[fileName(emoji)] ?? null) : null;
}

const FONT = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
const drawn = new Map<string, string>();

/** The font's emoji, drawn once into a bitmap. Windows' emoji are colour
 *  vector glyphs with gradients; repainting dozens of them on every hover
 *  and every frame of an animation stutters, while a picture costs nothing. */
function rasterized(char: string): string | null {
  const cached = drawn.get(char);
  if (cached) return cached;
  const px = 72; // three times the largest size shown, for sharp high-DPI screens
  const canvas = h("canvas", { width: String(px), height: String(px) });
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.font = `${px * 0.86}px ${FONT}`;
  // Centre the glyph's ink, not its advance box: emoji sit low in most fonts.
  const m = g.measureText(char);
  const x = (px - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft)) / 2 + m.actualBoundingBoxLeft;
  const y = (px - (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) / 2 + m.actualBoundingBoxAscent;
  g.fillText(char, x, y);
  const url = canvas.toDataURL("image/png");
  drawn.set(char, url);
  return url;
}

/** The emoji at `size` pixels: its artwork when there is some, else the font's. */
export function emojiMark(char: string, size: number): HTMLElement {
  const url = ART[`./assets/emoji/${fileName(char)}.png`] ?? rasterized(char);
  const name = EMOJI.find((e) => e.char === char)?.name ?? char;
  if (url) return h("img", { class: "emoji", src: url, alt: name, width: String(size), height: String(size), draggable: "false" });
  return h("span", { class: "emoji", role: "img", "aria-label": name, style: `font-size: ${Math.round(size * 0.86)}px; font-family: ${FONT}` }, char);
}

export type Look = { emoji: string | null; tint: string | null };

let open: HTMLElement | null = null;
/** The button that opened it: a click there toggles, rather than closing and reopening. */
let anchor: HTMLElement | null = null;

function close() {
  const el = open;
  if (!el) return;
  open = null;
  void move(el, { opacity: 0, scale: 0.98 }, { duration: 0.1, ease: EASE_IN }).then(() => el.remove());
}

/** The picker under `button`: the tile as it will look, its background,
 *  and the emoji by kind. Every choice shows at once, in the picker and
 *  through `change`; it stays open to try combinations, and closes on Done,
 *  Escape or a click elsewhere. Arrow keys move through the emoji. */
export function emojiPicker(button: HTMLElement, start: Look, change: (look: Look) => void, empty: () => Node) {
  const wasOpen = open !== null || button.dataset.closing === "1";
  delete button.dataset.closing;
  close();
  if (wasOpen) return;

  const look = { ...start };
  const preview = h("span", { class: "emoji-preview" });
  const paint = () => {
    const tint = tileTint(look.emoji, look.tint);
    preview.className = `emoji-preview ${tint ? `tint-${tint}` : "tint-gray"}`;
    clear(preview, look.emoji ? emojiMark(look.emoji, 34) : empty());
    for (const s of swatches) s.setAttribute("aria-pressed", String((s.dataset.tint || null) === look.tint));
    for (const c of cells) c.setAttribute("aria-pressed", String(c.dataset.char === look.emoji));
    auto.style.setProperty("--auto", `var(--tint-${tileTint(look.emoji, null) ?? "gray"})`);
  };
  const set = (next: Partial<Look>) => {
    Object.assign(look, next);
    paint();
    change({ ...look });
  };

  const auto = h("button", { type: "button", class: "tint-swatch auto", "data-tint": "", title: "Suits the picture", onclick: () => set({ tint: null }) }, "Auto");
  const swatches = [
    auto,
    ...TINTS.map((t) =>
      h("button", { type: "button", class: `tint-swatch tint-${t}`, "data-tint": t, title: t[0].toUpperCase() + t.slice(1), "aria-label": `${t} background`, onclick: () => set({ tint: t }) }),
    ),
  ];
  const cells: HTMLButtonElement[] = [];
  const sections = EMOJI_GROUPS.map((g) =>
    h(
      "div",
      { class: "emoji-group" },
      h("div", { class: "emoji-group-name" }, g.name),
      h(
        "div",
        { class: "emoji-grid", role: "group", "aria-label": g.name },
        g.items.map((e) => {
          const cell = h("button", { type: "button", class: "emoji-cell", title: e.name, "data-char": e.char, onclick: () => set({ emoji: e.char }) }, emojiMark(e.char, 26));
          cells.push(cell);
          return cell;
        }),
      ),
    ),
  );

  const pop = h(
    "div",
    { class: "ctx-menu emoji-pop", role: "dialog", "aria-label": "Picture and background" },
    h(
      "div",
      { class: "emoji-head" },
      preview,
      h("div", { class: "emoji-tints" }, h("div", { class: "emoji-group-name" }, "Background"), h("div", { class: "tint-row" }, swatches)),
    ),
    h("div", { class: "emoji-scroll" }, sections),
    h(
      "div",
      { class: "emoji-foot" },
      h("button", { type: "button", class: "btn ghost", onclick: () => set({ emoji: null }) }, "No picture"),
      h("span", { class: "spacer" }),
      h("button", { type: "button", class: "btn primary", onclick: () => done() }, "Done"),
    ),
  );
  const done = () => {
    close();
    button.focus();
  };

  // Up and down go to the cell above or below, across the groups too.
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      return done();
    }
    const at = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const here = cells[at].getBoundingClientRect();
    let next = at;
    if (e.key === "ArrowLeft") next = Math.max(0, at - 1);
    else if (e.key === "ArrowRight") next = Math.min(cells.length - 1, at + 1);
    else {
      const down = e.key === "ArrowDown";
      let best = Infinity;
      cells.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const dy = down ? r.top - here.top : here.top - r.top;
        if (dy < 4) return;
        const score = dy * 10 + Math.abs(r.left - here.left);
        if (score < best) [best, next] = [score, i];
      });
    }
    cells[next].focus();
    cells[next].scrollIntoView({ block: "nearest" });
  });

  paint();
  document.body.appendChild(pop);
  place(pop, button);
  open = pop;
  anchor = button;
  void move(pop, { opacity: [0, 1], scale: [0.97, 1] }, { duration: 0.12, ease: EASE_OUT });
  const current = cells.find((c) => c.dataset.char === look.emoji) ?? cells[0];
  current.focus({ preventScroll: true });
  current.scrollIntoView({ block: "nearest" });
}

/** Under the button, or above it when there is more room there; never past
 *  the window's edges. In a short window the emoji list scrolls in less
 *  height, so the background row and Done always stay in view. */
function place(pop: HTMLElement, button: HTMLElement) {
  const EDGE = 6;
  const r = button.getBoundingClientRect();
  const list = pop.querySelector<HTMLElement>(".emoji-scroll")!;
  list.style.maxHeight = "";
  const below = window.innerHeight - r.bottom - 4 - EDGE;
  const above = r.top - 4 - EDGE;
  const room = Math.max(below, above);
  const over = pop.offsetHeight - room;
  if (over > 0) list.style.maxHeight = `${Math.max(96, list.offsetHeight - over)}px`;
  const height = pop.offsetHeight;
  const top = below >= height || below >= above ? r.bottom + 4 : r.top - 4 - height;
  pop.style.top = `${Math.max(EDGE, Math.min(top, window.innerHeight - height - EDGE))}px`;
  pop.style.left = `${Math.max(EDGE, Math.min(r.left, window.innerWidth - pop.offsetWidth - EDGE))}px`;
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (!open || open.contains(e.target as Node)) return;
    // The opening button's own click then finds the picker closed and leaves it so.
    if (anchor?.contains(e.target as Node)) anchor.dataset.closing = "1";
    close();
  },
  true,
);
window.addEventListener("blur", close);
window.addEventListener("resize", close);
// Something under it scrolled (the sheet, the page): it would be left
// floating away from its tile, so it closes. Its own list scrolling is not that.
document.addEventListener("scroll", (e) => open && !open.contains(e.target as Node) && close(), true);
