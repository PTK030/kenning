import { motion, useMotionValue, useSpring } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { Download } from "../components/icons";
import { RiseTitle } from "../components/Reveal";
import { RELEASES, REPO } from "../links";

/** How far a button may lean toward the pointer, in pixels. */
const LEAN = 6;

/** A button that leans slightly toward the pointer, never onto its neighbour. */
function Magnetic({ children, href, className, cursor, icon }: { children: ReactNode; href: string; className: string; cursor: string; icon: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 26 });
  const sy = useSpring(y, { stiffness: 260, damping: 26 });
  const move = (e: PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    x.set(Math.max(-1, Math.min(1, dx)) * LEAN);
    y.set(Math.max(-1, Math.min(1, dy)) * LEAN * 0.6);
  };
  const leave = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <motion.a className={className} href={href} style={{ x: sx, y: sy }} onPointerMove={move} onPointerLeave={leave} data-cursor={cursor} data-cursor-icon={icon}>
      {children}
    </motion.a>
  );
}

export function Cta() {
  return (
    <section className="cta" aria-labelledby="cta-title">
      <RiseTitle text="Name the addresses you use. Kenning handles the rest." className="cta-title" />
      <div className="cta-actions">
        <Magnetic className="btn btn-light btn-big" href={RELEASES} cursor="Download" icon="download">
          <Download /> Download for Windows
        </Magnetic>
        <Magnetic className="btn btn-ghost btn-big" href={REPO} cursor="Open GitHub" icon="out">
          View the source
        </Magnetic>
      </div>
      <p className="cta-fine">Free and open source under MIT. Windows today, macOS and Linux next.</p>
    </section>
  );
}
