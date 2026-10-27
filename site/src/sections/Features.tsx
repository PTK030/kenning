import { motion } from "motion/react";
import type { ReactNode } from "react";
import { CopyCommand } from "../components/CopyCommand";
import { RiseTitle } from "../components/Reveal";
import { CLI_DOCS, FILES_DOCS, LABELS_SRC, NETWORK_DOCS, ease } from "../links";
import recognitions from "../app/recognitions.json";

const LOG = [
  ["09:14", "ania checked Payroll Safe"],
  ["09:15", "lookalike shown, Binance deposits"],
  ["09:15", "copied the correct address"],
  ["09:16", "added Ola, design"],
];

const BOOK = [
  ["Binance deposits", "0x28C6…1d60"],
  ["Cold wallet", "bc1q85…tp8"],
  ["Payroll Safe", "0x5aAe…eAed"],
  ["Ola, design", "0x9f2B…04c3"],
];

const { lookalike } = recognitions;

/** One line of the sheet: the name, what it does with where to check it, and a piece of the app. */
function Row({ name, children, proof, href, visual }: { name: string; children: ReactNode; proof: string; href: string; visual: ReactNode }) {
  return (
    <motion.li
      className="feat"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.8, ease }}
    >
      <h3>{name}</h3>
      <div className="feat-text">
        <p>{children}</p>
        <a className="proof" href={href}>
          {proof}
        </a>
      </div>
      <div className="feat-visual">{visual}</div>
    </motion.li>
  );
}

export function Features() {
  return (
    <section className="features" id="features" aria-labelledby="features-title">
      <div className="features-in">
        <header className="features-head">
          <RiseTitle text="Every address, by name." className="section-heading" />
          <p className="section-lead">Everything Kenning knows about an address, and where each piece comes from.</p>
        </header>

        <ul className="feat-list">
          <Row name="Your names" proof="Your book is a plain TOML file" href={FILES_DOCS} visual={
            <ul className="mini-book" aria-hidden="true">
              {BOOK.map(([n, a]) => (
                <li key={n}>
                  <span>{n}</span>
                  <code>{a}</code>
                </li>
              ))}
            </ul>
          }>
            Label wallets, deposit addresses and multisigs once: EVM, Solana, Bitcoin and Tron addresses. Checksums are verified, so a typo is caught before you send.
          </Row>

          <Row name="Public labels, with sources" proof="28 labels, each with its source" href={LABELS_SRC} visual={
            <div className="mini-label" aria-hidden="true">
              <b>Uniswap V3: Router 2</b>
              <span>source: docs.uniswap.org</span>
            </div>
          }>
            Routers, tokens and exchanges are recognised out of the box. Each label links to where it came from, and a
            new one is only accepted with a source a reviewer can open.
          </Row>

          <Row name="Team books" proof="One line in config.toml" href={FILES_DOCS} visual={
            <code className="mini-path" aria-hidden="true">
              books = ["~/ops/kenning.toml"]
            </code>
          }>
            Point Kenning at a read-only book in your team's repository. Everyone sees the same names, and changes are
            reviewed like code.
          </Row>

          <Row name="A journal for audits" proof="Kept locally in journal.jsonl" href={FILES_DOCS} visual={
            <ol className="mini-log" aria-hidden="true">
              {LOG.map(([t, s], k) => (
                <li key={k}>
                  <time>{t}</time> {s}
                </li>
              ))}
            </ol>
          }>
            What was checked, by whom and when. Useful when a second signer asks how you verified a payout.
          </Row>

          <Row name="On-chain, when you ask" proof="The four providers, listed" href={NETWORK_DOCS} visual={
            <div className="mini-label" aria-hidden="true">
              <b>Never used on chain</b>
              <span>Ethereum via Blockscout</span>
            </div>
          }>
            Turn on lookups and the badge also says whether an address was ever used. A lookalike that never was is a
            strong sign. Only the address is sent.
          </Row>

          <Row name="Command line" proof="Every command, with exit codes" href={CLI_DOCS} visual={
            <div className="feat-cli">
              <pre className="term" aria-label="Example output of ken --json">
                <span className="cmd">$ ken --json 0x28C6C0aa…1d60{"\n"}</span>
                <span className="dim">
                  {`{ "state": "${lookalike.state}",\n  "headline": "${lookalike.headline}",\n  "detail": "${lookalike.detail}" }\n`}
                </span>
                <span className="ok">exit 20</span>
              </pre>
              <CopyCommand />
            </div>
          }>
            The engine behind the app, as <code>ken</code>, for scripts and other programs. Every command takes <code>--json</code>,
            and <code>ken serve --stdio</code> speaks JSON-RPC.
          </Row>
        </ul>
      </div>
    </section>
  );
}
