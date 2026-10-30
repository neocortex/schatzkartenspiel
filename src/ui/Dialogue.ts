/**
 * Dialogue box: shows a script line by line with a typewriter effect, the
 * speaker's 3D portrait and name tag, and reads each line aloud.
 * `play()` resolves once the last line has been confirmed with Space.
 */

import { DialogueScript } from "../data/dialogues";
import { NarrationManager } from "../systems/NarrationManager";
import { audio } from "../audio/Audio";
import { Input } from "../core/Input";

const PACO_COLOR = "#27477e";

/** Portrait key, emoji fallback and name-tag colour per speaker. */
const SPEAKERS: Record<string, { portrait?: string; emoji?: string; color: string }> = {
  Tadeo: { portrait: "tadeo", color: "#ff7a1a" },
  Chuleta: { portrait: "chuleta", color: "#b0622f" },
  Erzähler: { emoji: "📖", color: "#3a5ba0" },
  Steintafel: { emoji: "🗿", color: "#7d7468" },
  Hüter: { portrait: "hueter", color: "#58a6c9" },
  Dorfältester: { portrait: "elder", color: "#7b4bb5" },
  "Weise Frau": { portrait: "wiseWoman", color: "#1fa38a" },
  "Weiser Mann": { portrait: "wiseMan", color: "#e07a10" },
  Oger: { emoji: "👹", color: "#4f7a28" },
  "Fischer Jonas": { portrait: "villager0", color: "#2f7fb5" },
  "Bäckerin Lina": { portrait: "villager1", color: "#c0603a" },
  "Kleine Mia": { portrait: "villager2", color: "#e0457b" },
  "Käpt'n Paco": { portrait: "villager3", color: PACO_COLOR },
  Stimme: { emoji: "🗣️", color: PACO_COLOR },
  Maulwurf: { portrait: "maulwurf", color: "#96623f" },
  Fuchs: { emoji: "🦊", color: "#e8762b" },
};

const CHAR_MS = 26;

export class Dialogue {
  private box: HTMLElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;
  private portraitEl: HTMLElement;
  private nextEl: HTMLElement;
  private script: DialogueScript = [];
  private index = 0;
  private shown = 0;
  private full = "";
  private elapsed = 0;
  private resolve: (() => void) | null = null;
  private portraits: Record<string, string> = {};
  /** Called with the speaker name whenever a new line starts (camera can frame them). */
  onLine: ((speaker: string) => void) | null = null;

  constructor(layer: HTMLElement) {
    this.box = document.createElement("div");
    this.box.className = "dialogue";
    this.box.innerHTML = `
      <div class="portrait"></div>
      <div class="name"></div>
      <div class="text"></div>
      <div class="next"><span class="key">Leertaste</span> ▼</div>`;
    layer.appendChild(this.box);
    this.portraitEl = this.box.querySelector(".portrait")!;
    this.nameEl = this.box.querySelector(".name")!;
    this.textEl = this.box.querySelector(".text")!;
    this.nextEl = this.box.querySelector(".next")!;
  }

  setPortraits(p: Record<string, string>): void {
    this.portraits = p;
  }

  get isOpen(): boolean {
    return this.resolve !== null;
  }

  play(script: DialogueScript): Promise<void> {
    this.script = script;
    this.index = 0;
    this.box.classList.add("open");
    this.showLine();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** Advance with Space; call every frame while open. */
  update(dt: number, input: Input): void {
    if (!this.isOpen) return;
    if (this.shown < this.full.length) {
      this.elapsed += dt * 1000;
      const target = Math.min(this.full.length, Math.floor(this.elapsed / CHAR_MS));
      if (target !== this.shown) {
        this.shown = target;
        this.textEl.textContent = this.full.slice(0, this.shown);
      }
      if (this.shown >= this.full.length) this.nextEl.classList.add("show");
    }
    if (!input.consume("Space")) return;
    if (this.shown < this.full.length) {
      this.shown = this.full.length;
      this.textEl.textContent = this.full;
      this.nextEl.classList.add("show");
      return;
    }
    audio.playSfx("sfx_dialogue_advance", 0.6);
    this.index++;
    if (this.index < this.script.length) {
      this.showLine();
    } else {
      this.close();
    }
  }

  private showLine(): void {
    const line = this.script[this.index];
    const sp = SPEAKERS[line.speaker] ?? { color: "#e63946" };
    this.nameEl.textContent = line.speaker;
    this.box.style.setProperty("--speaker", sp.color);
    // Reason: a line may name its own portrait (villagers); otherwise use the speaker's
    const img = this.portraits[line.portrait] ?? (sp.portrait ? this.portraits[sp.portrait] : undefined);
    if (img) {
      this.portraitEl.innerHTML = `<img src="${img}" alt="">`;
    } else {
      this.portraitEl.textContent = sp.emoji ?? "💬";
    }
    this.full = line.text;
    this.shown = 0;
    this.elapsed = 0;
    this.textEl.textContent = "";
    this.nextEl.classList.remove("show");
    NarrationManager.getInstance().speakLine(line.spoken ?? line.text, line.speaker);
    this.onLine?.(line.speaker);
  }

  private close(): void {
    this.box.classList.remove("open");
    NarrationManager.getInstance().stop();
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
