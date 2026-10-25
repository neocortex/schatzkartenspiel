/**
 * ScreenFx — small HTML overlay effects for challenges: a full-screen colour
 * flash (on hits, eruptions, wins) and cartoon pop-up words ("Autsch!",
 * "Super!") that spring out at a 3D position and float away.
 */

import * as THREE from "three";

const CSS = `
.chx-flash { position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 5; }
.chx-pop {
  position: absolute; pointer-events: none; z-index: 6; white-space: nowrap;
  font-family: Fredoka, "Trebuchet MS", sans-serif; font-weight: 600;
  color: #fff; -webkit-text-stroke: 2px #3a1d10; paint-order: stroke fill;
  text-shadow: 0 4px 0 rgba(58, 29, 16, 0.55);
  transform: translate(-50%, -50%) scale(0.2) rotate(-8deg);
  animation: chx-pop 1.1s cubic-bezier(.2, 1.6, .4, 1) forwards;
}
@keyframes chx-pop {
  0% { transform: translate(-50%, -50%) scale(0.2) rotate(-12deg); opacity: 0; }
  18% { transform: translate(-50%, -60%) scale(1.15) rotate(4deg); opacity: 1; }
  32% { transform: translate(-50%, -62%) scale(1) rotate(-2deg); }
  75% { opacity: 1; }
  100% { transform: translate(-50%, -150%) scale(0.9) rotate(0deg); opacity: 0; }
}
`;

const tmp = new THREE.Vector3();

export class ScreenFx {
  private flashEl: HTMLElement;
  private style: HTMLStyleElement;
  private pops = new Set<HTMLElement>();

  constructor(private layer: HTMLElement) {
    this.style = document.createElement("style");
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.flashEl = document.createElement("div");
    this.flashEl.className = "chx-flash";
    layer.appendChild(this.flashEl);
  }

  /** Flash the whole screen in a colour that fades out over `ms`. */
  flash(color: string, strength = 0.6, ms = 350): void {
    const el = this.flashEl;
    el.style.transition = "none";
    el.style.background = color;
    el.style.opacity = String(strength);
    // Reason: force a reflow so the transition restarts from full strength
    void el.offsetWidth;
    el.style.transition = `opacity ${ms}ms ease-out`;
    el.style.opacity = "0";
  }

  /** Cartoon word popping out at a world position. */
  pop(text: string, at: THREE.Vector3, camera: THREE.Camera, color = "#ffd23f", size = 44): void {
    tmp.copy(at).project(camera);
    if (tmp.z > 1) return;
    const el = document.createElement("div");
    el.className = "chx-pop";
    el.textContent = text;
    el.style.left = `${(tmp.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-tmp.y * 0.5 + 0.5) * 100}%`;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    this.layer.appendChild(el);
    this.pops.add(el);
    setTimeout(() => {
      el.remove();
      this.pops.delete(el);
    }, 1200);
  }

  dispose(): void {
    for (const el of this.pops) el.remove();
    this.pops.clear();
    this.flashEl.remove();
    this.style.remove();
  }
}
