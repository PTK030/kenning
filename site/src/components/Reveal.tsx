import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, type ReactNode } from "react";
import { ease } from "../links";

/** A headline whose words rise out of a mask, once, when it scrolls into view. */
export function RiseTitle({
  text,
  as: Tag = "h2",
  className = "",
  delay = 0,
  now = false,
}: {
  text: string;
  as?: "h1" | "h2";
  className?: string;
  delay?: number;
  /** Play on load instead of on scroll. */
  now?: boolean;
}) {
  const words = text.split(" ");
  const play = now ? { animate: "in" } : { whileInView: "in", viewport: { once: true, margin: "-12% 0px" } };
  return (
    <Tag className={className} aria-label={text}>
      <motion.span initial="out" {...play} style={{ display: "inline" }}>
        {words.map((w, i) => (
          <span className="word-mask" key={i} aria-hidden="true">
            <motion.span
              className="word"
              variants={{
                out: { y: "105%", rotate: 4 },
                in: { y: "0%", rotate: 0, transition: { duration: 0.9, ease, delay: delay + i * 0.07 } },
              }}
            >
              {w}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/** Fades and lifts its children into place the first time they are seen. */
export function Lift({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.9, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A paragraph that brightens word by word as you scroll through it. */
export function Scrub({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.5"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <ScrubWord key={i} p={scrollYProgress} from={i / words.length} to={(i + 1) / words.length}>
          {w}
        </ScrubWord>
      ))}
    </p>
  );
}

function ScrubWord({ p, from, to, children }: { p: MotionValue<number>; from: number; to: number; children: string }) {
  const opacity = useTransform(p, [from, to], [0.16, 1]);
  return <motion.span style={{ opacity }}>{children} </motion.span>;
}
