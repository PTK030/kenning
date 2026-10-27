import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ease } from "../links";
// Real output of Kenning's core for the page's pair, with the known address in
// a book as "Binance": `ken add <known> Binance --note "my deposits"`, then
// `ken --json <address>` for each.
import data from "../app/recognitions.json";

/** The scene is laid out at the windows' real sizes, then fitted to its area. */
const WIDE = { w: 900, h: 620, lines: { x: 0, y: 40 }, badge: { x: 0, y: 214 }, look: { x: 240, y: 200 } };
const NARROW = { w: 720, h: 700, lines: { x: 0, y: 0 }, badge: { x: 0, y: 180 }, look: { x: 40, y: 290 } };
const LOOK = { w: 640, h: 392 };
const BADGE = { w: 400, h: 128 };

// Two lines of a wallet's history after an address-poisoning attack: the
// exchange you paid yesterday, and a worthless transfer from its lookalike.
const LINES = [
  { what: "Sent 2,500 USDT", when: "Yesterday", address: data.known.address.text },
  { what: "Received 0 USDT", when: "Just now", address: data.lookalike.address.text },
];
const knownBadge = { kind: "recognition", recognition: data.known, seconds: 4, sounds: false };

/**
 * Two addresses floating in the dark, copied one after the other, and Kenning
 * answering with its own windows: the badge and the lookalike window are the
 * desktop app's pages (app/*.html), going through the same sequence the app
 * does when you copy. The lookalike window works if you click it.
 */
