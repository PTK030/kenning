import type { ReactNode } from "react";
import { Addr } from "../components/Addr";
import { Check, Plus } from "../components/icons";
import { Lift, RiseTitle } from "../components/Reveal";
import { KNOWN, POISON } from "../address";
import { RULES } from "../links";

function Tile({ kind, title, children, visual, link, i }: { kind: string; title: string; children: ReactNode; visual: ReactNode; link?: ReactNode; i: number }) {
  return (
    <Lift delay={(i % 2) * 0.08} className={`answer ${kind}`}>
      <h3>{title}</h3>
      <p>{children}</p>
      <div className="answer-visual" aria-hidden="true">
        {visual}
      </div>
      {link}
    </Lift>
  );
}

/** What Kenning says when you copy an address: one of four answers. */
export function Answers() {
  return (
    <section className="answers" aria-labelledby="answers-title">
      <header className="answers-head">
        <RiseTitle text="Four answers to one copy." className="section-heading" />
        <p className="section-lead">
          Whatever you copy from: a wallet, an explorer, a chat, a spreadsheet or a terminal. Kenning answers in the
          corner of the screen and never takes the focus from what you are doing.
        </p>
      </header>

      <div className="answers-grid">
        <Tile
          i={0}
          kind="known"
          title="A name you gave it."
          visual={
            <div className="mini-badge known">
              <span className="mb-icon">
                <Check />
              </span>
              <span className="mb-text">
                <b>Binance deposits</b>
                <code>0x28C6 c062 … 1d60</code>
              </span>
              <i className="mb-bar" />
            </div>
          }
          link={<a href="#features">How names work</a>}
        >
          Copy an address from your book and a badge says whose it is, then slides away after a few seconds.
        </Tile>

        <Tile
          i={1}
          kind="new"
          title="A first time."
          visual={
            <div className="mini-badge new">
              <span className="mb-icon">
                <Plus />
              </span>
              <span className="mb-text">
                <b>New address</b>
                <span>First time you copied it.</span>
              </span>
              <i className="mb-bar" />
            </div>
          }
        >
          An address you have never copied before is marked as new, once. There is nothing to click.
        </Tile>

        <Tile
          i={2}
          kind="lookalike"
          title="A near miss."
          visual={
            <div className="answer-panel">
              <span className="spec-who">You copied</span>
              <Addr text={POISON} other={KNOWN} marked />
              <span className="spec-who">Your Binance</span>
              <Addr text={KNOWN} other={POISON} marked />
            </div>
          }
          link={<a href={RULES}>Read the detection rules</a>}
        >
          Same start, same end, a different middle. A window shows both addresses in full with every difference
          marked, and one click puts the right one back.
        </Tile>

        <Tile
          i={3}
          kind="details"
          title="Any address, on request."
          visual={
            <div className="answer-keys">
              <kbd>Ctrl</kbd>
              <kbd>Alt</kbd>
              <kbd>D</kbd>
            </div>
          }
        >
          Select an address anywhere and press the shortcut to see everything Kenning knows about it. Your clipboard
          is left as it was.
        </Tile>
      </div>
    </section>
  );
}
