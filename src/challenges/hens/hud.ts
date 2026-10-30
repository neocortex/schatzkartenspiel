/**
 * The hen game's overlay: the status pill (one hen icon per runaway, filled
 * in when she is home, plus a gentle timer), comic pop-up words over the yard
 * ("Gack!", "!", "Puh!", "Piep!"), speech bubbles that follow Mia and Chuleta
 * and read their lines aloud, and the best time kept in localStorage.
 */

import { GameUI } from "../../ui/GameUI";
import { NarrationManager } from "../../systems/NarrationManager";

const BEST_KEY = "schatzkarten_hens_best";

const CSS = `
.hens-row { display: flex; gap: 3px; align-items: center; }
.hens-ico { display: inline-block; font-size: 30px; line-height: 1; transition: filter 0.3s, opacity 0.3s; }
.hens-ico.off { filter: grayscale(1) brightness(1.2); opacity: 0.35; }
.hens-ico.gold { filter: sepia(1) saturate(5) hue-rotate(-8deg) brightness(1.12) drop-shadow(0 0 5px rgba(255, 200, 40, 0.95)); }
.hens-ico.gold.off { filter: sepia(1) saturate(2) grayscale(0.5) brightness(1.1); opacity: 0.4; }
.hens-ico.new { animation: hens-ico-pop 0.6s cubic-bezier(0.2, 1.8, 0.4, 1); }
.hens-time { font-size: 24px; color: var(--wood); margin-left: 8px; font-variant-numeric: tabular-nums; }
@keyframes hens-ico-pop { 0% { transform: scale(0.3); } 60% { transform: scale(1.6) rotate(-12deg); } 100% { transform: scale(1); } }
.hens-pop {
  position: absolute; pointer-events: none; white-space: nowrap; z-index: 4;
  font-weight: 700; font-size: 46px; color: #fff;
  -webkit-text-stroke: 6px var(--wood-dark); paint-order: stroke fill;
  text-shadow: 0 4px 0 rgba(0, 0, 0, 0.25);
  animation: hens-pop 1.15s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
}
.hens-pop.gack { color: #ffe066; font-size: 56px; }
.hens-pop.alert { color: #ffd23f; font-size: 42px; animation-duration: 0.8s; }
.hens-pop.puff { color: #cfeeff; font-size: 34px; }
.hens-pop.peep { color: #fff3a0; font-size: 30px; }
.hens-pop.gold { color: #ffd23f; font-size: 60px; }
@keyframes hens-pop {
  0% { transform: translate(-50%, -40%) scale(0.2) rotate(var(--r)); opacity: 0; }
  18% { transform: translate(-50%, -100%) scale(1.3) rotate(var(--r)); opacity: 1; }
  34% { transform: translate(-50%, -105%) scale(1) rotate(var(--r)); }
  78% { opacity: 1; }
  100% { transform: translate(-50%, -175%) scale(0.92) rotate(var(--r)); opacity: 0; }
}
`;

export type PopKind = "gack" | "alert" | "puff" | "peep" | "gold";
export type SlotIcon = "hen" | "chick" | "gold";

export interface Slot {
  icon: SlotIcon;
  caught: boolean;
}

export class HensHud {
  private style: HTMLStyleElement;
  private pops = new Set<HTMLElement>();
  private newSlot = -1;
  private newUntil = 0;

  constructor(private ui: GameUI) {
    this.style = document.createElement("style");
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
  }

  /** Mark a slot as just filled so its icon pops. */
  flash(slot: number): void {
    this.newSlot = slot;
    this.newUntil = performance.now() + 650;
  }

  /** Render the status pill: hen icons (grey until home) and the timer. */
  status(slots: Slot[], seconds: number): void {
    const fresh = performance.now() < this.newUntil ? this.newSlot : -1;
    const icons = slots
      .map((s, i) => {
        const cls = ["hens-ico", s.icon === "gold" ? "gold" : "", s.caught ? "" : "off", i === fresh ? "new" : ""].filter(Boolean).join(" ");
        return `<span class="${cls}">${s.icon === "chick" ? "🐥" : "🐔"}</span>`;
      })
      .join("");
    this.ui.status(`<span class="hens-row">${icons}</span><span class="hens-time">⏱ ${formatTime(seconds)}</span>`);
  }

  /** A comic word popping up at a screen position. */
  pop(text: string, at: { x: number; y: number } | null, kind: PopKind = "gack"): void {
    if (!at) return;
    const el = document.createElement("div");
    el.className = `hens-pop ${kind}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    el.style.setProperty("--r", `${(Math.random() - 0.5) * 22}deg`);
    this.ui.layer.appendChild(el);
    this.pops.add(el);
    el.addEventListener("animationend", () => {
      el.remove();
      this.pops.delete(el);
    });
  }

  dispose(): void {
    for (const el of this.pops) el.remove();
    this.pops.clear();
    this.style.remove();
  }
}

/** A white speech bubble that follows a character and reads the line in their voice. */
export class Bubble {
  private el: HTMLElement;
  private until = 0;

  constructor(layer: HTMLElement, private speaker: string) {
    this.el = document.createElement("div");
    this.el.className = "bubble";
    layer.appendChild(this.el);
  }

  say(text: string, ms = 2600, speak = true): void {
    this.el.textContent = text;
    this.until = performance.now() + ms;
    if (speak) NarrationManager.getInstance().speakLine(text, this.speaker);
  }

  get showing(): boolean {
    return performance.now() < this.until;
  }

  hide(): void {
    this.until = 0;
  }

  /** Call every frame with the anchor in pixels (or null to hide). */
  place(px: { x: number; y: number } | null): void {
    const show = px !== null && this.showing;
    this.el.classList.toggle("show", show);
    if (px && show) {
      // Reason: keep the whole bubble on screen when its speaker stands near the edge
      const w = this.el.offsetWidth / 2 + 12;
      const room = this.el.parentElement?.clientWidth ?? window.innerWidth;
      this.el.style.left = `${Math.min(Math.max(px.x, w), Math.max(w, room - w))}px`;
      this.el.style.top = `${Math.max(px.y, this.el.offsetHeight + 12)}px`;
    }
  }

  dispose(): void {
    this.el.remove();
  }
}

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const NUMBERS = ["null", "einer", "zwei", "drei", "vier", "fünf"];

/** Spoken time for the dialogue, e.g. "einer Minute und 32 Sekunden" (after "in"). */
export function timeWords(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const sec = r === 1 ? "einer Sekunde" : `${r} Sekunden`;
  if (m === 0) return sec;
  const min = m === 1 ? "einer Minute" : `${NUMBERS[m] ?? m} Minuten`;
  return r === 0 ? min : `${min} und ${sec}`;
}

/** Best (fastest) time in seconds, or null if the game was never finished. */
export function loadBest(): number | null {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    // Reason: storage can be blocked (private mode); then there is simply no record yet
    return null;
  }
}

export function saveBest(seconds: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.round(seconds * 10) / 10));
  } catch {
    // Reason: storage can be blocked; the record just isn't remembered
  }
}
