/**
 * Programmatic chiptune sound generation using Web Audio API.
 * All game audio is created here — no external sound files needed.
 * Parallel to SpriteFactory.ts which generates all visual sprites.
 */

// ─── WAV Encoding Helpers ───────────────────────────────────────────────────

/** Encode raw PCM float samples as a base64 WAV data URI. */
function encodeWav(samples: Float32Array, sampleRate: number): string {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // Reason: WAV header is 44 bytes with RIFF/WAVE chunk structure
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:audio/wav;base64," + btoa(binary);
}

// ─── Synthesis Primitives ───────────────────────────────────────────────────

const SAMPLE_RATE = 22050;

/** Generate samples using a synthesis function. */
function generate(duration: number, fn: (t: number, i: number) => number): Float32Array {
  const len = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    samples[i] = fn(i / SAMPLE_RATE, i);
  }
  return samples;
}

/** Square wave oscillator (chiptune staple). */
function square(freq: number, t: number): number {
  return Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1;
}

/** Triangle wave oscillator. */
function triangle(freq: number, t: number): number {
  const p = (freq * t) % 1;
  return 4 * Math.abs(p - 0.5) - 1;
}

/** Sawtooth wave oscillator. */
function sawtooth(freq: number, t: number): number {
  return 2 * ((freq * t) % 1) - 1;
}

/** White noise. */
function noise(): number {
  return Math.random() * 2 - 1;
}

/** Simple linear ADSR envelope (0-1). */
function adsr(t: number, a: number, d: number, s: number, r: number, totalDur: number): number {
  if (t < a) return t / a;
  if (t < a + d) return 1 - ((t - a) / d) * (1 - s);
  if (t < totalDur - r) return s;
  if (t < totalDur) return s * (1 - (t - (totalDur - r)) / r);
  return 0;
}

/** Frequency for a MIDI note number. */
function midiFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// ─── Sound Effect Generators ────────────────────────────────────────────────

function genMenuSelect(): Float32Array {
  return generate(0.06, (t) => {
    return square(880, t) * 0.3 * adsr(t, 0.005, 0.02, 0.3, 0.02, 0.06);
  });
}

function genMenuConfirm(): Float32Array {
  return generate(0.12, (t) => {
    const freq = t < 0.06 ? 523 : 659;
    return square(freq, t) * 0.3 * adsr(t, 0.005, 0.03, 0.4, 0.03, 0.12);
  });
}

function genDialogueAdvance(): Float32Array {
  return generate(0.05, (t) => {
    return triangle(660, t) * 0.2 * adsr(t, 0.003, 0.015, 0.2, 0.015, 0.05);
  });
}

function genAttack(): Float32Array {
  return generate(0.15, (t) => {
    const sweep = 800 - t * 4000;
    const wave = sawtooth(Math.max(sweep, 100), t) * 0.4;
    const n = noise() * 0.15 * adsr(t, 0.001, 0.03, 0, 0, 0.06);
    return (wave + n) * adsr(t, 0.005, 0.04, 0.3, 0.05, 0.15);
  });
}

function genDefend(): Float32Array {
  return generate(0.12, (t) => {
    return (Math.sin(2 * Math.PI * 120 * t) * 0.4 + noise() * 0.08) * adsr(t, 0.005, 0.04, 0.3, 0.04, 0.12);
  });
}

function genHeal(): Float32Array {
  return generate(0.3, (t) => {
    // Reason: Rising arpeggio C5-E5-G5 creates a "sparkle" heal effect
    let freq: number;
    if (t < 0.1) freq = 523;
    else if (t < 0.2) freq = 659;
    else freq = 784;
    return triangle(freq, t) * 0.3 * adsr(t, 0.01, 0.05, 0.4, 0.08, 0.3);
  });
}

function genSpecial(): Float32Array {
  return generate(0.5, (t) => {
    const sweep = 200 + t * 1200;
    return sawtooth(sweep, t) * 0.35 * adsr(t, 0.02, 0.1, 0.5, 0.15, 0.5);
  });
}

function genEnemyHit(): Float32Array {
  return generate(0.1, (t) => {
    return (noise() * 0.3 + square(150 - t * 800, t) * 0.2) * adsr(t, 0.003, 0.03, 0.2, 0.03, 0.1);
  });
}

function genEnemyAttack(): Float32Array {
  return generate(0.2, (t) => {
    const sweep = 300 - t * 1000;
    return sawtooth(Math.max(sweep, 60), t) * 0.35 * adsr(t, 0.01, 0.06, 0.3, 0.06, 0.2);
  });
}

