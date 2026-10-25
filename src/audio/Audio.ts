/**
 * Audio — WebAudio playback for the synthesised music and sound effects, a
 * gentle procedural ambience (sea + birds), a soft reverb, and the mute toggle
 * (M key, remembered between sessions).
 */

import { SOUND_GENERATORS, SAMPLE_RATE } from "./synth";

const STORAGE_KEY = "schatzkarten_audio";

class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambienceBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private music: { key: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private pendingMusic: string | null = null;
  private ambienceOn = false;
  private birdTimer: number | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").muted ?? false;
    } catch {
      // Reason: storage may be unavailable (private mode); default to sound on
    }
    // Reason: browsers only allow audio after a user gesture — unlock on the first key/click
    const unlock = () => this.ensureContext();
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyM" && !e.repeat) this.toggleMute();
    });
  }

  playSfx(key: string, volume = 1, rate = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(key);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  /** Loop a music track, cross-fading from the current one. */
  playMusic(key: string, fade = 1.2): void {
    if (!this.ctx) {
      this.pendingMusic = key;
      return;
    }
    if (this.music?.key === key) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.music) {
      const old = this.music;
      old.gain.gain.setTargetAtTime(0, now, fade / 4);
      old.src.stop(now + fade * 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(key);
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, now, fade / 4);
    src.connect(gain).connect(this.musicBus);
    src.start();
    this.music = { key, src, gain };
  }

  stopMusic(fade = 1): void {
    if (!this.ctx || !this.music) return;
    this.music.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 4);
    this.music.src.stop(this.ctx.currentTime + fade * 2);
    this.music = null;
  }

  /** Waves lapping on the shore plus occasional bird chirps. */
  setAmbience(on: boolean): void {
    this.ambienceOn = on;
    if (!this.ctx) return;
    this.ambienceBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.6);
    if (on && this.birdTimer === null) this.scheduleBird();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: this.muted }));
    } catch {
      // Reason: storage may be unavailable; muting still works for this session
    }
  }

  private ensureContext(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(limiter).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    reverb.connect(wet).connect(this.master);

    // Reason: soften the square-wave chiptunes so they sit nicely under the 3D world
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 5200;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(soften);
    soften.connect(this.master);
    soften.connect(reverb);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.6;
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(reverb);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = this.ambienceOn ? 1 : 0;
    this.ambienceBus.connect(this.master);
    this.startSea();

    if (this.pendingMusic) {
      const key = this.pendingMusic;
      this.pendingMusic = null;
      this.playMusic(key);
    }
    if (this.ambienceOn) this.setAmbience(true);
  }

  private buffer(key: string): AudioBuffer {
    let b = this.buffers.get(key);
    if (!b) {
      const gen = SOUND_GENERATORS[key];
      if (!gen) throw new Error(`Unknown sound: ${key}`);
      const samples = gen();
      b = this.ctx!.createBuffer(1, samples.length, SAMPLE_RATE);
      b.getChannelData(0).set(samples);
      this.buffers.set(key, b);
    }
    return b;
  }

  /** Decaying stereo noise used as a small-room reverb impulse. */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  /** Looping surf: low-passed noise with slow swells. */
  private startSea(): void {
    const ctx = this.ctx!;
    const seconds = 12;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let brown = 0;
      for (let i = 0; i < len; i++) {
        brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        const t = i / ctx.sampleRate;
        // Reason: two overlapping wave periods that divide the loop length evenly so it loops seamlessly
        const swell = 0.35 + 0.65 * Math.pow(Math.sin((Math.PI * t) / 4 + c) ** 2, 2) * (0.7 + 0.3 * Math.sin((Math.PI * t) / 6));
        d[i] = brown * 3.2 * swell;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(lp).connect(g).connect(this.ambienceBus);
    src.start();
  }

  private scheduleBird(): void {
    this.birdTimer = window.setTimeout(() => {
      this.birdTimer = null;
      if (!this.ambienceOn || !this.ctx) return;
      this.chirp();
      this.scheduleBird();
    }, 2500 + Math.random() * 6000);
  }

  /** A little bird call: 2–4 quick rising sine sweeps. */
  private chirp(): void {
    const ctx = this.ctx!;
    const base = 2200 + Math.random() * 1600;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const t = ctx.currentTime + i * 0.11;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      o.connect(g).connect(pan).connect(this.ambienceBus);
      o.start(t);
      o.stop(t + 0.1);
    }
  }
}

export const audio = new AudioSystem();
