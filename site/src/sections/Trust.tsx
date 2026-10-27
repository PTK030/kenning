import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Lift, Scrub } from "../components/Reveal";
import { CLIPBOARD_SRC, CORPUS, DENY, GATE, NETWORK_DOCS, ease } from "../links";

function Terminal({ lines }: { lines: [string, string][] }) {
  return (
    <pre className="term">
      {lines.map(([kind, text], i) => (
        <motion.span
          key={i}
          className={kind}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.35, duration: 0.4, ease }}
        >
          {text}
          {"\n"}
        </motion.span>
      ))}
    </pre>
  );
}

function Check({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="check" href={href} data-cursor="Open on GitHub" data-cursor-icon="out">
      {children}
    </a>
  );
}

export function Trust() {
  return (
    <section className="trust" id="trust" aria-labelledby="trust-title">
      <h2 id="trust-title" className="visually-hidden">
        Trust
      </h2>
      <div className="measured">
        <dl>
          <div>
            <dt>8 MB</dt>
            <dd>in memory at rest</dd>
          </div>
          <div>
            <dt>45 ms</dt>
            <dd>from copy to badge, about 0.4 s after a quiet spell</dd>
          </div>
        </dl>
        <p>
          Measured on Windows 11.{" "}
          <a href={GATE} data-cursor="Open on GitHub" data-cursor-icon="out">
            How it was measured
          </a>
        </p>
      </div>
      <Scrub
        className="scrub"
        text="A tool that reads your clipboard should be easy to check. These are properties of the code, not promises."
      />
      <div className="trust-grid">
        <Lift>
          <h3>Open source, MIT</h3>
          <p>Read every line, build it yourself, compare. The rules for spotting lookalikes are a public document with tests.</p>
          <Terminal
            lines={[
              ["cmd", "$ cargo test --workspace"],
              ["ok", "ok  53 core, 17 lookalike cases, 11 network, 7 CLI"],
            ]}
          />
          <Check href={CORPUS}>Check the 17 cases</Check>
        </Lift>
        <Lift delay={0.1}>
          <h3>Local only</h3>
          <p>Recognition runs on your machine. Its engine contains no network code, and the build fails if anyone adds it.</p>
          <Terminal
            lines={[
              ["cmd", "$ cargo deny check bans"],
              ["ok", "bans ok  reqwest, hyper, tokio: not allowed"],
            ]}
          />
          <Check href={DENY}>Check deny.toml</Check>
        </Lift>
        <Lift delay={0.2}>
          <h3>Your clipboard stays yours</h3>
          <p>Kenning writes to it only when you click. Content that password managers mark as private is skipped before it is read.</p>
          <Terminal
            lines={[
              ["dim", "reads   on your shortcut, or each copy"],
              ["dim", "writes  only when you click"],
              ["dim", "stores  validated addresses, never text"],
            ]}
          />
          <Check href={CLIPBOARD_SRC}>Check the clipboard code</Check>
        </Lift>
        <Lift delay={0.3}>
          <h3>Network off by default</h3>
          <p>Turn on on-chain lookups if you want them. Only the address is sent, to four public providers listed in the app.</p>
          <Terminal
            lines={[
              ["dim", "eth.blockscout.com"],
              ["dim", "api.mainnet-beta.solana.com"],
              ["dim", "mempool.space   api.trongrid.io"],
            ]}
          />
          <Check href={NETWORK_DOCS}>Check the provider list</Check>
        </Lift>
      </div>
    </section>
  );
}
