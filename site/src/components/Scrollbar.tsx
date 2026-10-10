import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { scrollToY } from "../scroll";
import { useFinePointer } from "./pointer";

const PAD = 6;
const MIN_THUMB = 48;

/**
 * A thin scrollbar that shows while you scroll or point at it, and fades
 * otherwise. Drag the thumb or click the track; wheel and keys work as
 * usual. Touch screens keep the system scrollbar.
 */
export function Scrollbar() {
  const fine = useFinePointer();
  const { scrollYProgress } = useScroll();
  const [size, setSize] = useState({ thumb: 80, track: 600, range: 1 });
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState(false);
  const idle = useRef(0);
  const start = useRef({ y: 0, scroll: 0 });

  useEffect(() => {
    if (!fine) return;
    const root = document.documentElement;
    root.classList.add("custom-scrollbar");
    const measure = () => {
      const vh = window.innerHeight;
      const doc = root.scrollHeight;
      const track = vh - PAD * 2;
      setSize({ thumb: Math.max(MIN_THUMB, (track * vh) / doc), track, range: Math.max(1, doc - vh) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      root.classList.remove("custom-scrollbar");
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [fine]);

  useMotionValueEvent(scrollYProgress, "change", () => {
    setActive(true);
    clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setActive(false), 1100);
  });

  const top = useTransform(scrollYProgress, (p) => PAD + p * (size.track - size.thumb));

  if (!fine) return null;

  const grab = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, scroll: window.scrollY };
    setDrag(true);
  };
  const dragMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const perPixel = size.range / (size.track - size.thumb);
    scrollToY(start.current.scroll + (e.clientY - start.current.y) * perPixel, true);
  };
  const letGo = () => setDrag(false);
  const jump = (e: PointerEvent<HTMLDivElement>) => {
    const f = (e.clientY - PAD - size.thumb / 2) / (size.track - size.thumb);
    scrollToY(Math.min(1, Math.max(0, f)) * size.range);
  };

  return (
    <div
      className={`sb${active || hover || drag ? " on" : ""}${hover || drag ? " wide" : ""}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={jump}
      aria-hidden="true"
    >
      <motion.div
        className={`sb-thumb${drag ? " held" : ""}`}
        style={{ y: top, height: size.thumb }}
        onPointerDown={grab}
        onPointerMove={dragMove}
        onPointerUp={letGo}
        onPointerCancel={letGo}
      />
    </div>
  );
}
