import { useEffect } from "react";
import { startSmoothScroll } from "./scroll";
import { Cursor } from "./components/Cursor";
import { Scrollbar } from "./components/Scrollbar";
import { Nav } from "./sections/Nav";
import { Hero } from "./sections/Hero";
import { Answers } from "./sections/Answers";
import { Story } from "./sections/Story";
import { Features } from "./sections/Features";
import { Trust } from "./sections/Trust";
import { Roadmap } from "./sections/Roadmap";
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
        <Answers />
        <Story />
        <Features />
        <Trust />
        <Roadmap />
        <Cta />
      </main>
      <Footer />
      <Scrollbar />
      <Cursor />
    </>
  );
}