function genVictoryFanfare(): Float32Array {
  // Reason: Short ascending 4-note fanfare — C5 E5 G5 C6
  const notes = [523, 659, 784, 1047];
  const noteDur = 0.15;
  const totalDur = notes.length * noteDur + 0.1;
  return generate(totalDur, (t) => {
    const idx = Math.floor(t / noteDur);
    if (idx >= notes.length) return 0;
    const localT = t - idx * noteDur;
    return square(notes[idx], t) * 0.3 * adsr(localT, 0.01, 0.03, 0.5, 0.04, noteDur);
  });
}

function genDefeat(): Float32Array {
  // Descending sad tones: C4 A3 F3 D3
  const notes = [262, 220, 175, 147];
  const noteDur = 0.2;
  const totalDur = notes.length * noteDur + 0.1;
  return generate(totalDur, (t) => {
    const idx = Math.floor(t / noteDur);
    if (idx >= notes.length) return 0;
    const localT = t - idx * noteDur;
    return triangle(notes[idx], t) * 0.3 * adsr(localT, 0.01, 0.05, 0.3, 0.08, noteDur);
  });
}

function genItemGet(): Float32Array {
  // Reason: Classic Zelda-style ascending chime — D5 F#5 A5 D6
  const notes = [587, 740, 880, 1175];
  const noteDur = 0.1;
  const totalDur = notes.length * noteDur + 0.15;
  return generate(totalDur, (t) => {
    const idx = Math.floor(t / noteDur);
    if (idx >= notes.length) {
      const fadeT = t - notes.length * noteDur;
      return triangle(1175, t) * 0.25 * Math.max(0, 1 - fadeT / 0.15);
    }
    const localT = t - idx * noteDur;
    return triangle(notes[idx], t) * 0.3 * adsr(localT, 0.005, 0.02, 0.6, 0.02, noteDur);
  });
}

function genDoor(): Float32Array {
  return generate(0.25, (t) => {
    const sweep = 200 - t * 600;
    return (sawtooth(Math.max(sweep, 50), t) * 0.2 + noise() * 0.05) * adsr(t, 0.01, 0.08, 0.2, 0.1, 0.25);
  });
}

function genLavaFall(): Float32Array {
  return generate(0.3, (t) => {
    const sweep = 1200 - t * 3500;
    return (Math.sin(2 * Math.PI * Math.max(sweep, 80) * t) * 0.3) * adsr(t, 0.005, 0.05, 0.4, 0.1, 0.3);
  });
}

function genHitDamage(): Float32Array {
  return generate(0.12, (t) => {
    return (noise() * 0.35 + square(100, t) * 0.15) * adsr(t, 0.003, 0.03, 0.2, 0.04, 0.12);
  });
}

function genTimerWarn(): Float32Array {
  return generate(0.15, (t) => {
    const beep = t < 0.06 || (t > 0.08 && t < 0.14);
    return beep ? square(1000, t) * 0.25 * adsr(t % 0.08, 0.003, 0.02, 0.3, 0.02, 0.06) : 0;
  });
}

function genBerryCollect(): Float32Array {
  return generate(0.15, (t) => {
    const freq = 600 + t * 1500;
    return triangle(freq, t) * 0.25 * adsr(t, 0.005, 0.03, 0.4, 0.05, 0.15);
  });
}

function genSimonPanel(pitch: number): Float32Array {
  return generate(0.2, (t) => {
    return square(pitch, t) * 0.25 * adsr(t, 0.01, 0.03, 0.5, 0.05, 0.2);
  });
}

function genSimonCorrect(): Float32Array {
  const notes = [523, 659, 784];
  const noteDur = 0.08;
  return generate(0.3, (t) => {
    const idx = Math.floor(t / noteDur);
    if (idx >= notes.length) return 0;
    return triangle(notes[idx], t) * 0.3 * adsr(t - idx * noteDur, 0.005, 0.02, 0.4, 0.02, noteDur);
  });
}

function genSimonWrong(): Float32Array {
  return generate(0.25, (t) => {
    return square(110, t) * 0.3 * adsr(t, 0.01, 0.05, 0.4, 0.1, 0.25);
  });
}

function genDig(): Float32Array {
  return generate(0.08, (t) => {
    return (noise() * 0.25 + square(80, t) * 0.15) * adsr(t, 0.003, 0.02, 0.2, 0.02, 0.08);
  });
}

function genHammerHit(): Float32Array {
  return generate(0.15, (t) => {
    return (noise() * 0.2 + square(400 - t * 2000, t) * 0.3) * adsr(t, 0.003, 0.04, 0.2, 0.05, 0.15);
  });
}