export function Scene({ px, py }: { px: MotionValue<number>; py: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const area = useRef<HTMLDivElement>(null);
  const look = useRef<HTMLIFrameElement>(null);
  const badge = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, narrow: false });
  const [shown, setShown] = useState(false);
  // The frames stay out of sight until their pages have loaded: a frame
  // still waiting for its styles paints a white box.
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [copied, setCopied] = useState(-1);
  const [open, setOpen] = useState(false);

  const L = size.narrow ? NARROW : WIDE;
  const fit = size.w ? Math.min(size.w / L.w, size.h / L.h, 1.3) : 0;

  // The camera: turned a little away, drifting with the pointer, and pushing
  // in on the warning when it opens.
  const zoom = useMotionValue(1);
  const drift = { stiffness: 40, damping: 18 };
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-9, -3]), drift);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [4, -2]), drift);

  useEffect(() => {
    const el = area.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight, narrow: innerWidth < 1000 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    let visible = true;
    let hovering = false;
    const frames = [look.current!, badge.current!];
    const loaded = frames.map(
      (f) =>
        new Promise<void>((r) =>
          f.contentDocument?.readyState === "complete" && f.contentDocument.body?.childElementCount
            ? r()
            : f.addEventListener("load", () => r(), { once: true }),
        ),
    );
    const post = (f: HTMLIFrameElement | null, msg: object) => f?.contentWindow?.postMessage(msg, location.origin);

    // What was clicked inside Kenning's windows.
    const waiters = new Set<(event: string) => void>();
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && typeof e.data?.kenning === "string") waiters.forEach((w) => w(e.data.kenning));
    };
    addEventListener("message", onMessage);
    const next = (...events: string[]) =>
      new Promise<string>((resolve) => {
        const w = (event: string) => {
          if (!events.includes(event)) return;
          waiters.delete(w);
          resolve(event);
        };
        waiters.add(w);
      });

    // Time only passes while the scene is on screen, so nobody misses a beat.
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(area.current!);
    const sleep = async (ms: number, holdOnHover = false) => {
      for (let left = ms; left > 0 && alive; ) {
        await new Promise((r) => setTimeout(r, 100));
        if (visible && !document.hidden && !(holdOnHover && hovering)) left -= 100;
      }
    };
    const lookWindow = look.current!.parentElement!;
    const enter = () => (hovering = true);
    const leave = () => (hovering = false);
    lookWindow.addEventListener("mouseenter", enter);
    lookWindow.addEventListener("mouseleave", leave);

    /** Select a line, then copy it: the selection sweeps across, then the keys. */
    const copyLine = async (i: number) => {
      setCopied(-1);
      setSelected(i);
      await sleep(650);
      setCopied(i);
      await sleep(500);
    };

    let variant = 0;
    const showLookalike = () => {
      setOpen(true);
      post(look.current, { lookalike: { recognition: data.lookalike, variant: variant++, sounds: false } });
    };
    const showBadge = async () => {
      post(badge.current, { badge: knownBadge });
      await Promise.race([sleep(knownBadge.seconds * 1000), next("hide-badge")]);
      post(badge.current, { badge: null });
    };

    const play = async () => {
      await Promise.all(loaded);
      if (!alive) return;
      setReady(true);
      if (reduce) {
        setShown(true);
        showLookalike();
        return;
      }
      await sleep(900);
      setShown(true);
      await sleep(1300);

      while (alive) {
        // Copy the exchange address you paid yesterday: Kenning names it.
        await copyLine(0);
        await showBadge();
        await sleep(600);

        // Copy the newest one, which only looks the same: the window opens.
        await copyLine(1);
        if (!alive) return;
        showLookalike();
        void animate(zoom, 1.06, { duration: 2.6, ease });
        let settled = false;
        // Nobody clicked: after a moment to read, the fix is pressed for you.
        void sleep(4600, true).then(() => {
          if (!settled && alive) post(look.current, { press: true });
        });
        const outcome = await next("copy-correct", "dismiss", "mark-mine");
        settled = true;
        setOpen(false);
        setSelected(-1);
        setCopied(-1);
        void animate(zoom, 1, { duration: 1.6, ease });
        if (!alive) return;

        // The right address is back on the clipboard, and Kenning says so.
        if (outcome === "copy-correct") {
          await sleep(350);
          await showBadge();
        }
        await sleep(1200);
      }
    };
    void play();

    return () => {
      alive = false;
      waiters.clear();
      removeEventListener("message", onMessage);
      io.disconnect();
      lookWindow.removeEventListener("mouseenter", enter);
      lookWindow.removeEventListener("mouseleave", leave);
    };
  }, [reduce, zoom]);

  return (
    <div className={`scene${ready ? " ready" : ""}`} ref={area}>
      <div className="scene-canvas" style={{ width: L.w, height: L.h, transform: `translate(-50%, -50%) scale(${fit})` }}>
        <motion.div
          className="scene-cam"
          style={{ rotateY, rotateX, scale: zoom, transformOrigin: `${L.look.x + LOOK.w / 2}px ${L.look.y + LOOK.h / 2}px` }}
        >
          <ul className={`scene-lines${shown ? " shown" : ""}${open ? " behind" : ""}`} style={{ left: L.lines.x, top: L.lines.y }} aria-hidden="true">
            {LINES.map((line, i) => (
              <li key={i} className={`${selected === i ? "selected" : ""}${copied === i ? " copied" : ""}`}>
                <span className="scene-what">
                  {line.what} <span>· {line.when}</span>
                </span>
                <span className="scene-addr">
                  <span className="scene-code">
                    <span className="scene-sel" />
                    <code>{line.address}</code>
                  </span>
                  <span className="scene-keys">
                    <kbd>Ctrl</kbd>
                    <kbd>C</kbd>
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="scene-badge" style={{ left: L.badge.x, top: L.badge.y }}>
            <iframe ref={badge} src="app/badge.html" title="Kenning's badge" width={BADGE.w} height={BADGE.h} tabIndex={-1} />
          </div>

          <div className={`win${open ? " open" : ""}`} style={{ left: L.look.x, top: L.look.y }}>
            <iframe ref={look} src="app/lookalike.html" title="Kenning's lookalike window" width={LOOK.w} height={LOOK.h} tabIndex={-1} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
