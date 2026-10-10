import { motion } from "motion/react";

const PLACES = [
  "Phantom",
  "Rabby",
  "Ledger Live",
  "Safe",
  "Etherscan",
  "Binance",
  "Telegram",
  "Slack",
  "Excel",
  "your terminal",
  "Solscan",
  "mempool.space",
  "Tronscan",
];

/** Works wherever you copy: an endless strip of places addresses come from. */
export function Marquee() {
  const strip = PLACES.map((p) => (
    <span className="marquee-item" key={p}>
      {p}
    </span>
  ));
  return (
    <section className="marquee" aria-label="Works wherever you copy">
      <p className="marquee-label">Works wherever you copy</p>
      <div className="marquee-track">
        <motion.div
          className="marquee-strip"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 46, ease: "linear", repeat: Infinity }}
        >
          {strip}
          <span aria-hidden="true" style={{ display: "contents" }}>
            {strip}
          </span>
        </motion.div>
      </div>
    </section>
  );
}
