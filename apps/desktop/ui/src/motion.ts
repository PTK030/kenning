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

/** Run an animation, or jump to its end state when motion is reduced. */
export function move(targets: Targets, keyframes: DOMKeyframesDefinition, opts: Opts = {}): Promise<void> {
  const els = list(targets);
  if (!els.length) return Promise.resolve();
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
  shapes.forEach((s, i) => {
    const len = Math.ceil(s.getTotalLength?.() ?? 60) + 1;
    s.style.strokeDasharray = `${len}`;
    // Plain Web Animations: hidden until its turn, fully drawn afterwards.
    s.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: duration * 1000,
      delay: (delay + i * 0.12) * 1000,
      easing: `cubic-bezier(${EASE_OUT.join(",")})`,
      fill: "backwards",
    });
  });
}

export { animate, stagger };
