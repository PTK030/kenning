import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowOut, Copy, Download, Pointer, Replay } from "./icons";
import { useFinePointer } from "./pointer";

type Label = { text: string; icon?: string };

const ICONS: Record<string, ReactNode> = {
  copy: <Copy />,
  download: <Download />,
  replay: <Replay />,
  out: <ArrowOut />,
};

/**
 * The page's cursor: the same white arrow the story section uses, with a
 * small dark label beside it over anything that does something
 * (`data-cursor="Download"`). The arrow sits exactly on the pointer; only
 * the label trails a little.
 */
export function Cursor() {
  const enabled = useFinePointer() && !useReducedMotion();
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const lx = useSpring(x, { stiffness: 600, damping: 42, mass: 0.4 });
  const ly = useSpring(y, { stiffness: 600, damping: 42, mass: 0.4 });
  const [visible, setVisible] = useState(false);
  const [down, setDown] = useState(false);
  const [hover, setHover] = useState<Label | null>(null);
  const [flash, setFlash] = useState<Label | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("custom-cursor");
    let flashTimer = 0;

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
      const t = (e.target as Element | null)?.closest<HTMLElement>("[data-cursor]");
      const text = t?.dataset.cursor;
      setHover((prev) => (prev?.text === text ? prev : text ? { text, icon: t?.dataset.cursorIcon } : null));
    };
    // Over an embedded page (the hero's app windows) the pointer belongs to
    // that page and its own cursor shows; ours would only freeze at the edge.
    const over = (e: PointerEvent) => {
      if ((e.target as Element | null)?.tagName === "IFRAME") setVisible(false);
    };
    const press = () => setDown(true);
    const release = () => setDown(false);
    const leave = () => setVisible(false);
    const onFlash = (e: Event) => {
      setFlash((e as CustomEvent<Label>).detail);
      clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => setFlash(null), 1500);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerover", over);
    window.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    document.addEventListener("mouseleave", leave);
    window.addEventListener("cursor:flash", onFlash);
    return () => {
      root.classList.remove("custom-cursor");
      clearTimeout(flashTimer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      document.removeEventListener("mouseleave", leave);
      window.removeEventListener("cursor:flash", onFlash);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;
  const label = flash ?? hover;

  return (
    <div className="cursor-layer" aria-hidden="true">
      <motion.div className="cursor-label-anchor" style={{ x: lx, y: ly }}>
        <AnimatePresence>
          {visible && label && (
            <motion.span
              key={label.text}
              className="cursor-label"
              initial={{ opacity: 0, scale: 0.8, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 520, damping: 30 }}
            >
              {label.icon && ICONS[label.icon]}
              {label.text}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
      <motion.div
        className="cursor-arrow"
        style={{ x, y }}
        animate={{ opacity: visible ? 1 : 0, scale: down ? 0.86 : 1 }}
        transition={{ duration: 0.14 }}
      >
        <Pointer />
      </motion.div>
    </div>
  );
}
