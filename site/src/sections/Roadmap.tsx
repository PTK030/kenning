import { motion } from "motion/react";
import { RiseTitle } from "../components/Reveal";
import { ISSUES, ease } from "../links";
import { ROADMAP, STATUS } from "../roadmap";

// How long each stretch of the line takes to draw, and when the next begins.
const DRAW = 0.7;

/** Where the project stands today, and what comes next, along one line. */
export function Roadmap() {
  return (
    <section className="roadmap" id="roadmap" aria-labelledby="roadmap-title">
      <div className="roadmap-head">
        <RiseTitle text="Where Kenning is." className="section-heading" />
        <ul className="status" aria-label="Status">
          {STATUS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      {/* Done, then where it is now, then what comes next: the line is solid
          up to now and dashed after it, and it draws itself in that order. */}
      <motion.ol className="timeline" initial="out" whileInView="in" viewport={{ once: true, margin: "-15% 0px" }}>
        {ROADMAP.map((phase, i) => {
          const kind = phase.title.toLowerCase();
          return (
            <li key={phase.title} className={`phase ${kind}`}>
              <div className="phase-rail" aria-hidden="true">
                <motion.span
                  className="phase-line"
                  variants={{ out: { scaleX: 0, scaleY: 0 }, in: { scaleX: 1, scaleY: 1, transition: { duration: DRAW, ease, delay: i * DRAW * 0.8 } } }}
                />
                <motion.span
                  className="phase-dot"
                  variants={{ out: { scale: 0 }, in: { scale: 1, transition: { type: "spring", stiffness: 400, damping: 18, delay: i * DRAW * 0.8 } } }}
                />
              </div>
              <motion.div
                className="phase-body"
                variants={{ out: { opacity: 0, y: 16 }, in: { opacity: 1, y: 0, transition: { duration: 0.6, ease, delay: i * DRAW * 0.8 + 0.15 } } }}
              >
                <h3>
                  {phase.title}
                  {kind === "now" && <span className="here">You are here</span>}
                </h3>
                <ul>
                  {phase.items.map((it) => (
                    <li key={it.text}>
                      {it.href ? (
                        <a href={it.href} data-cursor="Open on GitHub" data-cursor-icon="out">
                          {it.text}
                        </a>
                      ) : (
                        it.text
                      )}
                      {it.funded && <span className="funded">Funded by {it.funded}</span>}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </li>
          );
        })}
      </motion.ol>

      <p className="roadmap-fine">
        Something missing or wrong?{" "}
        <a href={ISSUES} data-cursor="Open on GitHub" data-cursor-icon="out">
          Open an issue
        </a>
        .
      </p>
    </section>
  );
}
