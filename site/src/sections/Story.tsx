import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { Addr } from "../components/Addr";
import { ArrowIn, ArrowOut, Coins, Copy, Layers, Pointer } from "../components/icons";
import { KNOWN, POISON, short } from "../address";
import { STUDY, ease } from "../links";

// Address poisoning is a real sequence, so the acts are numbered.
const ACTS = [
  {
    title: "You pay someone you know.",
    body: `Your exchange, a client, a friend. Their address now sits in your wallet history as ${short(KNOWN)}.`,
  },
  {
    title: "A stranger sends you nothing.",
    body: "A zero-value transfer arrives from an address generated to share the same start and end. That takes minutes on a graphics card.",
  },
  {
    title: "You copy from your history.",
    body: "Both rows read 0x28C6…1d60. You take the newest one, the way anyone would.",
  },
  {
    title: "Kenning tells you before you paste.",
    body: "The moment you copy it, both addresses appear in full with every difference marked. One click puts the right one back.",
  },
];

export function Story() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [act, setAct] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setAct(Math.min(ACTS.length - 1, Math.floor(v * ACTS.length))));

  return (
    <section className="story" id="story" ref={ref} aria-labelledby="story-title">
      <div className="story-stage">
        <div className="story-copy">
          <h2 id="story-title" className="story-kicker">
            How address poisoning works
          </h2>
          <p className="story-scale">
            270 million attempts on Ethereum and BSC in two years, and at least $83.8M lost.{" "}
            <a href={STUDY}>USENIX Security 2025</a>
          </p>
          <ol className="acts">
            {ACTS.map((a, i) => (
              <li key={i} className={i === act ? "now" : i < act ? "past" : ""}>
                <span className="act-n">{i + 1}</span>
                <span className="act-t">{a.title}</span>
              </li>
            ))}
          </ol>
          <div className="act-body" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.p
                key={act}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease }}
              >
                {ACTS[act].body}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="story-progress" aria-hidden="true">
            <motion.span style={{ scaleX: scrollYProgress }} />
          </div>
        </div>

        <div className="story-visual">
          <motion.div
            className="wallet"
            animate={{ scale: act === 3 ? 0.94 : 1, opacity: act === 3 ? 0.45 : 1, filter: act === 3 ? "blur(1.5px)" : "blur(0px)" }}
            transition={{ duration: 0.6, ease }}
          >
            <div className="wallet-head">
              <b>Activity</b>
              <span className="chips">
                <span className="chip">
                  <Coins /> USDT
                </span>
                <span className="chip">
                  <Layers /> Ethereum
                </span>
              </span>
            </div>
            <ul className="tx-list">
              <AnimatePresence initial={false}>
                {act >= 1 && (
                  <motion.li
                    key="poison"
                    className={`tx${act >= 2 ? " picked" : ""}`}
                    initial={{ opacity: 0, height: 0, y: -20 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.55, ease }}
                  >
                    <TxRow dir="in" what="Received" amount="0 USDT" who={POISON} when="just now" />
                    <AnimatePresence>
                      {act >= 2 && (
                        <motion.span
                          className="cursor"
                          initial={{ opacity: 0, x: 60, y: 40 }}
                          animate={{ opacity: 1, x: 0, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.7, ease }}
                        >
                          <Pointer />
                          <motion.span
                            className="copied-tip"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.6, type: "spring", stiffness: 300, damping: 20 }}
                          >
                            <Copy /> Copied
                          </motion.span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.li>
                )}
              </AnimatePresence>
              <motion.li layout className="tx">
                <TxRow dir="out" what="Sent" amount="2,500 USDT" who={KNOWN} when="3 days ago" />
              </motion.li>
              <motion.li layout className="tx">
                <TxRow dir="out" what="Sent" amount="120 USDT" who="0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" when="last week" />
              </motion.li>
            </ul>
          </motion.div>

          <AnimatePresence>
            {act === 3 && (
              <motion.div
                className="story-kenning"
                initial={{ opacity: 0, y: 60, scale: 0.9, rotateX: 18 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                exit={{ opacity: 0, y: 40, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 140, damping: 18 }}
              >
                <p className="sk-title">This is not your Binance address.</p>
                <div className="sk-rows">
                  <span className="spec-who">You copied</span>
                  <Addr text={POISON} other={KNOWN} marked />
                  <span className="spec-who">Your Binance</span>
                  <Addr text={KNOWN} other={POISON} marked />
                </div>
                <span className="fix">
                  <Copy /> Copy the correct address
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function TxRow({ dir, what, amount, who, when }: { dir: "in" | "out"; what: string; amount: string; who: string; when: string }) {
  return (
    <>
      <span className={`tx-icon ${dir}`}>{dir === "in" ? <ArrowIn /> : <ArrowOut />}</span>
      <span className="tx-main">
        <b>{what}</b>
        <code>
          {dir === "in" ? "from" : "to"} {short(who)}
        </code>
      </span>
      <span className="tx-side">
        <b>{amount}</b>
        <span>{when}</span>
      </span>
    </>
  );
}
