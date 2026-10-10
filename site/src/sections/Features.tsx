import { AnimatePresence, motion, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { RiseTitle } from "../components/Reveal";
import { ease } from "../links";

const CHAINS = [
  { name: "EVM", note: "EIP-55 checksums", addr: "0x5aAe b605 3F3E … BeAed" },
  { name: "Solana", note: "base58, 32 bytes", addr: "EPjF Wdd5 AufqSS … Dt1v" },
  { name: "Bitcoin", note: "legacy to taproot", addr: "bc1p y3m7 … 8hq0" },
  { name: "Tron", note: "base58check", addr: "TR7N Hqje KQxG … 6t" },
];

function Card({ children, className = "", i }: { children: ReactNode; className?: string; i: number }) {
  return (
    <motion.article
      className={`card ${className}`}
      initial={{ opacity: 0, y: 60, rotate: i % 2 ? 1.5 : -1.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ type: "spring", stiffness: 90, damping: 18, delay: (i % 3) * 0.08 }}
    >
      {children}
    </motion.article>
  );
}

function ChainCycle() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v + 1) % CHAINS.length), 2200);
    return () => clearInterval(t);
  }, []);
  const c = CHAINS[n];
  return (
    <div className="chain-cycle" aria-hidden="true">
      <AnimatePresence mode="wait">
        <motion.div
          key={c.name}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.45, ease }}
        >
          <b>{c.name}</b>
          <span>{c.note}</span>
          <code>{c.addr}</code>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const LOG = [
  ["09:14", "ania checked Payroll Safe"],
  ["09:15", "lookalike shown, Binance deposits"],
  ["09:15", "copied the correct address"],
  ["09:16", "added Ola, design"],
];

/** Wide screens: the section pins and vertical scrolling slides the cards sideways. */
function useWide() {
  const query = "(min-width: 861px) and (prefers-reduced-motion: no-preference)";
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function Features() {
  const wide = useWide();
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);

  useLayoutEffect(() => {
    if (!wide || !track.current) return;
    const measure = () => setTravel(Math.max(0, track.current!.scrollWidth - window.innerWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wide]);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const x = useSpring(useTransform(scrollYProgress, [0.04, 0.96], [0, -travel]), { stiffness: 140, damping: 30, mass: 0.4 });
  const bar = useTransform(scrollYProgress, [0.04, 0.96], [0, 1]);

  const cards = (
    <>
        <Card i={0} className="tall blue">
          <h3>Your names</h3>
          <p>Label wallets, deposit addresses and multisigs once. Kenning shows the name every time you copy them.</p>
          <ul className="mini-book">
            {[
              ["Binance deposits", "0x28C6…1d60"],
              ["Cold wallet", "bc1q85…tp8"],
              ["Payroll Safe", "0x5aAe…eAed"],
              ["Ola, design", "0x9f2B…04c3"],
            ].map(([n, a], k) => (
              <motion.li
                key={n}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + k * 0.08, duration: 0.6, ease }}
              >
                <span>{n}</span>
                <code>{a}</code>
              </motion.li>
            ))}
          </ul>
        </Card>
        <Card i={1}>
          <h3>Four chains</h3>
          <p>Checksums are verified, so a typo is caught before you send.</p>
          <ChainCycle />
        </Card>
        <Card i={2} className="ice">
          <h3>Public labels, with sources</h3>
          <p>Routers, bridges and stablecoins are recognised out of the box. Each label links to where it came from.</p>
          <div className="mini-label">
            <b>Uniswap V3: Router 2</b>
            <span>source: docs.uniswap.org</span>
          </div>
        </Card>
        <Card i={3} className="graphite">
          <h3>A journal for audits</h3>
          <p>What was checked, by whom and when, kept locally. Useful when a second signer asks how you verified a payout.</p>
          <ol className="mini-log">
            {LOG.map(([t, s], k) => (
              <motion.li
                key={k}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + k * 0.25, duration: 0.5, ease }}
              >
                <time>{t}</time> {s}
              </motion.li>
            ))}
          </ol>
        </Card>
        <Card i={4}>
          <h3>Team books</h3>
          <p>Point Kenning at a read-only book in your team's repository. Everyone sees the same names, reviewed like code.</p>
          <code className="mini-path">books = ["~/ops/kenning.toml"]</code>
        </Card>
        <Card i={5} className="ice">
          <h3>On-chain, when you ask</h3>
          <p>Turn on lookups and the badge also says whether an address was ever used. A lookalike that never was is a strong sign.</p>
          <div className="mini-label">
            <b>Never used on chain</b>
            <span>Ethereum via Blockscout</span>
          </div>
        </Card>
    </>
  );

  if (!wide) {
    return (
      <section className="features" id="features" aria-labelledby="features-title">
        <RiseTitle text="Every address, by name." className="section-title" />
        <div className="bento">{cards}</div>
      </section>
    );
  }

  return (
    <section
      className="features pinned"
      id="features"
      ref={section}
      aria-labelledby="features-title"
      style={{ height: `calc(100svh + ${travel}px)` }}
    >
      <div className="hscroll-stage">
        <motion.div className="hscroll-track" ref={track} style={{ x }}>
          <div className="hscroll-intro">
            <RiseTitle text="Every address, by name." className="section-title" />
            <p className="section-lead">Keep scrolling. Everything Kenning knows about an address, in one place.</p>
          </div>
          {cards}
        </motion.div>
        <div className="hscroll-progress" aria-hidden="true">
          <motion.span style={{ scaleX: bar }} />
        </div>
      </div>
    </section>
  );
}
