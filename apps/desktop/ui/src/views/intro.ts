// The first thing Kenning shows, once, before the onboarding: an address
// resolves out of noise, gives way to the mark drawing itself, the mark
// settles onto its tile with a soft chime, and the name rises under it.
// About two and a half seconds; any click or key skips it.

import { clear, h } from "../dom";
import { EASE_IN, EASE_OUT, move, POP, reduced, stagger } from "../motion";
import { playFor } from "../sound";

const ADDRESS = "0x28C6c06298d514Db089934071355E5743bf21d60";
const HEX = "0123456789abcdefABCDEF";
const NS = "http://www.w3.org/2000/svg";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Kenning's mark as separate parts, so each can arrive on its own. */
function mark(): { svg: SVGSVGElement; tile: SVGElement; tag: SVGGeometryElement; hole: SVGElement } {
  const el = <K extends string>(tag: K, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const svg = el("svg", { viewBox: "0 0 32 32", width: 96, height: 96, "aria-hidden": "true", class: "intro-mark" }) as SVGSVGElement;
  const tile = el("rect", { width: 32, height: 32, rx: 8, fill: "#3A55C9" });
  const g = el("g", { transform: "rotate(45 16 16)" });
  const tag = el("rect", { x: 7.05, y: 11.3, width: 17.9, height: 9.4, rx: 2.9, fill: "none", stroke: "#fff", "stroke-width": 2.1 }) as SVGGeometryElement;
  const hole = el("circle", { cx: 10.6, cy: 16, r: 1.7, fill: "#fff" });
  g.append(tag, hole);
  svg.append(tile, g);
  return { svg, tile, tag, hole };
}

export async function playIntro(host: HTMLElement, opts: { sounds: boolean; leaving: () => void }): Promise<void> {
  if (reduced()) return;

  const chars = [...ADDRESS].map(() => h("span", {}, " "));
  const line = h("div", { class: "intro-address", "aria-hidden": "true" }, chars);
  const { svg, tile, tag, hole } = mark();
  const glow = h("div", { class: "intro-glow" });
  const word = h("div", { class: "intro-word" }, [..."Kenning"].map((c) => h("span", {}, c)));
  const tagline = h("p", { class: "intro-tagline" }, "Know what you copied.");
  const stage = h("div", { class: "intro-stage" }, glow, line, h("div", { class: "intro-markwrap" }, svg), word, tagline);
  const root = h("div", { class: "intro", role: "img", "aria-label": "Kenning" }, stage);

  // Everything waits hidden in its first state, before the first paint.
  for (const el of [tile, hole]) el.style.opacity = "0";
  glow.style.opacity = "0";
  word.querySelectorAll("span").forEach((s) => (s.style.opacity = "0"));
  tagline.style.opacity = "0";
  host.appendChild(root);
  const length = tag.getTotalLength() + 1;
  tag.style.strokeDasharray = `${length}`;
  tag.style.strokeDashoffset = `${length}`;

  let skipped = false;
  const skip = () => (skipped = true);
  root.addEventListener("pointerdown", skip);
  document.addEventListener("keydown", skip, { once: true });

  // 1. An address resolves out of noise, left to right.
  await new Promise<void>((done) => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      chars.forEach((c, i) => {
        const at = 60 + i * 13;
        c.textContent = t >= at + 120 ? ADDRESS[i] : t >= at ? HEX[Math.floor(Math.random() * HEX.length)] : " ";
      });
      if (t < 60 + chars.length * 13 + 140 && !skipped) requestAnimationFrame(tick);
      else {
        chars.forEach((c, i) => (c.textContent = ADDRESS[i]));
        done();
      }
    };
    requestAnimationFrame(tick);
  });
  if (!skipped) await wait(220);

  // 2. The address gives way, from the edges in, and the mark draws itself.
  const mid = (chars.length - 1) / 2;
  chars.forEach((c, i) => void move(c, { opacity: 0, y: -4 }, { duration: 0.28, ease: EASE_IN, delay: (mid - Math.abs(i - mid)) * 0.007 }));
  void move(glow, { opacity: [0, 1], scale: [0.6, 1] }, { duration: 1.2, ease: EASE_OUT, delay: 0.15 });
  await wait(skipped ? 0 : 220);
  await new Promise<void>((done) => {
    const a = tag.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: skipped ? 1 : 560, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" });
    a.onfinish = () => done();
  });

  // 3. The tile slides in under it and the hole pops: the mark is whole.
  void move(tile, { opacity: [0, 1], scale: [0.6, 1] }, { ...POP, delay: 0 });
  void move(hole, { opacity: [0, 1], scale: [0, 1] }, { ...POP, delay: 0.08 });
  void move(svg, { scale: [1, 1.06, 1] }, { duration: 0.45, ease: "easeOut", delay: 0.05 });
  if (opts.sounds && !skipped) playFor("mine");

  // 4. The name rises under the mark.
  void move(word.querySelectorAll("span"), { opacity: [0, 1], y: [10, 0] }, { duration: 0.5, ease: EASE_OUT, delay: stagger(0.035, { startDelay: 0.2 }) });
  void move(tagline, { opacity: [0, 1], y: [6, 0] }, { duration: 0.5, ease: EASE_OUT, delay: 0.55 });
  await wait(skipped ? 0 : 1250);

  // 5. Out, upward, while the first step comes in underneath.
  root.removeEventListener("pointerdown", skip);
  document.removeEventListener("keydown", skip);
  await move(stage, { opacity: 0, y: -14, scale: 0.98 }, { duration: 0.38, ease: EASE_IN });
  opts.leaving();
  await move(root, { opacity: 0 }, { duration: 0.3, ease: EASE_OUT });
  clear(root);
  root.remove();
}
