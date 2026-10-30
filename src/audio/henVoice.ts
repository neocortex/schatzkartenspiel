/**
 * Hen voices synthesised with WebAudio: a quick "bok", a startled "ba-GAWK",
 * a happy cackle and the chick's "piep". The shared sound bank has no animal
 * sounds, so the hens (Mia's flock and Chuleta) have their own small audio graph.
 * Respects the global mute toggle (M key).
 */

import { audio } from "./Audio";

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let lastAt = 0;

function context(): AudioContext | null {
  if (audio.muted) return null;
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.32;
    out.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One syllable: a buzzy sawtooth through a vocal band-pass, gliding f0 → f1 with a little warble. */
function syllable(c: AudioContext, t: number, f0: number, f1: number, dur: number, vol: number, formant: number): void {
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const warble = c.createOscillator();
  warble.frequency.value = 38;
  const depth = c.createGain();
  depth.gain.value = f0 * 0.04;
  warble.connect(depth).connect(osc.frequency);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(formant, t);
  bp.frequency.exponentialRampToValueAtTime(formant * 0.8, t + dur);
  bp.Q.value = 2.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(bp).connect(g).connect(out!);
  for (const o of [osc, warble]) {
    o.start(t);
    o.stop(t + dur + 0.03);
  }
}

/** Rate-limit so a whole flock clucking at once doesn't turn into noise. */
function ready(gap: number): AudioContext | null {
  const c = context();
  if (!c || c.currentTime - lastAt < gap) return null;
  lastAt = c.currentTime;
  return c;
}

export const henVoice = {
  bok(pitch = 1): void {
    const c = ready(0.12);
    if (!c) return;
    syllable(c, c.currentTime, 560 * pitch, 400 * pitch, 0.1, 0.55, 1250 * pitch);
  },

  bagawk(pitch = 1): void {
    const c = ready(0.25);
    if (!c) return;
    const t = c.currentTime;
    syllable(c, t, 470 * pitch, 430 * pitch, 0.07, 0.35, 1100 * pitch);
    syllable(c, t + 0.1, 820 * pitch, 520 * pitch, 0.27, 0.75, 1700 * pitch);
  },

  /** Proud "bok bok bok ba-GAAWK" when a hen lands in the coop. */
  cackle(pitch = 1): void {
    const c = ready(0.2);
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) syllable(c, t + i * 0.13, 540 * pitch, 420 * pitch, 0.08, 0.45, 1250 * pitch);
    syllable(c, t + 0.42, 480 * pitch, 440 * pitch, 0.06, 0.35, 1100 * pitch);
    syllable(c, t + 0.5, 880 * pitch, 560 * pitch, 0.32, 0.7, 1800 * pitch);
  },

  peep(): void {
    const c = ready(0.15);
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(2700, t + i * 0.12);
      o.frequency.exponentialRampToValueAtTime(3600, t + i * 0.12 + 0.07);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.08);
      o.connect(g).connect(out!);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.1);
    }
  },

  dispose(): void {
    void ctx?.close();
    ctx = null;
    out = null;
    lastAt = 0;
  },
};
