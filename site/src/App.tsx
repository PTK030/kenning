import { useEffect } from "react";
import Lenis from "lenis";
import { Nav } from "./sections/Nav";
import { Hero } from "./sections/Hero";
import { Marquee } from "./sections/Marquee";
import { Story } from "./sections/Story";
import { Quiet } from "./sections/Quiet";
import { Features } from "./sections/Features";
import { Trust } from "./sections/Trust";
import { Facts } from "./sections/Facts";
import { Cta } from "./sections/Cta";
import { Footer } from "./sections/Footer";

export default function App() {
  // Smooth, weighted scrolling. Pinned sections are driven by the same scroll
  // position, so they glide instead of stepping. Off for reduced motion.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.085, anchors: true });
    return () => lenis.destroy();
  }, []);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Marquee />
        <Story />
        <Quiet />
        <Features />
        <Trust />
        <Facts />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
