import { motion, useMotionValue, useSpring } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { Download } from "../components/icons";
import { RiseTitle } from "../components/Reveal";
import { RELEASES, REPO } from "../links";

/** A button that leans toward the pointer. */
function Magnetic({ children, href, className }: { children: ReactNode; href: string; className: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 14 });
  const sy = useSpring(y, { stiffness: 220, damping: 14 });
  const move = (e: PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.3);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.4);
  };
  const leave = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <motion.a className={className} href={href} style={{ x: sx, y: sy }} onPointerMove={move} onPointerLeave={leave}>
      {children}
    </motion.a>
  );
}

export function Cta() {
  return (
    <section className="cta" aria-labelledby="cta-title">
      <RiseTitle text="Name the addresses you use. Kenning handles the rest." className="cta-title" />
      <div className="cta-actions">
        <Magnetic className="btn btn-light btn-big" href={RELEASES}>
          <Download /> Download for Windows
        </Magnetic>
        <Magnetic className="btn btn-ghost btn-big" href={REPO}>
          View the source
        </Magnetic>
      </div>
      <p className="cta-fine">Free and open source under MIT. Windows today, macOS and Linux next.</p>
    </section>
  );
}