function genHammerMiss(): Float32Array {
  return generate(0.1, (t) => {
    return noise() * 0.2 * adsr(t, 0.005, 0.03, 0.1, 0.04, 0.1);
  });
}

function genWave(): Float32Array {
  return generate(0.4, (t) => {
    // Reason: Filtered noise whoosh simulates a wave
    const mod = Math.sin(2 * Math.PI * 3 * t) * 0.5 + 0.5;
    return noise() * mod * 0.2 * adsr(t, 0.05, 0.1, 0.3, 0.15, 0.4);
  });
}

function genChestOpen(): Float32Array {
  // Grand sparkle arpeggio: C5 E5 G5 B5 C6
  const notes = [523, 659, 784, 988, 1047];
  const noteDur = 0.1;
  const totalDur = notes.length * noteDur + 0.2;
  return generate(totalDur, (t) => {
    const idx = Math.floor(t / noteDur);
    if (idx >= notes.length) {
      const fadeT = t - notes.length * noteDur;
      return triangle(1047, t) * 0.25 * Math.max(0, 1 - fadeT / 0.2);
    }
    return triangle(notes[idx], t) * 0.3 * adsr(t - idx * noteDur, 0.005, 0.02, 0.5, 0.02, noteDur);
  });
}

function genKeyJiggle(): Float32Array {
  return generate(0.15, (t) => {
    const jitter = Math.sin(2 * Math.PI * 40 * t) * 200;
    return triangle(300 + jitter, t) * 0.2 * adsr(t, 0.005, 0.04, 0.2, 0.04, 0.15);
  });
}

function genKeyUnlock(): Float32Array {
  return generate(0.2, (t) => {
    if (t < 0.05) return noise() * 0.15 * adsr(t, 0.003, 0.02, 0.1, 0.01, 0.05);
    return triangle(880, t) * 0.25 * adsr(t - 0.05, 0.005, 0.03, 0.4, 0.08, 0.15);
  });
}

// ─── Music Track Generators ─────────────────────────────────────────────────

/** Render a note sequence to samples. Each note: [midiNote, durationInBeats]. 0 = rest. */
function renderMelody(
  notes: [number, number][],
  bpm: number,
  waveform: (freq: number, t: number) => number,
  volume: number,
  envelope: { a: number; d: number; s: number; r: number }
): Float32Array {
  const beatDur = 60 / bpm;
  let totalDur = 0;
  for (const [, dur] of notes) totalDur += dur * beatDur;

  return generate(totalDur, (t) => {
    let elapsed = 0;
    for (const [note, dur] of notes) {
      const noteDurSec = dur * beatDur;
      if (t < elapsed + noteDurSec) {
        if (note === 0) return 0;
        const localT = t - elapsed;
        const freq = midiFreq(note);
        return waveform(freq, t) * volume * adsr(localT, envelope.a, envelope.d, envelope.s, envelope.r, noteDurSec);
      }
      elapsed += noteDurSec;
    }
    return 0;
  });
}

/** Mix multiple sample arrays (same length) together. */
function mixTracks(...tracks: Float32Array[]): Float32Array {
  const maxLen = Math.max(...tracks.map((t) => t.length));
  const out = new Float32Array(maxLen);
  for (const track of tracks) {
    for (let i = 0; i < track.length; i++) {
      out[i] += track[i];
    }
  }
  // Soft clip
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.tanh(out[i]);
  }
  return out;
}

function genMusicTitle(): Float32Array {
  const bpm = 140;
  // Reason: Adventurous C major melody — arpeggiated feel
  const melody: [number, number][] = [
    [72, 0.5], [76, 0.5], [79, 0.5], [84, 0.5], // C5 E5 G5 C6
    [79, 0.5], [76, 0.5], [72, 1],               // G5 E5 C5
    [74, 0.5], [77, 0.5], [81, 0.5], [86, 0.5], // D5 F5 A5 D6
    [81, 0.5], [77, 0.5], [74, 1],               // A5 F5 D5
    [72, 0.5], [76, 0.5], [79, 0.5], [83, 0.5], // C5 E5 G5 B5
    [84, 1], [79, 0.5], [76, 0.5],               // C6 G5 E5
    [72, 1], [0, 1],                              // C5 rest
  ];
  const bass: [number, number][] = [
    [48, 2], [48, 2], // C3
    [50, 2], [50, 2], // D3
    [48, 2], [47, 2], // C3 B2
    [48, 2], [0, 2],  // C3 rest
  ];
  const melodyTrack = renderMelody(melody, bpm, square, 0.2, { a: 0.01, d: 0.03, s: 0.4, r: 0.03 });
  const bassTrack = renderMelody(bass, bpm, triangle, 0.15, { a: 0.01, d: 0.05, s: 0.5, r: 0.05 });
  return mixTracks(melodyTrack, bassTrack);
}

