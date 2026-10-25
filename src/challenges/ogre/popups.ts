/**
 * Floating HTML text over the 3D scene: damage numbers, "Abgewehrt!",
 * "BONK!" and friends. Each popup is anchored to a world position, pops in
 * with a bounce, drifts upwards and fades. Also hosts the tiny helper that
 * injects a challenge's stylesheet once.
 */

import * as THREE from "three";

/** Add a <style> block once per id (kept for the session; challenges can rerun). */
export function injectStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

const CSS = /* css */ `
.fx-pop {
  position: absolute;
  left: 0;
  top: 0;
  font-family: "Fredoka", system-ui, sans-serif;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  paint-order: stroke fill;
  -webkit-text-stroke: 6px #3b2414;
  text-shadow: 0 5px 0 #3b2414, 0 10px 18px rgba(0, 0, 0, 0.35);
  will-change: transform, opacity;
}
.fx-pop > span {
  display: inline-block;
  transform: translate(-50%, -50%) scale(0.2);
  animation: fx-pop-in 0.42s cubic-bezier(0.2, 1.8, 0.4, 1) forwards;
}
.fx-pop.speech { -webkit-text-stroke: 0; text-shadow: none; }
.fx-pop.speech > span {
  padding: 8px 18px; border-radius: 20px; background: #fff; color: #3b2414 !important;
  border: 4px solid #4f7a28; box-shadow: 0 5px 0 #2f4f17, 0 10px 18px rgba(0, 0, 0, 0.3);
}
@keyframes fx-pop-in {
  to { transform: translate(-50%, -50%) scale(1); }
}
`;

interface Popup {
  el: HTMLElement;
  at: THREE.Vector3;
  age: number;
  life: number;
  rise: number;
}

export interface PopupStyle {
  color?: string;
  size?: number;
  life?: number;
  /** World units the popup floats upwards over its life. */
  rise?: number;
  /** Draw as a white speech bubble instead of outlined text. */
  bubble?: boolean;
}

export class Popups {
  private list: Popup[] = [];
  private v = new THREE.Vector3();

  constructor(
    private layer: HTMLElement,
    private camera: THREE.Camera,
  ) {
    injectStyle("fx-pop-style", CSS);
  }

  show(text: string, at: THREE.Vector3, style: PopupStyle = {}): void {
    const el = document.createElement("div");
    // Reason: not "bubble" — that class is taken by the island's shared thought bubble style
    el.className = style.bubble ? "fx-pop speech" : "fx-pop";
    el.innerHTML = `<span style="color:${style.color ?? "#ffffff"};font-size:${style.size ?? 64}px">${text}</span>`;
    this.layer.appendChild(el);
    this.list.push({ el, at: at.clone(), age: 0, life: style.life ?? 1.3, rise: style.rise ?? 1.4 });
    this.place(this.list[this.list.length - 1]);
  }

  update(dt: number): void {
    this.list = this.list.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) {
        p.el.remove();
        return false;
      }
      this.place(p);
      return true;
    });
  }

  clear(): void {
    for (const p of this.list) p.el.remove();
    this.list = [];
  }

  private place(p: Popup): void {
    const t = p.age / p.life;
    this.v.copy(p.at);
    this.v.y += p.rise * (1 - Math.pow(1 - t, 2));
    this.v.project(this.camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Keep popups on screen and below the health bars at the top (wide speech bubbles need more room)
    const half = Math.max(120, ((p.el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) / 2 + 16);
    const x = THREE.MathUtils.clamp((this.v.x * 0.5 + 0.5) * w, half, w - half);
    const y = THREE.MathUtils.clamp((-this.v.y * 0.5 + 0.5) * h, 150, h - 60);
    p.el.style.transform = `translate(${x}px, ${y}px)`;
    p.el.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    p.el.style.display = this.v.z > 1 ? "none" : "block";
  }
}
