import { motion } from "motion/react";
import { chunks, sameMask, useScramble } from "../address";

type Props = {
  text: string;
  /** The address to compare against; differing characters can then be marked. */
  other?: string;
  marked?: boolean;
  scramble?: boolean;
  delay?: number;
  className?: string;
};

/** A full address in groups of four. Differences light up one after another. */
export function Addr({ text, other, marked = false, scramble = false, delay = 0, className = "" }: Props) {
  const mask = other ? sameMask(text, other) : null;
  const shown = useScramble(text, scramble, delay);
  let order = 0;

  return (
    <span className={`addr ${className}`} aria-label={text} role="img">
      {chunks(text).map((group, g) => (
        <span className="grp" key={g} aria-hidden="true">
          {group.map((i) => {
            const diff = mask ? !mask[i] : false;
            const n = diff ? order++ : 0;
            const on = marked && diff;
            return (
              <motion.span
                key={i}
                className={`ch${diff ? " d" : ""}${on ? " on" : ""}`}
                style={{ transitionDelay: on ? `${n * 22}ms` : "0ms" }}
                animate={on ? { y: [0, -5, 0] } : { y: 0 }}
                transition={{ delay: on ? n * 0.022 : 0, duration: 0.42, ease: "easeOut" }}
              >
                {shown[i]}
              </motion.span>
            );
          })}
        </span>
      ))}
    </span>
  );
}