function genMusicOverworld(): Float32Array {
  const bpm = 120;
  // Pastoral G major melody
  const melody: [number, number][] = [
    [67, 1], [71, 0.5], [74, 0.5], [72, 1], [71, 0.5], [67, 0.5], // G4 B4 D5 C5 B4 G4
    [69, 1], [72, 0.5], [76, 0.5], [74, 1], [0, 1],                // A4 C5 E5 D5 rest
    [67, 0.5], [69, 0.5], [71, 1], [74, 0.5], [72, 0.5],           // G4 A4 B4 D5 C5
    [71, 1], [67, 1], [0, 1],                                        // B4 G4 rest
  ];
  const bass: [number, number][] = [
    [43, 2], [43, 2], // G2
    [45, 2], [45, 2], // A2
    [43, 2], [47, 2], // G2 B2
    [43, 2], [0, 2],  // G2 rest
  ];
  const melodyTrack = renderMelody(melody, bpm, triangle, 0.2, { a: 0.01, d: 0.04, s: 0.4, r: 0.04 });
  const bassTrack = renderMelody(bass, bpm, square, 0.12, { a: 0.01, d: 0.05, s: 0.4, r: 0.05 });
  return mixTracks(melodyTrack, bassTrack);
}

function genMusicDungeon(): Float32Array {
  const bpm = 90;
  // Tense A minor — low and ominous
  const melody: [number, number][] = [
    [57, 1], [60, 1], [59, 0.5], [57, 0.5], [56, 1], // A3 C4 B3 A3 Ab3
    [57, 1], [53, 1], [0, 1], [52, 1],                 // A3 F3 rest E3
    [57, 0.5], [56, 0.5], [53, 1], [52, 1],            // A3 Ab3 F3 E3
    [57, 2], [0, 2],                                     // A3 rest
  ];
  const bass: [number, number][] = [
    [33, 2], [33, 2], // A1
    [29, 2], [28, 2], // F1 E1
    [33, 2], [28, 2], // A1 E1
    [33, 2], [0, 2],  // A1 rest
  ];
  const melodyTrack = renderMelody(melody, bpm, square, 0.15, { a: 0.02, d: 0.06, s: 0.3, r: 0.06 });
  const bassTrack = renderMelody(bass, bpm, sawtooth, 0.1, { a: 0.02, d: 0.08, s: 0.4, r: 0.08 });
  return mixTracks(melodyTrack, bassTrack);
}

function genMusicVillage(): Float32Array {
  const bpm = 110;
  // Peaceful pentatonic melody in C major
  const melody: [number, number][] = [
    [72, 0.5], [74, 0.5], [76, 1], [79, 0.5], [76, 0.5], // C5 D5 E5 G5 E5
    [74, 1], [72, 1], [0, 1],                               // D5 C5 rest
    [76, 0.5], [79, 0.5], [81, 1], [79, 0.5], [76, 0.5],  // E5 G5 A5 G5 E5
    [74, 1], [72, 1], [0, 1],                               // D5 C5 rest
  ];
  const bass: [number, number][] = [
    [48, 2], [50, 2], // C3 D3
    [48, 2], [0, 2],  // C3 rest
    [52, 2], [48, 2], // E3 C3
    [50, 2], [48, 2], // D3 C3
  ];
  const melodyTrack = renderMelody(melody, bpm, triangle, 0.2, { a: 0.01, d: 0.04, s: 0.4, r: 0.05 });
  const bassTrack = renderMelody(bass, bpm, triangle, 0.12, { a: 0.01, d: 0.05, s: 0.4, r: 0.05 });
  return mixTracks(melodyTrack, bassTrack);
}

