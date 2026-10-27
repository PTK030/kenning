import logo from "../assets/logo.svg";
import { CLI_DOCS, GATE, ISSUES, RELEASES, REPO, RULES } from "../links";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <img src={logo} alt="" width={28} height={28} />
        <span>Kenning</span>
        <p>Know what you copied.</p>
      </div>
      <nav aria-label="Product">
        <h2>Product</h2>
        <a href={RELEASES}>Download</a>
        <a href={CLI_DOCS}>Command line</a>
        <a href={RULES}>Detection rules</a>
        <a href={GATE}>How it was measured</a>
      </nav>
      <nav aria-label="Project">
        <h2>Project</h2>
        <a href={REPO}>GitHub</a>
        <a href="#roadmap">Roadmap</a>
        <a href={ISSUES}>Report an issue</a>
        <a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a>
      </nav>
      <p className="footer-note">This page loads no third-party scripts, fonts or trackers.</p>
    </footer>
  );
}
