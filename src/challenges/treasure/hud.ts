/**
 * Treasure HUD bits on top of the shared GameUI: status-pill contents
 * (progress bars, key-turn dots), a bottom hint line, the hammer timing meter
 * (a needle sweeping over a golden "super hit" zone), pop-up praise words
 * and a white impact flash.
 */

import { GameUI } from "../../ui/GameUI";

const CSS = `
.tr-bar { display: inline-block; width: 150px; height: 18px; border-radius: 9px; background: #e9d6ac; border: 3px solid var(--wood);
  overflow: hidden; margin-left: 10px; vertical-align: middle; box-shadow: inset 0 3px 0 rgba(0,0,0,.12); }
.tr-bar i { display: block; height: 100%; background: linear-gradient(180deg, #ffe680, #ffb21a); transition: width .25s cubic-bezier(.2,1.4,.4,1); }
.tr-bar.ice i { background: linear-gradient(180deg, #e6fbff, #6cc4ea); }
.tr-dots { display: inline-flex; gap: 8px; margin-left: 8px; vertical-align: middle; }
.tr-dots i { width: 24px; height: 24px; border-radius: 50%; background: #e9d6ac; border: 3px solid var(--wood); }
.tr-dots i.on { background: radial-gradient(circle at 35% 30%, #fff6b0, #ffc83d 55%, #e09a10); box-shadow: 0 0 12px rgba(255,200,61,.9);
  animation: tr-pop .35s cubic-bezier(.2,1.8,.4,1); }
.tr-key { display: inline-block; padding: 1px 8px; margin: 0 3px; border-radius: 7px; background: #fff; color: var(--ink); border: 2px solid var(--wood);
  box-shadow: 0 3px 0 var(--wood-dark); font-size: .8em; text-shadow: none; }
.tr-hint { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); padding: 8px 18px; border-radius: 14px;
  background: rgba(20, 40, 60, .5); color: #fff; font-size: 21px; font-weight: 600; display: flex; gap: 10px; align-items: center;
  text-shadow: 0 2px 3px rgba(0,0,0,.5); transition: opacity .3s; white-space: nowrap; }
.tr-hint.hide, .tr-meter.hide { opacity: 0; }
.tr-meter { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); width: 460px; height: 38px; border-radius: 19px;
  background: linear-gradient(180deg, #4d7fa8, #2c5577); border: 5px solid var(--wood); box-shadow: 0 6px 0 var(--wood-dark), 0 12px 26px rgba(0,0,0,.3);
  transition: opacity .3s; overflow: visible; }
.tr-meter .zone { position: absolute; top: 3px; bottom: 3px; border-radius: 12px; background: linear-gradient(180deg, #fff3a0, #ffc21a);
  box-shadow: 0 0 16px rgba(255, 200, 40, .95); }
.tr-meter .zone::after { content: "★"; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -52%); color: #b36b00; font-size: 20px; }
.tr-meter .needle { position: absolute; top: -10px; bottom: -10px; width: 12px; margin-left: -6px; border-radius: 6px; background: #fff;
  border: 3px solid #e63946; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
.tr-meter.hit .needle { background: #ffe14d; }
.tr-pop { position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%) scale(.4); font-size: 64px; font-weight: 700;
  color: #ffd23f; -webkit-text-stroke: 3px var(--wood-dark); text-shadow: 0 6px 0 var(--wood-dark), 0 0 24px rgba(255,210,63,.8);
  opacity: 0; pointer-events: none; }
.tr-pop.go { animation: tr-popword .9s cubic-bezier(.2,1.6,.4,1) forwards; }
.tr-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
.tr-flash.go { animation: tr-flash .45s ease-out; }
@keyframes tr-pop { from { transform: scale(.3); } }
@keyframes tr-popword { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.4); } 25% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  70% { opacity: 1; transform: translate(-50%, -60%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -80%) scale(.9); } }
@keyframes tr-flash { 0% { opacity: .75; } 100% { opacity: 0; } }
`;

/** A little keyboard key label for status and hint texts. */
export const key = (label: string) => `<span class="tr-key">${label}</span>`;

/** Progress bar (0..1) for the status pill. */
export const bar = (v: number, ice = false) => `<span class="tr-bar${ice ? " ice" : ""}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;

/** Row of dots, the first `done` lit. */
export const dots = (done: number, total: number) =>
  `<span class="tr-dots">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? "on" : ""}"></i>`).join("")}</span>`;

export class TreasureHud {
  private style: HTMLStyleElement;
  private hintEl: HTMLElement;
  private meterEl: HTMLElement;
  private zoneEl: HTMLElement;
  private needleEl: HTMLElement;
  private popEl: HTMLElement;
  private flashEl: HTMLElement;

  constructor(private ui: GameUI) {
    this.style = document.createElement("style");
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    const el = (cls: string, html = "") => {
      const e = document.createElement("div");
      e.className = cls;
      e.innerHTML = html;
      return e;
    };
    this.hintEl = el("tr-hint hide");
    this.meterEl = el("tr-meter hide", `<div class="zone"></div><div class="needle"></div>`);
    this.zoneEl = this.meterEl.querySelector(".zone")!;
    this.needleEl = this.meterEl.querySelector(".needle")!;
    this.popEl = el("tr-pop");
    this.flashEl = el("tr-flash");
    ui.layer.append(this.flashEl, this.hintEl, this.meterEl, this.popEl);
  }

  status(html: string | null): void {
    this.ui.status(html);
  }

  hint(html: string | null): void {
    if (html) this.hintEl.innerHTML = html;
    this.hintEl.classList.toggle("hide", !html);
  }

  /** Show the timing meter with its golden zone [from, to] (fractions of the bar). */
  meter(zone: [number, number] | null): void {
    this.meterEl.classList.toggle("hide", !zone);
    if (!zone) return;
    this.zoneEl.style.left = `${zone[0] * 100}%`;
    this.zoneEl.style.width = `${(zone[1] - zone[0]) * 100}%`;
  }

  needle(v: number, hit: boolean): void {
    this.needleEl.style.left = `${v * 100}%`;
    this.meterEl.classList.toggle("hit", hit);
  }

  /** Big praise word popping up mid-screen. */
  pop(text: string, color = "#ffd23f"): void {
    this.popEl.textContent = text;
    this.popEl.style.color = color;
    this.popEl.classList.remove("go");
    void this.popEl.offsetWidth;
    this.popEl.classList.add("go");
  }

  flash(): void {
    this.flashEl.classList.remove("go");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("go");
  }

  dispose(): void {
    this.ui.status(null);
    this.ui.prompt.show(null);
    for (const e of [this.style, this.hintEl, this.meterEl, this.popEl, this.flashEl]) e.remove();
  }
}