function genMusicCombat(): Float32Array {
  const bpm = 160;
  // Fast aggressive D minor
  const melody: [number, number][] = [
    [62, 0.5], [65, 0.5], [69, 0.5], [65, 0.5], // D4 F4 A4 F4
    [62, 0.5], [60, 0.5], [58, 0.5], [60, 0.5], // D4 C4 Bb3 C4
    [62, 0.5], [66, 0.5], [69, 0.5], [72, 0.5], // D4 F#4 A4 C5
    [70, 0.5], [69, 0.5], [65, 0.5], [62, 0.5], // Bb4 A4 F4 D4
    [58, 1], [62, 0.5], [65, 0.5],               // Bb3 D4 F4
    [69, 1], [0, 1],                               // A4 rest
  ];
  const bass: [number, number][] = [
    [38, 1], [38, 1], [36, 1], [34, 1], // D2 D2 C2 Bb1
    [38, 1], [38, 1], [41, 1], [38, 1], // D2 D2 F2 D2
    [34, 1], [38, 1],                    // Bb1 D2
    [33, 1], [0, 1],                     // A1 rest
  ];
  const melodyTrack = renderMelody(melody, bpm, square, 0.2, { a: 0.005, d: 0.02, s: 0.5, r: 0.02 });
  const bassTrack = renderMelody(bass, bpm, sawtooth, 0.15, { a: 0.005, d: 0.03, s: 0.5, r: 0.03 });
  return mixTracks(melodyTrack, bassTrack);
}

function genMusicVictory(): Float32Array {
  const bpm = 130;
  // Triumphant C major fanfare
  const melody: [number, number][] = [
    [72, 0.5], [76, 0.5], [79, 1], [84, 1],     // C5 E5 G5 C6
    [83, 0.5], [84, 0.5], [86, 1], [84, 1],     // B5 C6 D6 C6
    [79, 0.5], [84, 0.5], [88, 1],               // G5 C6 E6
    [86, 0.5], [84, 0.5], [79, 1], [0, 1],       // D6 C6 G5 rest
    [84, 1.5], [0, 0.5],                          // C6 rest
  ];
  const bass: [number, number][] = [
    [48, 2], [52, 2], // C3 E3
    [55, 2], [48, 2], // G3 C3
    [52, 2],          // E3
    [48, 2], [0, 2],  // C3 rest
  ];
  const melodyTrack = renderMelody(melody, bpm, square, 0.22, { a: 0.01, d: 0.03, s: 0.5, r: 0.04 });
  const bassTrack = renderMelody(bass, bpm, triangle, 0.15, { a: 0.01, d: 0.05, s: 0.5, r: 0.05 });
  return mixTracks(melodyTrack, bassTrack);
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Generate all game audio and register with Phaser's sound manager.
 * Call this from BootScene.create() after generateAllSprites().
 */
export function generateAllSounds(scene: Phaser.Scene): void {
  // Reason: decodeAudio exists on WebAudioSoundManager but the union type
  // includes NoAudioSoundManager which lacks it, so we cast.
  const soundManager = scene.sound as Phaser.Sound.WebAudioSoundManager;
  const register = (key: string, samples: Float32Array) => {
    const dataUri = encodeWav(samples, SAMPLE_RATE);
    soundManager.decodeAudio(key, dataUri);
  };

  // SFX
  register("sfx_menu_select", genMenuSelect());
  register("sfx_menu_confirm", genMenuConfirm());
  register("sfx_dialogue_advance", genDialogueAdvance());
  register("sfx_attack", genAttack());
  register("sfx_defend", genDefend());
  register("sfx_heal", genHeal());
  register("sfx_special", genSpecial());
  register("sfx_enemy_hit", genEnemyHit());
  register("sfx_enemy_attack", genEnemyAttack());
  register("sfx_victory_fanfare", genVictoryFanfare());
  register("sfx_defeat", genDefeat());
  register("sfx_item_get", genItemGet());
  register("sfx_door", genDoor());
  register("sfx_lava_fall", genLavaFall());
  register("sfx_hit_damage", genHitDamage());
  register("sfx_timer_warn", genTimerWarn());
  register("sfx_berry_collect", genBerryCollect());
  register("sfx_simon_panel_up", genSimonPanel(523));
  register("sfx_simon_panel_down", genSimonPanel(659));
  register("sfx_simon_panel_left", genSimonPanel(784));
  register("sfx_simon_panel_right", genSimonPanel(988));
  register("sfx_simon_correct", genSimonCorrect());
  register("sfx_simon_wrong", genSimonWrong());
  register("sfx_dig", genDig());
  register("sfx_hammer_hit", genHammerHit());
  register("sfx_hammer_miss", genHammerMiss());
  register("sfx_wave", genWave());
  register("sfx_chest_open", genChestOpen());
  register("sfx_key_jiggle", genKeyJiggle());
  register("sfx_key_unlock", genKeyUnlock());

  // Music
  register("music_title", genMusicTitle());
  register("music_overworld", genMusicOverworld());
  register("music_dungeon", genMusicDungeon());
  register("music_village", genMusicVillage());
  register("music_combat", genMusicCombat());
  register("music_victory", genMusicVictory());
}
