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

/** A short breath of filtered noise sweeping upward: moving on. */
function breath(start: number, length: number, gain: number, from: number, to: number) {
  const a = audio();
  const t = a.currentTime + start;
  const frames = Math.ceil(a.sampleRate * length);
  const buffer = a.createBuffer(1, frames, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(from, t);
  band.frequency.exponentialRampToValueAtTime(to, t + length);
  const out = a.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(gain, t + length * 0.35);
  out.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(band).connect(out).connect(a.destination);
  src.start(t);
  src.stop(t + length + 0.02);
}

export type Cue = "step" | "back" | "key" | "tick" | "on" | "off";

/** Small interface sounds for the onboarding and settings, quieter than
 *  the recognition sounds above so those keep their meaning. */
export function cue(name: Cue) {
  try {
    switch (name) {
      case "step": // forward: a soft rising breath
        breath(0, 0.22, 0.05, 700, 2400);
        break;
      case "back": // backward: the same breath, falling
        breath(0, 0.2, 0.045, 2200, 650);
        break;
      case "key": // a key going down: low and short
        note(220, 0, 0.07, 0.04);
        break;
      case "tick": // something done: two light notes up
        note(1046.5, 0, 0.16, 0.028); // C6
        note(1568.0, 0.07, 0.24, 0.024); // G6
        break;
      case "on":
        note(784.0, 0, 0.1, 0.026); // G5
        note(1046.5, 0.05, 0.14, 0.024); // C6
        break;
      case "off":
        note(784.0, 0, 0.1, 0.024); // G5
        note(587.33, 0.05, 0.14, 0.022); // D5
        break;
    }
  } catch {
    // No audio device: stay silent.
  }
}
