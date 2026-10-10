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
  for (const el of els) {
    const style = (el as HTMLElement).style;
    if (!style) continue;
    if (opacity !== undefined) style.opacity = String(opacity);
    if (parts.length) style.transform = parts.join(" ");
    if (filter !== undefined) style.filter = String(filter);
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
