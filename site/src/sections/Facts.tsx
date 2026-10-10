import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { ease } from "../links";

function Count({ to, unit }: { to: number; unit: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView || reduce || !ref.current) return;
    const el = ref.current;
    const c = animate(0, to, { duration: 1.6, ease, onUpdate: (v) => (el.textContent = `${Math.round(v)}${unit}`) });
    return () => c.stop();
  }, [inView, reduce, to, unit]);
  return (
    <b ref={ref}>
      {to}
      {unit}
    </b>
  );
}

export function Facts() {
  return (
    <section className="facts" aria-label="Measured on Windows 11">
      <div>
        <Count to={8} unit=" MB" />
        <span>memory at rest</span>
      </div>
      <div>
        <Count to={45} unit=" ms" />
        <span>from copy to badge</span>
      </div>
      <div>
        <Count to={4} unit="" />
        <span>chains recognised</span>
      </div>
      <div>
        <Count to={0} unit="" />
        <span>accounts, trackers or servers</span>
      </div>
    </section>
  );
}
