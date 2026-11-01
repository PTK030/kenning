// Motion for every window, in one place: the same springs and curves
// everywhere, and nothing moves when the system asks for reduced motion.

import { animate, stagger, type AnimationPlaybackControls, type DOMKeyframesDefinition } from "motion";

export const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Soft, settled spring for things arriving. */
export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;
/** A little livelier, for icons and small confirmations. */
export const POP = { type: "spring", stiffness: 520, damping: 22 } as const;
/** Long settle: fast out, slow finish. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** Leaving: start slow, end fast. */
export const EASE_IN = [0.55, 0, 0.75, 0.25] as const;

type Targets = Element | Element[] | NodeListOf<Element> | HTMLCollection | null | undefined;
type Opts = Parameters<typeof animate>[2];

function list(t: Targets): Element[] {
  if (!t) return [];
  if (t instanceof Element) return [t];
  return Array.from(t);
}

/**
 * Put elements in their first keyframe right now. Motion starts animations
 * on the next frame, so without this a freshly inserted element is painted
 * once in its final state and then jumps back to the start: a flicker.
 */
function prime(els: Element[], keyframes: DOMKeyframesDefinition) {
  const k = keyframes as Record<string, unknown>;
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : undefined);
  const len = (v: unknown) => (typeof v === "number" ? `${v}px` : String(v));
  const parts: string[] = [];
  const x = first(k.x);
  const y = first(k.y);
  const rotate = first(k.rotate);
  const scale = first(k.scale);
  if (x !== undefined) parts.push(`translateX(${len(x)})`);
  if (y !== undefined) parts.push(`translateY(${len(y)})`);
  if (rotate !== undefined) parts.push(`rotate(${typeof rotate === "number" ? `${rotate}deg` : rotate})`);
  if (scale !== undefined) parts.push(`scale(${scale})`);
  const opacity = first(k.opacity);
  const filter = first(k.filter);
  const height = first(k.height);
  const width = first(k.width);
  for (const el of els) {
    const style = (el as HTMLElement).style;
    if (!style) continue;
    if (opacity !== undefined) style.opacity = String(opacity);
    if (parts.length) style.transform = parts.join(" ");
    if (filter !== undefined) style.filter = String(filter);
    if (height !== undefined) style.height = len(height);
    if (width !== undefined) style.width = len(width);
  }
}

/** Run an animation, or jump to its end state when motion is reduced. */
export function move(targets: Targets, keyframes: DOMKeyframesDefinition, opts: Opts = {}): Promise<void> {
  const els = list(targets);
  if (!els.length) return Promise.resolve();
  if (!reduced()) prime(els, keyframes);
  const controls: AnimationPlaybackControls = reduced()
    ? animate(els, keyframes, { duration: 0 })
    : animate(els, keyframes, opts);
  return controls.finished.then(() => undefined);
}

let settleTimer = 0;

/** While a window's entrance plays, the page must not scroll: parts that
 *  slide in from a few pixels outside would briefly overflow a window
 *  sized to its content and flash a scrollbar. */
export function settling(ms = 900) {
  document.documentElement.classList.add("entering");
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => document.documentElement.classList.remove("entering"), ms);
}

/** A sheet over the window arriving: the shade fades up while the card
 *  rises a few pixels and grows to size on a long ease-out. Its opacity
 *  runs on its own, shorter clock, so the card is solid before it settles;
 *  no spring, which would make it drift and wobble at the end. */
export function sheetIn(overlay: HTMLElement, card: HTMLElement) {
  void move(overlay, { opacity: [0, 1] }, { duration: 0.2, ease: EASE_OUT });
  void move(card, { y: [10, 0], scale: [0.975, 1] }, { duration: 0.28, ease: EASE_OUT });
  void move(card, { opacity: [0, 1] }, { duration: 0.18, ease: EASE_OUT });
}

/** The same, reversed and quicker: it speeds up from the first frame, so it
 *  never seems to hang before going. Nothing under it takes clicks
 *  meanwhile. */
export async function sheetOut(overlay: HTMLElement, card: HTMLElement | null) {
  overlay.style.pointerEvents = "none";
  await Promise.all([move(overlay, { opacity: 0 }, LEAVE), move(card, { opacity: 0, y: 6, scale: 0.98 }, LEAVE)]);
}

/** How everything leaves: the way it came, backwards and quicker, speeding
 *  up from the first frame so it never seems to hang before going. */
export const LEAVE = { duration: 0.16, ease: [0.4, 0, 1, 1] } as const;

/** Leaving and giving its room back as it goes: fading (and sinking by
 *  `y`) while its height, padding and margins close, so nothing after it
 *  jumps when it is hidden. Then hidden, unless `still()` says otherwise
 *  by then; its own sizes are handed back to the stylesheet either way. */
