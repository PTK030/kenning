import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import logo from "../assets/logo.svg";
import { RELEASES, REPO, RULES, ease } from "../links";

/** Hides while you scroll down, comes back as soon as you scroll up. */
export function Nav() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(y > prev && y > 240);
    setSolid(y > window.innerHeight * 0.85);
  });

  return (
    <motion.header
      className={`nav${solid ? " solid" : ""}`}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: hidden ? -96 : 0, opacity: 1 }}
      transition={{ duration: 0.5, ease }}
    >
      <a className="brand" href="#top" aria-label="Kenning home">
        <img src={logo} alt="" width={30} height={30} />
        <span>Kenning</span>
      </a>
      <nav aria-label="Main">
        <a href="#story">Address poisoning</a>
        <a href="#features">Features</a>
        <a href="#trust">Trust</a>
        <a href={RULES}>Detection rules</a>
        <a href={REPO}>GitHub</a>
      </nav>
      <a className="btn btn-small" href={RELEASES}>
        Download
      </a>
    </motion.header>
  );
}
