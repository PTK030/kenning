import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Addr } from "../components/Addr";
import { Alert, Copy, Download, Replay } from "../components/icons";
import { RiseTitle } from "../components/Reveal";
import { KNOWN, POISON } from "../address";
import { INSTALL_CLI, RELEASES, ease } from "../links";
import { flashCursor } from "../components/pointer";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const opacity = useTransform(scrollYProgress, [0.35, 0.9], [1, 0]);
  const lift = useTransform(scrollYProgress, [0, 1], [0, 140]);

  // Pointer position over the hero, from -0.5 to 0.5 on each axis.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const glowX = useTransform(px, [-0.5, 0.5], [10, 90]);
  const glowY = useTransform(py, [-0.5, 0.5], [0, 80]);
  const glow = useMotionTemplate`radial-gradient(900px circle at ${glowX}% ${glowY}%, rgb(58 85 201 / 34%), transparent 62%)`;

  return (
    <section className="hero" id="top" ref={ref} onPointerMove={onPointerMove}>
      <motion.div className="hero-glow" style={{ background: glow }} aria-hidden="true" />
      <motion.div className="hero-inner" style={{ scale, opacity, y: lift }}>
        <RiseTitle as="h1" className="hero-title" text="Know what you copied." delay={0.1} now />
        <div className="hero-row">
          <motion.p
            className="hero-lead"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.55 }}
          >
            Kenning names every crypto address you copy, and opens a window the moment one only looks like an
            address you know. The rest of the time it stays out of your way.
          </motion.p>
          <motion.div
            className="hero-actions"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.7 }}
          >
            <a className="btn btn-light" href={RELEASES} data-cursor="Download" data-cursor-icon="download">
              <Download /> Download for Windows
            </a>
            <CopyCommand />
          </motion.div>
        </div>
        <Specimen px={px} py={py} />
      </motion.div>
    </section>
  );
}

function CopyCommand() {
  const [hint, setHint] = useState("Copy");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CLI);
      setHint("Copied");
      flashCursor("Copied");
    } catch {
      setHint("Select and copy");
    }
    setTimeout(() => setHint("Copy"), 1800);
  };
  return (
    <button className="command" type="button" onClick={copy} data-cursor="Copy" data-cursor-icon="copy">
      <code>{INSTALL_CLI}</code>
      <span className="command-hint" aria-live="polite">
        {hint}
      </span>
    </button>
  );
}

/** The lookalike window, tilting toward the pointer, playing its sequence once. */
function Specimen({ px, py }: { px: MotionValue<number>; py: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const spring = { stiffness: 120, damping: 18, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [9, -9]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-12, 12]), spring);
  const shineX = useTransform(px, [-0.5, 0.5], [0, 100]);
  const shine = useMotionTemplate`linear-gradient(105deg, transparent ${useTransform(shineX, (v) => v - 25)}%, rgb(255 255 255 / 9%) ${shineX}%, transparent ${useTransform(shineX, (v) => v + 25)}%)`;

  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (reduce) {
      setPhase(3);
      return;
    }
    setPhase(0);
    const timers = [
      setTimeout(() => setPhase(1), 2100),
      setTimeout(() => setPhase(2), 3300),
      setTimeout(() => setPhase(3), 4300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [run, reduce]);

  return (
    <div className="specimen-stage">
      <motion.div className="specimen-tilt" style={{ rotateX, rotateY }}>
        <motion.figure
          className="specimen"
          initial={{ opacity: 0, y: 90, rotateX: 28, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
          transition={{ duration: 1.3, ease, delay: 0.85 }}
          aria-label="Kenning compares a copied address with the one you know"
          key={run}
        >
          <motion.div className="specimen-shine" style={{ background: shine }} aria-hidden="true" />
          <div className="specimen-bar">
            <span className={`specimen-state${phase >= 2 ? " alert" : ""}`}>
              <Alert /> {phase >= 2 ? "Lookalike" : "Comparing"}
            </span>
            <button className="replay" type="button" onClick={() => setRun((r) => r + 1)} aria-label="Play again" data-cursor="Play again" data-cursor-icon="replay">
              <Replay />
            </button>
          </div>

          <div className="spec-row">
            <span className="spec-who">Your Binance</span>
            <Addr text={KNOWN} other={POISON} marked={phase >= 2} scramble delay={1100} />
          </div>
          <AnimatePresence>
            {phase >= 1 && (
              <motion.div
                className="spec-row copied"
                initial={{ opacity: 0, y: 22, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, ease }}
              >
                <span className="spec-who">You copied</span>
                <Addr text={POISON} other={KNOWN} marked={phase >= 2} scramble />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase >= 3 && (
              <motion.figcaption
                className="verdict"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease }}
              >
                <div>
                  <strong>This is not your Binance address.</strong>
                  <span>The first 6 and last 4 characters match. The 30 in between do not.</span>
                </div>
                <motion.span
                  className="fix"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.25 }}
                >
                  <Copy /> Copy the correct address
                </motion.span>
              </motion.figcaption>
            )}
          </AnimatePresence>
        </motion.figure>
      </motion.div>
    </div>
  );
}
