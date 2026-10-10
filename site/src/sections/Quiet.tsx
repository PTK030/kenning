import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "../components/icons";
import { Lift, RiseTitle } from "../components/Reveal";
import { ease } from "../links";

type Step = { kind: "known" | "new" | "gap"; ms: number; row?: number };
const LOOP: Step[] = [
  { kind: "gap", ms: 900 },
  { kind: "known", ms: 4200, row: 0 },
  { kind: "gap", ms: 1100 },
  { kind: "new", ms: 4200, row: 2 },
];

const SHEET = [
  ["Binance deposits", "0x28C6c0…1d60", "2,400"],
  ["Payroll Safe", "0x5aAeb6…BeAed", "18,000"],
  ["Ola, design", "0x9f2B71…04c3", "1,150"],
  ["Cold wallet", "bc1q85…tp8", "0.40"],
];

/** A small desktop: a spreadsheet, a tray, and the badge doing its job. */
export function Quiet() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setI((n) => (n + 1) % LOOP.length), LOOP[i].ms);
    return () => clearTimeout(t);
  }, [i, inView]);

  const step = LOOP[i];

  return (
    <section className="quiet" aria-labelledby="quiet-title">
      <div className="quiet-copy">
        <RiseTitle text="Quiet until it matters." className="section-title" />
        <Lift delay={0.15}>
          <p className="section-lead">
            Copy an address you know and a badge confirms its name in the corner, then slides away. Copy a new one
            and it says so once. Nothing steals focus from what you are doing.
          </p>
        </Lift>
      </div>

      <Lift delay={0.1} className="desk-wrap">
        <div className="desk" ref={ref} aria-hidden="true">
          <div className="sheet">
            <div className="sheet-head">
              <span>Payouts, October</span>
            </div>
            <div className="sheet-grid">
              {SHEET.map((r, n) => (
                <div className={`sheet-row${step.row === n && step.kind !== "gap" ? " copied" : ""}`} key={n}>
                  <span>{r[0]}</span>
                  <code>{r[1]}</code>
                  <span>{r[2]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="desk-tray">
            <span className="tray-time">14:02</span>
          </div>

          <AnimatePresence>
            {step.kind !== "gap" && (
              <motion.div
                key={i}
                className={`mini-badge ${step.kind}`}
                initial={{ opacity: 0, y: 26, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.98, transition: { duration: 0.35, ease } }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                <span className="mb-icon">{step.kind === "known" ? <Check /> : <Plus />}</span>
                <span className="mb-text">
                  {step.kind === "known" ? (
                    <>
                      <b>Binance deposits</b>
                      <code>0x28C6 c062 … 1d60</code>
                    </>
                  ) : (
                    <>
                      <b>New address</b>
                      <span>First time you copied it.</span>
                    </>
                  )}
                </span>
                <motion.i
                  className="mb-bar"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: (step.ms - 400) / 1000, ease: "linear" }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Lift>
    </section>
  );
}
