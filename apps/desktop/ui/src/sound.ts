// Soft, short cues synthesised with WebAudio: no audio files, nothing loaded.
// Recognised: a gentle rising two-note chime. New: one warm note.
// Lookalike: two lower falling notes, distinct but never an alarm.

import type { State } from "./types";

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One bell-like note: sine plus a quiet octave, fast attack, soft decay. */
function note(freq: number, start: number, length: number, gain: number) {
  const a = audio();
  const t = a.currentTime + start;
  const out = a.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(gain, t + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, t + length);

  const lowpass = a.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 4200;
  out.connect(lowpass).connect(a.destination);

  for (const [mult, level, type] of [
    [1, 1, "sine"],
    [2, 0.18, "sine"],
    [1, 0.12, "triangle"],
  ] as const) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, t);
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
}

export function playFor(state: State) {
  try {
    switch (state) {
      case "lookalike":
        note(587.33, 0, 0.32, 0.075); // D5
        note(440.0, 0.16, 0.5, 0.075); // A4
        break;
      case "new":
        note(659.25, 0, 0.42, 0.05); // E5
        break;
      default:
        note(880.0, 0, 0.22, 0.045); // A5
        note(1318.51, 0.085, 0.36, 0.04); // E6
    }
  } catch {
    // No audio device: stay silent.
  }
}
