import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Lift, RiseTitle } from "../components/Reveal";
import { KNOWN, short } from "../address";
import { REPO } from "../links";

const WINDOW = { w: 880, h: 640 };
const BADGE = { w: 400, h: 128 };

// What the app shows when the guard catches a swap (guard.rs, warn_swap).
const ALERT = {
  kind: "alert",
  title: "The address you copied was swapped",
  text: `InstallUtil.exe swapped in a lookalike of your ${short(KNOWN)}. Do not paste it.`,
  action: { id: "restore", label: "Put mine back" },
  seconds: 8,
  sounds: false,
};

/**
 * A desktop with Kenning's real main window open on Protection and its real
 * alert in the corner, both the desktop app's own code in frames. A clipper
 * swaps an address: the alert comes up and the swap is listed; the address
 * is put back; the details open; then the clipboard test runs. Then again.
 */
function Desk() {
  const reduce = useReducedMotion();
  const area = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLIFrameElement>(null);
  const badge = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ win: 1, badge: 1 });
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(false);

  // Both windows keep their real size; on a narrow screen they are scaled down.
  useEffect(() => {
    const el = area.current!;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ win: Math.min(1, (w - 32) / WINDOW.w), badge: Math.min(1, (w - 32) / BADGE.w) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    let visible = false;
    const frames = [win.current!, badge.current!];
    const loaded = frames.map(
      (f) =>
        new Promise<void>((r) =>
          f.contentDocument?.readyState === "complete" && f.contentDocument.body?.childElementCount
            ? r()
            : f.addEventListener("load", () => r(), { once: true }),
        ),
    );
    const post = (f: HTMLIFrameElement | null, msg: object) => f?.contentWindow?.postMessage(msg, location.origin);

    const waiters = new Set<(event: string) => void>();
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && typeof e.data?.kenning === "string") waiters.forEach((w) => w(e.data.kenning));
    };
    addEventListener("message", onMessage);
    const next = (event: string) =>
      new Promise<string>((resolve) => {
        const w = (got: string) => {
          if (got !== event) return;
          waiters.delete(w);
          resolve(got);
        };
        waiters.add(w);
      });

    // Time only passes while the desk is in view.
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.35 });
    io.observe(area.current!);
    const sleep = async (ms: number) => {
      for (let left = ms; left > 0 && alive; ) {
        await new Promise((r) => setTimeout(r, 100));
        if (visible && !document.hidden) left -= 100;
      }
    };

    const play = async () => {
      await Promise.all(loaded);
      if (!alive) return;
      // The window draws itself once its overview has come back.
      await new Promise((r) => setTimeout(r, 400));
      setShown(true);
      if (reduce) {
        post(win.current, { swap: true });
        post(badge.current, { badge: ALERT });
        return;
      }
      await sleep(1800);
      // The swap: the alert in the corner, and the same event in the window.
      post(badge.current, { badge: ALERT });
      post(win.current, { swap: true });
      const pressed = await Promise.race([next("guard-action"), sleep(3400).then(() => "")]);
      if (!pressed && alive) {
        post(badge.current, { press: true });
        await Promise.race([next("guard-action"), sleep(800)]);
      }
      post(badge.current, { badge: null });
      await sleep(1000);
      post(win.current, { open: true });
      await sleep(6000);
      post(win.current, { close: true });
      await sleep(1200);
      post(win.current, { test: true });
      await sleep(9000);
      if (!alive) return;
      // Again, from a fresh window.
      setShown(false);
      await new Promise((r) => setTimeout(r, 450));
      if (alive) setRun((n) => n + 1);
    };
    void play();
    return () => {
      alive = false;
      io.disconnect();
      removeEventListener("message", onMessage);
    };
  }, [reduce, run]);

  return (
    <div className="guard-desk" ref={area} style={{ height: WINDOW.h * size.win + 48 }}>
      <div className={`gd-win${shown ? " shown" : ""}`} style={{ width: WINDOW.w * size.win, height: WINDOW.h * size.win }}>
        <iframe
          key={run}
          ref={win}
          src="app/main.html#protection"
          title="Kenning's main window, on Protection"
          width={WINDOW.w}
          height={WINDOW.h}
          tabIndex={-1}
          style={{ transform: `scale(${size.win})` }}
        />
      </div>
      <div className="gd-badge" style={{ width: BADGE.w * size.badge, height: BADGE.h * size.badge }}>
        <iframe
          key={run}
          ref={badge}
          src="app/badge.html"
          title="Kenning's alert"
          width={BADGE.w}
          height={BADGE.h}
          tabIndex={-1}
          style={{ transform: `scale(${size.badge})` }}
        />
      </div>
    </div>
  );
}

export function Guard() {
  return (
    <section className="guard" id="guard" aria-labelledby="guard-title">
      <div className="guard-in">
        <header className="guard-head">
          <div>
            <p className="guard-kicker" id="guard-title">
              Clipboard guard
            </p>
            <RiseTitle text="Copied right. Pasted wrong." className="section-heading" />
          </div>
          <p className="section-lead">
            Some malware waits for you to copy an address and writes its own over it, often one with your first and last characters. Kenning
            watches for the swap and tells you before you paste.
          </p>
        </header>

        <Desk />

        <div className="guard-facts">
          <Lift>
            <h3>Test your computer</h3>
            <p>Kenning copies a public address of each chain and watches whether anything writes over it.</p>
          </Lift>
          <Lift delay={0.08}>
            <h3>Off until you say so</h3>
            <p>It reads every copy, so it asks first. Nothing it sees is written to disk.</p>
          </Lift>
          <Lift delay={0.16}>
            <h3>Not an antivirus</h3>
            <p>
              It tells you something swaps addresses and names it.{" "}
              <a href={`${REPO}#clipboard-guard`} data-cursor="Open on GitHub" data-cursor-icon="out">
                How it decides
              </a>
            </p>
          </Lift>
        </div>
      </div>
    </section>
  );
}
