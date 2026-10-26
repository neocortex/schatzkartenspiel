/**
 * Centralized audio management: background music, SFX, volume, and crossfading.
 * Singleton — access via AudioManager.getInstance().
 */

// Reason: own key so the 3D game's mute setting on the same localhost port doesn't apply here
const STORAGE_KEY = "schatzkarten_audio_classic";

interface AudioPrefs {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
}

export class AudioManager {
  private static instance: AudioManager;

  private scene: Phaser.Scene | null = null;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private currentMusicKey: string | null = null;
  private _musicVolume = 0.4;
  private _sfxVolume = 0.6;
  private _muted = false;
  private initialized = false;

  private constructor() {}

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  /** Initialize the audio system. Call once from BootScene.create(). */
  init(scene: Phaser.Scene): void {
    if (this.initialized) return;
    this.scene = scene;
    this.loadPreferences();

    // Reason: DOM-level listener works globally across all Phaser scenes
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) {
        this.toggleMute();
      }
    });

    this.initialized = true;
  }

  /** Update the scene reference. Call in each scene's create(). */
  setScene(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  /** Play background music with crossfade from current track. */
  playMusic(key: string, crossfadeDuration = 500): void {
    if (!this.scene) return;
    if (this.currentMusicKey === key && this.currentMusic) return;

    // Fade out old track
    if (this.currentMusic) {
      const oldMusic = this.currentMusic;
      this.scene.tweens.add({
        targets: oldMusic,
        volume: 0,
        duration: crossfadeDuration,
        onComplete: () => {
          oldMusic.stop();
          oldMusic.destroy();
        },
      });
    }

    // Reason: Check if the audio key exists before playing to avoid crashes
    if (!this.scene.cache.audio.exists(key) && !this.scene.sound.get(key)) {
      // Audio may still be decoding — retry after a short delay
      this.scene.time.delayedCall(100, () => this.startMusic(key, crossfadeDuration));
      this.currentMusic = null;
      this.currentMusicKey = key;
      return;
    }

    this.startMusic(key, crossfadeDuration);
  }

  /** Internal: start a new music track with fade-in. */
  private startMusic(key: string, crossfadeDuration: number): void {
    if (!this.scene) return;

    try {
      const newMusic = this.scene.sound.add(key, {
        volume: 0,
        loop: true,
      });
      newMusic.play();

      this.scene.tweens.add({
        targets: newMusic,
        volume: this._muted ? 0 : this._musicVolume,
        duration: crossfadeDuration,
      });

      this.currentMusic = newMusic;
      this.currentMusicKey = key;
    } catch {
      // Reason: Audio decode might not be ready yet — fail silently
      console.warn(`Audio: could not play "${key}"`);
    }
  }

  /** Stop current music with optional fade out. */
  stopMusic(fadeDuration = 300): void {
    if (!this.scene || !this.currentMusic) return;

    const music = this.currentMusic;
    this.currentMusic = null;
    this.currentMusicKey = null;

    this.scene.tweens.add({
      targets: music,
      volume: 0,
      duration: fadeDuration,
      onComplete: () => {
        music.stop();
        music.destroy();
      },
    });
  }

  /** Play a one-shot sound effect. */
  playSfx(key: string): void {
    if (!this.scene || this._muted) return;

    try {
      this.scene.sound.play(key, { volume: this._sfxVolume });
    } catch {
      // Reason: SFX might not be decoded yet — fail silently
    }
  }

  /** Toggle mute on/off. Persists to localStorage. */
  toggleMute(): void {
    this._muted = !this._muted;

    if (this.currentMusic) {
      (this.currentMusic as Phaser.Sound.WebAudioSound).setVolume(this._muted ? 0 : this._musicVolume);
    }

    this.savePreferences();
  }

  /** Set music volume (0-1). */
  setMusicVolume(vol: number): void {
    this._musicVolume = Math.max(0, Math.min(1, vol));
    if (this.currentMusic && !this._muted) {
      (this.currentMusic as Phaser.Sound.WebAudioSound).setVolume(this._musicVolume);
    }
    this.savePreferences();
  }

  /** Set SFX volume (0-1). */
  setSfxVolume(vol: number): void {
    this._sfxVolume = Math.max(0, Math.min(1, vol));
    this.savePreferences();
  }

  /** Get current mute state. */
  get muted(): boolean {
    return this._muted;
  }

  /** Get current music volume. */
  get musicVolume(): number {
    return this._musicVolume;
  }

  /** Get current SFX volume. */
  get sfxVolume(): number {
    return this._sfxVolume;
  }

  private loadPreferences(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const prefs: AudioPrefs = JSON.parse(raw);
      this._muted = prefs.muted ?? false;
      this._musicVolume = prefs.musicVolume ?? 0.4;
      this._sfxVolume = prefs.sfxVolume ?? 0.6;
    } catch {
      // Reason: localStorage might be unavailable
    }
  }

  private savePreferences(): void {
    try {
      const prefs: AudioPrefs = {
        muted: this._muted,
        musicVolume: this._musicVolume,
        sfxVolume: this._sfxVolume,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Reason: localStorage might be full or unavailable
    }
  }
}
