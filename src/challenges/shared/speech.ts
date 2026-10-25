/**
 * Small HUD helpers for challenges: a speech bubble that follows a character
 * ("Autsch!", hints) and world → screen projection for bubbles and prompts.
 * Shared by several challenges (cave, forest, hens, fishing).
 */

import * as THREE from "three";
import { NarrationManager } from "../../systems/NarrationManager";

const tmp = new THREE.Vector3();

/** Project a world point to pixels; null when it is behind the camera. */
export function toScreen(camera: THREE.Camera, p: THREE.Vector3): { x: number; y: number } | null {
  tmp.copy(p).project(camera);
  if (tmp.z > 1) return null;
  return { x: (tmp.x * 0.5 + 0.5) * window.innerWidth, y: (-tmp.y * 0.5 + 0.5) * window.innerHeight };
}

/** Project a world point to normalised device coordinates (for the HUD compass arrow). */
export function toNdc(camera: THREE.Camera, p: THREE.Vector3): { x: number; y: number; behind: boolean } {
  tmp.copy(p).project(camera);
  return { x: tmp.x, y: tmp.y, behind: tmp.z > 1 };
}

/** A white speech bubble (the island's `.bubble` style) that follows a world point. */
export class SpeechBubble {
  private el: HTMLElement;
  private until = 0;

  constructor(layer: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "bubble";
    layer.appendChild(this.el);
  }

  /** Show a short remark; `speak` also reads it aloud with Tadeo's voice. */
  say(text: string, ms = 2400, speak = false): void {
    this.el.textContent = text;
    this.until = performance.now() + ms;
    if (speak) NarrationManager.getInstance().speakLine(text, "Tadeo");
  }

  get showing(): boolean {
    return performance.now() < this.until;
  }

  /** Call every frame with the anchor in pixels (or null to hide). */
  place(px: { x: number; y: number } | null): void {
    const show = px !== null && this.showing;
    this.el.classList.toggle("show", show);
    if (px && show) {
      this.el.style.left = `${px.x}px`;
      this.el.style.top = `${px.y}px`;
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
