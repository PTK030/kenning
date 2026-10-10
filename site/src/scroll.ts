import Lenis from "lenis";

// One smooth-scroll instance for the page, so the custom scrollbar can
// drive the same scroll the wheel does.
let lenis: Lenis | null = null;

export function startSmoothScroll(): () => void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  lenis = new Lenis({ autoRaf: true, lerp: 0.085, anchors: true });
  return () => {
    lenis?.destroy();
    lenis = null;
  };
}

/** Scroll to `y`; `jump` skips the glide (used while dragging the thumb). */
export function scrollToY(y: number, jump = false) {
  if (lenis) lenis.scrollTo(y, { immediate: jump });
  else window.scrollTo({ top: y, behavior: jump ? "instant" : "smooth" });
}
