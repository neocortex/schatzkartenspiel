/**
 * Browser text-to-speech manager for narrator voice output.
 * Uses the Web Speech API and keeps a persistent enabled/disabled preference.
 */

const STORAGE_KEY = "schatzkarten_narration";

interface NarrationPrefs {
  enabled: boolean;
}

type VoiceRole = "narrator" | "hero" | "elder" | "enemy" | "neutral";

interface PendingSpeech {
  text: string;
  role: VoiceRole;
}

interface VoicePickOptions {
  avoidFemale?: boolean;
  preferMale?: boolean;
  preferYoung?: boolean;
  keywords?: string[];
  exclude?: Set<string>;
}

export class NarrationManager {
  private static instance: NarrationManager;

  private enabled = true;
  private initialized = false;
  private roleVoices: Partial<Record<VoiceRole, SpeechSynthesisVoice | null>> = {};
  private statusEl: HTMLElement | null = null;
  private hasUserInteraction = false;
  private pendingSpeech: PendingSpeech | null = null;

  private constructor() {}

  static getInstance(): NarrationManager {
    if (!NarrationManager.instance) {
      NarrationManager.instance = new NarrationManager();
    }
    return NarrationManager.instance;
  }

  /** Initialize preferences and voice list listeners once. */
  init(): void {
    if (this.initialized) return;
    this.loadPreferences();

    if (!this.isSupported()) {
      this.updateStatusLabel();
      this.initialized = true;
      return;
    }

    this.assignRoleVoices();
    window.speechSynthesis.addEventListener("voiceschanged", this.handleVoicesChanged);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("pointerdown", this.handlePointerDown);
    this.updateStatusLabel();
    this.initialized = true;
  }

