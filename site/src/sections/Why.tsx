import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";

// Why Kenning exists, read aloud by the scroll: the title, then one paragraph
// at a time, full screen, each word lighting up as the reading reaches it,
// then the answer in the title's type. *Starred* words are the ones the
// argument rests on.
const TITLE = "Why I'm building Kenning.";
const PARAGRAPHS = [
  "Every address-poisoning story I read went the same way. Someone pays the same deposit address every week. One morning they copy the newest row in their history, check the *first and last characters* as always, and paste.",
  "Nobody in that story is careless. Wallets shorten addresses to their start and end, so that is what people learn to check. And the *start and end* are exactly what an attacker can make in a few minutes.",
  "I didn't want to write another warning for people to read. I wanted the computer to do the one check people can't: *compare every character*, the moment you copy, and stay quiet the rest of the time.",
];
const CLOSE = "That's Kenning.";

type Word = { text: string; key: boolean };

function words(paragraph: string): Word[] {
  let key = false;
  return paragraph.split(" ").map((raw) => {
    const opens = raw.startsWith("*");
    const closes = raw.replace(/[.,:;]$/, "").endsWith("*");
    if (opens) key = true;
    const word = { text: raw.replaceAll("*", ""), key };
    if (closes) key = false;
    return word;
  });
}

// The scroll in stretches: a short one for the title, one per paragraph, and
// one for the close. Each is [from, to] in the section's progress.
const WEIGHTS = [0.6, ...PARAGRAPHS.map(() => 1), 0.8];
const TOTAL = WEIGHTS.reduce((a, b) => a + b, 0);
const STRETCHES = WEIGHTS.map((w, i) => {
  const from = WEIGHTS.slice(0, i).reduce((a, b) => a + b, 0) / TOTAL;
  return [from, from + w / TOTAL] as const;
});

/**
 * A value along the scroll, held at its first and last outputs outside the
 * range. The range is spelled out from 0 to 1: Motion runs these on the
 * compositor, and a keyframe list that stops short of either end gets the
 * element's own value there instead, so a faded paragraph would come back.
 */
function useAlong(progress: MotionValue<number>, input: number[], output: number[]) {
  const i = [...input];
  const o = [...output];
  if (i[0] > 0) {
    i.unshift(0);
    o.unshift(o[0]);
  }
  if (i[i.length - 1] < 1) {
    i.push(1);
    o.push(o[o.length - 1]);
  }
  return useTransform(progress, i, o);
}

export function Why() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // Without motion: the same words, simply there to read.
  if (reduce) {
    return (
      <section className="why why-still" id="why" ref={ref} aria-labelledby="why-title">
        <div className="why-in">
          <h2 id="why-title" className="why-title">
            {TITLE}
          </h2>
          {PARAGRAPHS.map((p, i) => (
            <p key={i} className="why-p">
              {words(p).map((w, j) => (
                <span key={j} className={w.key ? "why-key" : undefined}>
                  {w.text}{" "}
                </span>
              ))}
            </p>
          ))}
          <p className="why-title">{CLOSE}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="why" id="why" ref={ref} aria-labelledby="why-title" style={{ height: `${TOTAL * 110 + 20}vh` }}>
      <div className="why-stage">
        <div className="why-page">
          <Title progress={scrollYProgress} />
          {PARAGRAPHS.map((p, i) => (
            <Paragraph key={i} text={p} stretch={STRETCHES[i + 1]} progress={scrollYProgress} />
          ))}
          <Close progress={scrollYProgress} />
        </div>
      </div>
    </section>
  );
}

/** The title is there when the section pins, and makes way for the first paragraph. */
function Title({ progress }: { progress: MotionValue<number> }) {
  const [from, to] = STRETCHES[0];
  const leave = [from + (to - from) * 0.55, to];
  const opacity = useAlong(progress, leave, [1, 0]);
  const y = useAlong(progress, leave, [0, -40]);
  return (
    <motion.h2 id="why-title" className="why-title" style={{ opacity, y }}>
      {TITLE}
    </motion.h2>
  );
}

/** One paragraph's stretch of the scroll: it arrives, is read word by word, holds, and leaves. */
function Paragraph({ text, stretch: [from, to], progress }: { text: string; stretch: readonly [number, number]; progress: MotionValue<number> }) {
  const span = to - from;
  const at = [from, from + span * 0.08, from + span * 0.9, to];
  const opacity = useAlong(progress, at, [0, 1, 1, 0]);
  const y = useAlong(progress, at, [40, 0, 0, -40]);
  const list = words(text);
  // Reading runs from just after it arrives to well before it leaves, so the
  // last words stay lit for a moment.
  const start = from + span * 0.1;
  const end = from + span * 0.72;
  const step = (end - start) / list.length;
  return (
    <motion.p className="why-p" style={{ opacity, y }} aria-label={text.replaceAll("*", "")}>
      {list.map((w, i) => (
        <ReadWord key={i} word={w} at={start + i * step} step={step} progress={progress} />
      ))}
    </motion.p>
  );
}

/** A word lit by the reading: dim before, bright after, and marked while the reading is on it. */
function ReadWord({ word, at, step, progress }: { word: Word; at: number; step: number; progress: MotionValue<number> }) {
  const opacity = useAlong(progress, [at, at + step], [0.16, 1]);
  // The mark trails the reading across about three words.
  const mark = useAlong(progress, [at - step, at, at + step * 2, at + step * 4], [0, 1, 1, 0]);
  const background = useTransform(mark, (m) => `rgb(138 164 255 / ${(m * 0.22).toFixed(3)})`);
  return (
    <>
      <motion.span className={word.key ? "why-w why-key" : "why-w"} style={{ opacity, background }} aria-hidden="true">
        {word.text}
      </motion.span>{" "}
    </>
  );
}

/** The answer, in the title's type. */
function Close({ progress }: { progress: MotionValue<number> }) {
  const [from, to] = STRETCHES[STRETCHES.length - 1];
  const span = to - from;
  const opacity = useAlong(progress, [from + span * 0.02, from + span * 0.35], [0, 1]);
  const y = useAlong(progress, [from + span * 0.02, from + span * 0.5], [40, 0]);
  return (
    <motion.p className="why-title" style={{ opacity, y }}>
      {CLOSE}
    </motion.p>
  );
}
