/**
 * HTML overlay for the sea crossing: the voyage tracker (dock → boat →
 * treasure island) with the starfish counter, the three berry slots for the
 * shark, big key hints, and the timing ring that shrinks onto the shark's open
 * mouth — it turns green with "JETZT!" when Space will throw the berry in.
 */

import * as THREE from "three";
import { GameUI } from "../../ui/GameUI";
import { injectStyle } from "../ogre/popups";

const CSS = /* css */ `
.sea-hud { display: flex; align-items: center; gap: 18px; font-family: "Fredoka", system-ui, sans-serif; font-weight: 600; color: #3b2414; }
.sea-track { display: flex; align-items: center; gap: 10px; font-size: 30px; }
.sea-line { position: relative; width: 340px; height: 16px; border-radius: 10px; background: #bfe9f5; box-shadow: inset 0 3px 0 rgba(0,0,0,0.15); border: 3px solid #3b2414; }
.sea-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px; background: linear-gradient(90deg, #4fc3e8, #2f9fd8); }
.sea-boat { position: absolute; top: 50%; transform: translate(-50%, -62%); font-size: 34px; filter: drop-shadow(0 3px 0 rgba(0,0,0,0.25)); }
.sea-starfish { display: flex; align-items: center; gap: 6px; font-size: 28px; min-width: 86px; }
.sea-starfish svg { width: 34px; height: 34px; filter: drop-shadow(0 2px 0 rgba(0,0,0,0.25)); }
.sea-starfish b { display: inline-block; transition: transform 0.15s; }
.sea-starfish b.pop { transform: scale(1.45); }
.sea-berries { display: flex; gap: 8px; font-size: 34px; }
.sea-berries span { opacity: 0.25; filter: grayscale(1); transition: all 0.3s cubic-bezier(0.2, 1.8, 0.4, 1); }
.sea-berries span.on { opacity: 1; filter: none; transform: scale(1.15); }
.sea-hint { position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%); padding: 12px 26px; border-radius: 22px;
  background: #fff8e8; border: 4px solid #3b2414; box-shadow: 0 6px 0 #3b2414; font: 600 28px "Fredoka", system-ui, sans-serif; color: #3b2414;
  opacity: 0; transition: opacity 0.3s; pointer-events: none; white-space: nowrap; }
.sea-hint.show { opacity: 1; }
.sea-hint .sea-hint-fish svg { width: 30px; height: 30px; vertical-align: -6px; }
.sea-hint .key { display: inline-block; padding: 2px 12px; margin: 0 4px; border-radius: 10px; background: #fff; border: 3px solid #3b2414; box-shadow: 0 3px 0 #3b2414; }
.sea-ring { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; display: none; }
.sea-ring.show { display: block; }
.sea-ring > div { position: absolute; left: 0; top: 0; border-radius: 50%; transform: translate(-50%, -50%); }
.sea-ring .target { width: 120px; height: 120px; border: 8px solid rgba(255, 210, 63, 0.95); box-shadow: 0 0 18px rgba(255, 210, 63, 0.8), inset 0 0 14px rgba(255, 210, 63, 0.5); }
.sea-ring .shrink { width: 120px; height: 120px; border: 6px solid #ffffff; box-shadow: 0 0 10px rgba(255,255,255,0.8); }
.sea-ring .label { width: auto; height: auto; border-radius: 0; top: 96px; transform: translate(-50%, 0); font: 700 34px "Fredoka", system-ui, sans-serif; color: #fff;
  -webkit-text-stroke: 6px #3b2414; paint-order: stroke fill; white-space: nowrap; }
.sea-ring.now .target { border-color: #5dff7a; box-shadow: 0 0 30px #5dff7a, inset 0 0 20px rgba(93, 255, 122, 0.7); animation: sea-pulse 0.25s infinite alternate; }
.sea-ring.now .shrink { border-color: #5dff7a; }
.sea-ring.now .label { color: #5dff7a; font-size: 48px; }
@keyframes sea-pulse { to { transform: translate(-50%, -50%) scale(1.12); } }
`;

const STARFISH_POINTS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? 3.8 : 9.4;
  return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
}).join(" ");

