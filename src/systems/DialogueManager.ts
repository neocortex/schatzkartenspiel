/**
 * Manages dialogue playback with typewriter effect.
 * Uses DOM elements overlaid on the game canvas for crisp text rendering.
 */

import { DialogueLine, DialogueScript } from "../data/dialogues";
import { AudioManager } from "./AudioManager";
import { NarrationManager } from "./NarrationManager";

export class DialogueManager {
  private scene: Phaser.Scene;
  private boxEl: HTMLElement;
  private speakerEl: HTMLElement;
  private textEl: HTMLElement;
  private portraitEl: HTMLCanvasElement;
  private promptEl: HTMLElement;
  private currentScript: DialogueScript = [];
  private currentLineIndex = 0;
  private isTyping = false;
  private fullText = "";
  private typeTimerId: number | null = null;
  private onCompleteCallback: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.boxEl = document.getElementById("dialogue-box")!;
    this.speakerEl = document.getElementById("dialogue-speaker")!;
    this.textEl = document.getElementById("dialogue-text")!;
    this.portraitEl = document.getElementById("dialogue-portrait") as HTMLCanvasElement;
    this.promptEl = document.getElementById("dialogue-prompt")!;
  }

  /** Start playing a dialogue script. Calls onComplete when all lines are done. */
  startDialogue(script: DialogueScript, onComplete?: () => void): void {
    if (!script || script.length === 0) {
      onComplete?.();
      return;
    }

    this.currentScript = script;
    this.currentLineIndex = 0;
    this.onCompleteCallback = onComplete || null;
    this.boxEl.style.display = "block";
    this.showLine(this.currentScript[0]);
  }

  /** Show a single dialogue line with typewriter effect. */
  private showLine(line: DialogueLine): void {
    const narration = NarrationManager.getInstance();
    narration.stop();

    this.speakerEl.textContent = line.speaker;
    this.textEl.textContent = "";
    this.fullText = line.text;
    this.isTyping = true;
    this.promptEl.style.display = "none";

    narration.speakLine(line.text, line.speaker);

    // Portrait
    if (line.portrait && this.scene.textures.exists(line.portrait)) {
      this.renderPortrait(line.portrait);
      this.portraitEl.style.display = "block";
      this.boxEl.classList.add("with-portrait");
    } else {
      this.portraitEl.style.display = "none";
      this.boxEl.classList.remove("with-portrait");
    }

    // Typewriter effect
    let charIndex = 0;
    if (this.typeTimerId !== null) {
      clearInterval(this.typeTimerId);
    }
    this.typeTimerId = window.setInterval(() => {
      charIndex++;
      this.textEl.textContent = this.fullText.substring(0, charIndex);
      if (charIndex >= this.fullText.length) {
        if (this.typeTimerId !== null) clearInterval(this.typeTimerId);
        this.typeTimerId = null;
        this.isTyping = false;
        this.promptEl.style.display = "block";
      }
    }, 30);
  }

  /** Render a Phaser texture onto the portrait canvas element. */
  private renderPortrait(textureKey: string): void {
    const tex = this.scene.textures.get(textureKey);
    if (!tex) return;
    const source = tex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const ctx = this.portraitEl.getContext("2d");
    if (!ctx) return;
    this.portraitEl.width = 32;
    this.portraitEl.height = 32;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32);
    ctx.drawImage(source, 0, 0, 32, 32);
  }

  /** Advance to next line or finish dialogue. Called on player input. */
  advance(): void {
    if (this.boxEl.style.display === "none") return;

    if (this.isTyping) {
      // Skip typewriter — show full text immediately
      if (this.typeTimerId !== null) {
        clearInterval(this.typeTimerId);
        this.typeTimerId = null;
      }
      this.textEl.textContent = this.fullText;
      this.isTyping = false;
      this.promptEl.style.display = "block";
      return;
    }

    AudioManager.getInstance().playSfx("sfx_dialogue_advance");
    this.currentLineIndex++;
    if (this.currentLineIndex < this.currentScript.length) {
      this.showLine(this.currentScript[this.currentLineIndex]);
    } else {
      this.close();
    }
  }

  /** Close the dialogue box. */
  close(): void {
    NarrationManager.getInstance().stop();
    this.boxEl.style.display = "none";
    if (this.typeTimerId !== null) {
      clearInterval(this.typeTimerId);
      this.typeTimerId = null;
    }
    this.isTyping = false;
    this.currentScript = [];
    this.currentLineIndex = 0;
    const cb = this.onCompleteCallback;
    this.onCompleteCallback = null;
    cb?.();
  }

  /** Whether dialogue is currently active. */
  get isActive(): boolean {
    return this.boxEl.style.display !== "none";
  }

  /** Clean up resources. */
  destroy(): void {
    NarrationManager.getInstance().stop();
    if (this.typeTimerId !== null) {
      clearInterval(this.typeTimerId);
    }
    this.boxEl.style.display = "none";
  }
}
