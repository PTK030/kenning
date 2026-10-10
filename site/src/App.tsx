import { useEffect } from "react";
import { startSmoothScroll } from "./scroll";
import { Cursor } from "./components/Cursor";
import { Scrollbar } from "./components/Scrollbar";
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
  useEffect(() => startSmoothScroll(), []);

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
      <Scrollbar />
      <Cursor />
    </>
  );
}