  /** Speak one dialogue line with a voice style chosen from speaker role. */
  speakLine(text: string, speaker: string): void {
    if (!this.enabled || !this.isSupported()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    this.queueOrSpeak(trimmed, this.resolveRole(speaker));
  }

  /** Speak a narrator-style line. */
  speakNarrator(text: string): void {
    if (!this.enabled || !this.isSupported()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    this.queueOrSpeak(trimmed, "narrator");
  }

  /** Stop current narration immediately. */
  stop(): void {
    if (!this.isSupported()) return;
    window.speechSynthesis.cancel();
  }

  /** Enable/disable narration and persist it. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
      this.pendingSpeech = null;
    }
    this.updateStatusLabel();
    this.savePreferences();
  }

  /** Toggle narration state and return the new value. */
  toggleEnabled(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get supported(): boolean {
    return this.isSupported();
  }

  private readonly handleVoicesChanged = (): void => {
    this.assignRoleVoices();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.markUserInteraction();
    if (event.code === "KeyV" && !event.repeat) {
      const enabled = this.toggleEnabled();
      if (enabled) {
        this.speakNarrator("Erzählerstimme aktiviert.");
      }
    }
  };

  private readonly handlePointerDown = (): void => {
    this.markUserInteraction();
  };

  private queueOrSpeak(text: string, role: VoiceRole): void {
    if (!this.hasUserInteraction) {
      // Reason: some browsers require a direct user gesture before speech can start
      this.pendingSpeech = { text, role };
      return;
    }
    this.speakText(text, role);
  }

  private resolveRole(speaker: string): VoiceRole {
    const normalized = speaker.trim().toLocaleLowerCase("de-DE");

    if (normalized === "erzähler" || normalized === "erzahler") return "narrator";
    if (normalized === "tadeo") return "hero";
    if (normalized === "dorfältester" || normalized === "dorfaltester" || normalized === "weiser mann" || normalized === "weise frau") {
      return "elder";
    }
    if (normalized === "oger" || normalized === "geist") return "enemy";
    return "neutral";
  }

  private assignRoleVoices(): void {
    this.roleVoices = {
      narrator: null,
      hero: null,
      elder: null,
      enemy: null,
      neutral: null,
    };

    if (!this.isSupported()) return;

    const pool = this.getVoicePool();
    if (!pool.length) return;

    const usedIds = new Set<string>();

    this.roleVoices.narrator = this.pickVoice(pool, {
      avoidFemale: true,
      preferMale: true,
      keywords: ["male", "männlich", "daniel", "oliver", "klaus", "markus", "thomas"],
      exclude: usedIds,
    });
    this.addUsedVoice(usedIds, this.roleVoices.narrator);

    this.roleVoices.hero = this.pickVoice(pool, {
      preferYoung: true,
      keywords: ["child", "kid", "young", "boy", "junge", "junior"],
      exclude: usedIds,
    });
    this.addUsedVoice(usedIds, this.roleVoices.hero);

    this.roleVoices.elder = this.pickVoice(pool, {
      avoidFemale: true,
      preferMale: true,
      keywords: ["male", "männlich", "hans", "wolfgang", "klaus", "stefan", "ralf"],
      exclude: usedIds,
    });
    this.addUsedVoice(usedIds, this.roleVoices.elder);

    this.roleVoices.enemy = this.pickVoice(pool, {
      avoidFemale: true,
      preferMale: true,
      keywords: ["male", "männlich", "strong", "deep", "markus", "michael", "thorsten"],
      exclude: usedIds,
    });
    this.addUsedVoice(usedIds, this.roleVoices.enemy);

    this.roleVoices.neutral = this.pickVoice(pool, { exclude: usedIds }) ?? pool[0];
  }

  private getVoicePool(): SpeechSynthesisVoice[] {
    if (!this.isSupported()) return [];
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return [];

    const germanVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("de"));
    const pool = germanVoices.length ? germanVoices : voices;
    return [...pool].sort((a, b) => {
      const aScore = Number(a.default) + Number(a.localService);
      const bScore = Number(b.default) + Number(b.localService);
      return bScore - aScore;
    });
  }

  private pickVoice(pool: SpeechSynthesisVoice[], options: VoicePickOptions = {}): SpeechSynthesisVoice | null {
    let candidates = [...pool];

    if (options.exclude) {
      candidates = candidates.filter((voice) => !options.exclude?.has(this.getVoiceId(voice)));
    }

    if (options.avoidFemale) {
      const nonFemaleCandidates = candidates.filter((voice) => !this.isLikelyFemaleVoice(voice));
      if (nonFemaleCandidates.length) {
        candidates = nonFemaleCandidates;
      }
    }

    if (options.preferMale) {
      const maleCandidates = candidates.filter((voice) => this.isLikelyMaleVoice(voice));
      if (maleCandidates.length) {
        candidates = maleCandidates;
      }
    }

    if (!candidates.length) return null;

    let bestVoice: SpeechSynthesisVoice | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const voice of candidates) {
      let score = 0;
      const voiceName = voice.name.toLowerCase();
      const lang = voice.lang.toLowerCase();

      if (lang.startsWith("de")) score += 6;
      if (voice.localService) score += 1;
      if (voice.default) score += 1;
      if (options.preferYoung && /child|kid|young|boy|junge|junior/.test(voiceName)) score += 4;
      if (options.keywords?.length && options.keywords.some((keyword) => voiceName.includes(keyword))) score += 3;

      if (score > bestScore) {
        bestScore = score;
        bestVoice = voice;
      }
    }

    return bestVoice;
  }

  private isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  private markUserInteraction(): void {
    if (this.hasUserInteraction) return;
    this.hasUserInteraction = true;
    if (this.enabled && this.pendingSpeech) {
      const pending = this.pendingSpeech;
      this.pendingSpeech = null;
      this.speakText(pending.text, pending.role);
    }
  }

  private speakText(text: string, role: VoiceRole): void {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const style = this.getRoleStyle(role);
    utterance.lang = "de-DE";
    utterance.rate = style.rate;
    utterance.pitch = style.pitch;
    utterance.volume = style.volume;

    const voice = this.getRoleVoice(role);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    synth.speak(utterance);
  }

  private getRoleStyle(role: VoiceRole): { rate: number; pitch: number; volume: number } {
    switch (role) {
      case "narrator":
        return { rate: 0.86, pitch: 0.72, volume: 1.0 };
      case "hero":
        return { rate: 1.04, pitch: 1.24, volume: 1.0 };
      case "elder":
        return { rate: 0.9, pitch: 0.84, volume: 1.0 };
      case "enemy":
        return { rate: 0.8, pitch: 0.66, volume: 1.0 };
      default:
        return { rate: 0.96, pitch: 1.0, volume: 1.0 };
    }
  }

  private getRoleVoice(role: VoiceRole): SpeechSynthesisVoice | null {
    const voice = this.roleVoices[role];
    if (voice) return voice;
    const fallback = this.roleVoices.neutral;
    if (fallback) return fallback;

    this.assignRoleVoices();
    return this.roleVoices[role] ?? this.roleVoices.neutral ?? null;
  }

  private addUsedVoice(usedIds: Set<string>, voice: SpeechSynthesisVoice | null | undefined): void {
    if (!voice) return;
    usedIds.add(this.getVoiceId(voice));
  }

  private getVoiceId(voice: SpeechSynthesisVoice): string {
    return `${voice.voiceURI}::${voice.name}`;
  }

  private isLikelyFemaleVoice(voice: SpeechSynthesisVoice): boolean {
    const name = voice.name.toLowerCase();
    return /(female|frau|weiblich|anna|petra|katja|marlene|helena|victoria|salli|emma|amy|joanna|kendra|zira)/.test(name);
  }

  private isLikelyMaleVoice(voice: SpeechSynthesisVoice): boolean {
    const name = voice.name.toLowerCase();
    return /(male|mann|männlich|daniel|oliver|klaus|markus|stefan|hans|ralf|thomas|michael|thorsten|jonas|jan)/.test(name);
  }

  private updateStatusLabel(): void {
    if (!this.statusEl) {
      this.statusEl = document.getElementById("narration-status");
    }
    if (!this.statusEl) return;

    if (!this.isSupported()) {
      this.statusEl.textContent = "Erzählerstimme: nicht verfügbar";
      this.statusEl.style.color = "#ff8a80";
      return;
    }

    this.statusEl.textContent = `Erzählerstimme: ${this.enabled ? "AN" : "AUS"} (V)`;
    this.statusEl.style.color = this.enabled ? "#8bc34a" : "#ffcc80";
  }

  private loadPreferences(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const prefs: NarrationPrefs = JSON.parse(raw);
      this.enabled = prefs.enabled ?? true;
    } catch {
      // Reason: localStorage might be unavailable in some environments
    }
  }

  private savePreferences(): void {
    try {
      const prefs: NarrationPrefs = {
        enabled: this.enabled,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Reason: localStorage might be full or unavailable
    }
  }
}
