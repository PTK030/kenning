import logo from "../assets/logo.svg";
import { RELEASES, REPO, RULES } from "../links";

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
        <a href={`${REPO}#cli`}>Command line</a>
        <a href={RULES}>Detection rules</a>
      </nav>
      <nav aria-label="Project">
        <h2>Project</h2>
        <a href={REPO}>GitHub</a>
        <a href={`${REPO}/issues`}>Report an issue</a>
        <a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a>
      </nav>
      <p className="footer-note">This page loads no third-party scripts, fonts or trackers.</p>
    </footer>
  );
}