export async function collapse(el: HTMLElement, { y = 0, still = (): boolean => true } = {}) {
  const cs = getComputedStyle(el);
  el.style.overflow = "hidden";
  await move(
    el,
    {
      opacity: 0,
      ...(y ? { y } : {}),
      height: [el.offsetHeight, 0],
      paddingTop: [cs.paddingTop, "0px"],
      paddingBottom: [cs.paddingBottom, "0px"],
      marginTop: [cs.marginTop, "0px"],
      marginBottom: [cs.marginBottom, "0px"],
    },
    LEAVE,
  );
  if (still()) el.hidden = true;
  for (const prop of ["overflow", "height", "paddingTop", "paddingBottom", "marginTop", "marginBottom"] as const) el.style[prop] = "";
}

/** Children leaving the way `rise` brought them: sinking back and fading,
 *  together. Resolves once they are gone, for the caller to clear. */
export function sink(targets: Targets, { y = 10 } = {}): Promise<void> {
  return move(targets, { opacity: 0, y }, LEAVE);
}

/** One curve both ways: it moves from the first frame (a curve that starts
 *  slowly reads as a delay after the click) and settles gently. */
const FOLD = { duration: 0.26, ease: [0.4, 0, 0.2, 1] } as const;

/** Open or fold `body` under its `toggle` (which carries aria-expanded):
 *  the height glides and the content fades, from wherever it is now, so a
 *  second click mid-way turns it round. A release in What's new, a day in
 *  the journal. */
export function fold(toggle: HTMLElement, body: HTMLElement, open: boolean, animate = true) {
  toggle.setAttribute("aria-expanded", String(open));
  if (!animate) {
    body.hidden = !open;
    return;
  }
  // Its own padding goes with the height: a box cannot be shorter than its
  // padding, so it would stall at that height and then drop the rest.
  // Exact heights, fractions and all: rounded ones end half a pixel off,
  // and the layout snaps by that much when the inline height goes.
  const wasHidden = body.hidden;
  const from = wasHidden ? 0 : body.getBoundingClientRect().height;
  const fromPad = wasHidden ? ["0px", "0px"] : [getComputedStyle(body).paddingTop, getComputedStyle(body).paddingBottom];
  body.style.paddingTop = body.style.paddingBottom = body.style.height = "";
  body.hidden = false;
  const pad = [getComputedStyle(body).paddingTop, getComputedStyle(body).paddingBottom];
  const to = open ? body.getBoundingClientRect().height : 0;
  const toPad = open ? pad : ["0px", "0px"];
  // In place before the first frame: no padding showing for a frame.
  body.style.overflow = "hidden";
  body.style.paddingTop = fromPad[0];
  body.style.paddingBottom = fromPad[1];
  void move(
    body,
    {
      height: [from, to],
      paddingTop: [fromPad[0], toPad[0]],
      paddingBottom: [fromPad[1], toPad[1]],
      opacity: [open ? 0 : 1, open ? 1 : 0],
    },
    FOLD,
  ).then(() => {
    if (toggle.getAttribute("aria-expanded") !== String(open)) return;
    body.hidden = !open;
    for (const prop of ["height", "opacity", "overflow", "paddingTop", "paddingBottom"] as const) body.style[prop] = "";
  });
}

/** Children arriving one after another, lifting into place. */
export function rise(targets: Targets, { y = 10, delay = 0, gap = 0.045 } = {}): Promise<void> {
  return move(targets, { opacity: [0, 1], y: [y, 0] }, { ...SPRING, delay: stagger(gap, { startDelay: delay }) });
}

/** A line icon drawing itself: every stroke traced from start to end. */
export function draw(svg: SVGSVGElement | null, { delay = 0, duration = 0.5 } = {}): void {
  if (!svg || reduced()) return;
  const shapes = Array.from(svg.querySelectorAll<SVGGeometryElement>("path, circle, rect"));
  if (!shapes.length) return;
  // An icon not rendered yet (not in the page, or hidden) has no length:
  // show it as it is rather than draw it.
  const length = (s: SVGGeometryElement) => {
    try {
      return s.getTotalLength();
    } catch {
      return 0;
    }
  };
  const lengths = shapes.map(length);
  if (Math.max(...lengths) <= 0) return;
  const outline = shapes[lengths.indexOf(Math.max(...lengths))];
  const easing = `cubic-bezier(${EASE_OUT.join(",")})`;
  // The outline traces itself. The gap is longer than the stroke's round
  // cap, so nothing shows at the start before the line arrives.
  const len = Math.ceil(Math.max(...lengths)) + 1;
  const hidden = len + 4;
  outline.style.strokeDasharray = `${len} ${len + 8}`;
  outline.animate([{ strokeDashoffset: hidden }, { strokeDashoffset: 0 }], {
    duration: duration * 1000,
    delay: delay * 1000,
    easing,
    fill: "backwards",
  });
  // Everything inside comes in together once most of the outline is drawn.
  for (const s of shapes) {
    if (s === outline) continue;
    s.style.transformBox = "fill-box";
    s.style.transformOrigin = "center";
    s.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }], {
      duration: 220,
      delay: (delay + duration * 0.6) * 1000,
      easing,
      fill: "backwards",
    });
  }
}

export { animate, stagger };
