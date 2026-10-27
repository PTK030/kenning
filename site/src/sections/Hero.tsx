import { motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { Download } from "../components/icons";
import { RiseTitle } from "../components/Reveal";
import { Scene } from "../components/Scene";
import { RELEASES, ease } from "../links";

/** The whole first screen is a Windows desktop, with Kenning at work on it. */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const fade = useTransform(scrollYProgress, [0.25, 0.85], [1, 0]);

  // Pointer position over the hero, from -0.5 to 0.5 on each axis.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  // A faint light that drifts after the pointer: a narrow range of travel,
  // a slow spring, and low opacity, so it reads as atmosphere, not a spotlight.
  const lazy = { stiffness: 40, damping: 20, mass: 1 };
  const glowX = useSpring(useTransform(px, [-0.5, 0.5], [45, 75]), lazy);
  const glowY = useSpring(useTransform(py, [-0.5, 0.5], [20, 50]), lazy);
  const glow = useMotionTemplate`radial-gradient(1100px circle at ${glowX}% ${glowY}%, rgb(58 85 201 / 22%), transparent 70%)`;

  return (
    <section className="hero" id="top" ref={ref} onPointerMove={onPointerMove}>
      <motion.div
        className="hero-wall"
        style={{ background: glow }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, ease }}
        aria-hidden="true"
      />
      <motion.div className="hero-stage" style={{ opacity: fade }}>
        <div className="hero-copy">
          <RiseTitle as="h1" className="hero-title" text="Know what you copied." delay={0.25} now />
          <Rise delay={0.7}>
            <p className="hero-lead">
              Kenning names every crypto address you copy, and warns you the moment one only looks like yours.
            </p>
          </Rise>
          <Rise delay={0.85}>
            <div className="hero-actions">
              <a className="btn btn-light btn-roll" href={RELEASES} data-cursor="Download" data-cursor-icon="download">
                <span className="roll">
                  <span>
                    <Download /> Download for Windows
                  </span>
                  <span aria-hidden="true">
                    <Download /> Download for Windows
                  </span>
                </span>
              </a>
              <span className="hero-fine">Free and open source</span>
            </div>
          </Rise>
        </div>
        <Scene px={px} py={py} />
      </motion.div>
    </section>
  );
}

function Rise({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay }}>
      {children}
    </motion.div>
  );
}