/** There is no starfish among the emoji, so the status bar draws its own. */
export const STARFISH_ICON =
  `<svg viewBox="-12 -12 24 24"><polygon points="${STARFISH_POINTS}" fill="#ff6f3f" stroke="#ff6f3f" stroke-width="3.6" stroke-linejoin="round"/>` +
  `<circle r="1.5" fill="#ffe9c4"/><circle cy="-5" r="1" fill="#ffe9c4"/><circle cx="4.8" cy="-1.5" r="1" fill="#ffe9c4"/><circle cx="-4.8" cy="-1.5" r="1" fill="#ffe9c4"/><circle cx="3" cy="4" r="1" fill="#ffe9c4"/><circle cx="-3" cy="4" r="1" fill="#ffe9c4"/></svg>`;

export class SeaUI {
  private hint: HTMLElement;
  private ring: HTMLElement;
  private shrink: HTMLElement;
  private label: HTMLElement;
  private v = new THREE.Vector3();
  private starfishShown = 0;

  constructor(
    private ui: GameUI,
    private camera: THREE.Camera,
  ) {
    injectStyle("sea-ui-style", CSS);
    this.hint = document.createElement("div");
    this.hint.className = "sea-hint";
    this.ring = document.createElement("div");
    this.ring.className = "sea-ring";
    this.ring.innerHTML = `<div class="target"></div><div class="shrink"></div><div class="label">Leertaste!</div>`;
    this.shrink = this.ring.querySelector(".shrink")!;
    this.label = this.ring.querySelector(".label")!;
    ui.layer.append(this.hint, this.ring);
  }

  /** Voyage tracker + starfish counter in the status bar. */
  showVoyage(): void {
    this.ui.status(
      `<div class="sea-hud"><div class="sea-track">⚓<div class="sea-line"><div class="sea-fill"></div><span class="sea-boat">⛵</span></div>🏝️</div>` +
        `<div class="sea-starfish">${STARFISH_ICON} <b>${this.starfishShown}</b></div></div>`,
    );
  }

  setVoyage(progress: number, starfish: number): void {
    const pct = `${(Math.min(Math.max(progress, 0), 1) * 100).toFixed(1)}%`;
    const fill = document.querySelector<HTMLElement>(".sea-fill");
    const boat = document.querySelector<HTMLElement>(".sea-boat");
    if (fill) fill.style.width = pct;
    if (boat) boat.style.left = pct;
    if (starfish !== this.starfishShown) {
      const b = document.querySelector<HTMLElement>(".sea-starfish b");
      if (b) {
        b.textContent = String(starfish);
        b.classList.remove("pop");
        void b.offsetWidth;
        b.classList.add("pop");
        setTimeout(() => b.classList.remove("pop"), 150);
      }
      this.starfishShown = starfish;
    }
  }

  /** Berry slots for the shark: one lights up for each berry it has eaten. */
  showFeeds(n: number): void {
    const slots = [0, 1, 2].map((i) => `<span class="${i < n ? "on" : ""}">🫐</span>`).join("");
    this.ui.status(`<div class="sea-hud"><div class="sea-berries">${slots}</div><div class="sea-starfish">${STARFISH_ICON} <b>${this.starfishShown}</b></div></div>`);
  }

  /** Big hint bubble at the bottom (null hides it). */
  showHint(html: string | null): void {
    if (html) this.hint.innerHTML = html;
    this.hint.classList.toggle("show", !!html);
  }

  /**
   * Timing ring around a world point: `k` runs 0 → 1 as the outer ring shrinks
   * onto the golden target; `now` marks the hit window. Pass null to hide.
   */
  setRing(at: THREE.Vector3 | null, k = 0, now = false): void {
    if (!at) {
      this.ring.classList.remove("show", "now");
      return;
    }
    this.v.copy(at).project(this.camera);
    const x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    this.ring.style.transform = `translate(${x}px, ${y}px)`;
    this.ring.classList.add("show");
    this.ring.classList.toggle("now", now);
    this.shrink.style.transform = `translate(-50%, -50%) scale(${(1 + (1 - k) * 2.2).toFixed(3)})`;
    this.label.textContent = now ? "JETZT!" : "Leertaste!";
  }

  destroy(): void {
    this.hint.remove();
    this.ring.remove();
  }
}
