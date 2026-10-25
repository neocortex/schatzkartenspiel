/**
 * Village HUD bits on top of the shared GameUI: the status-pill contents
 * (progress dots, arrow-key chips), a bottom hint line, and the big maths
 * card with counting dots so a seven-year-old can count along.
 */

import { GameUI } from "../../ui/GameUI";

const CSS = `
.vt-dots { display: inline-flex; gap: 8px; margin-left: 6px; }
.vt-dots i { width: 24px; height: 24px; border-radius: 50%; background: #e9d6ac; border: 3px solid var(--wood); box-shadow: inset 0 3px 0 rgba(0,0,0,.12); }
.vt-dots i.on { background: radial-gradient(circle at 35% 30%, #fff6b0, #ffc83d 55%, #e09a10); box-shadow: 0 0 12px rgba(255,200,61,.9); animation: vt-pop .35s cubic-bezier(.2,1.8,.4,1); }
.vt-chip { display: inline-grid; place-items: center; width: 42px; height: 42px; border-radius: 10px; color: #fff; font-size: 28px;
  border: 3px solid rgba(0,0,0,.25); box-shadow: 0 4px 0 rgba(0,0,0,.25); text-shadow: 0 2px 0 rgba(0,0,0,.3); transition: transform .2s; }
.vt-chip.done { transform: scale(.8); filter: saturate(.4) brightness(1.1); position: relative; }
.vt-chip.done::after { content: "✔"; position: absolute; right: -10px; top: -12px; font-size: 22px; color: #2f9e44; text-shadow: 0 0 4px #fff, 0 0 4px #fff; }
.vt-hint { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); padding: 8px 18px; border-radius: 14px;
  background: rgba(30, 18, 40, .55); color: #fff; font-size: 21px; font-weight: 600; display: flex; gap: 10px; align-items: center;
  text-shadow: 0 2px 3px rgba(0,0,0,.5); transition: opacity .3s; white-space: nowrap; }
.vt-hint.hide { opacity: 0; }
.vt-math { position: absolute; left: 50%; top: 16px; transform: translateX(-50%) scale(.7); opacity: 0; padding: 12px 34px 14px;
  border-radius: 28px; background: linear-gradient(180deg, rgba(255,246,224,.97), rgba(242,222,176,.97)); border: 5px solid var(--wood);
  box-shadow: 0 7px 0 var(--wood-dark), 0 16px 34px rgba(0,0,0,.35); color: var(--ink); text-align: center;
  transition: transform .45s cubic-bezier(.2,1.5,.4,1), opacity .3s; }
.vt-math.show { transform: translateX(-50%) scale(1); opacity: 1; }
.vt-math .eq { display: flex; gap: 22px; align-items: flex-start; justify-content: center; }
.vt-math .term { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.vt-math .num { font-size: 66px; font-weight: 600; line-height: 1; }
.vt-math .op { font-size: 58px; font-weight: 600; line-height: 1.1; color: var(--red); }
.vt-math .q { color: #7b4bb5; animation: vt-bob 1s ease-in-out infinite; }
.vt-math .count { display: grid; grid-template-columns: repeat(5, 14px); gap: 4px; justify-content: center; }
.vt-math .count b { width: 14px; height: 14px; border-radius: 50%; background: #ff8c3a; box-shadow: inset 0 -2px 0 rgba(0,0,0,.2); }
.vt-math .count b.gone { background: #d8c49a; position: relative; }
.vt-math .count b.gone::after { content: ""; position: absolute; left: -2px; right: -2px; top: 6px; height: 3px; background: var(--red); transform: rotate(-35deg); border-radius: 2px; }
@keyframes vt-pop { from { transform: scale(.3); } }
@keyframes vt-bob { 50% { transform: translateY(-5px); } }
`;

export const KEY_GLYPH: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };

export class VillageHud {
  private style: HTMLStyleElement;
  private hintEl: HTMLElement;
  private mathEl: HTMLElement;

  constructor(private ui: GameUI) {
    this.style = document.createElement("style");
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.hintEl = document.createElement("div");
    this.hintEl.className = "vt-hint hide";
    this.mathEl = document.createElement("div");
    this.mathEl.className = "vt-math";
    ui.layer.append(this.hintEl, this.mathEl);
  }

  status(html: string | null): void {
    this.ui.status(html);
  }

  /** Small line at the bottom of the screen (hidden while a dialogue is open). */
  hint(html: string | null): void {
    if (html !== null && this.hintEl.innerHTML !== html) this.hintEl.innerHTML = html;
    this.hintEl.classList.toggle("hide", html === null);
  }

  /** Hide the hint while dialogue boxes cover the bottom of the screen. */
  setHintVisible(visible: boolean): void {
    this.hintEl.style.visibility = visible ? "visible" : "hidden";
  }

  /** Big "a + b = ?" card with counting dots; pass null to hide it. */
  math(q: { a: number; b: number; op: "+" | "-" } | null): void {
    if (!q) {
      this.mathEl.classList.remove("show");
      return;
    }
    const dots = (n: number, gone = 0) => `<div class="count">${Array.from({ length: n }, (_, i) => `<b class="${i >= n - gone ? "gone" : ""}"></b>`).join("")}</div>`;
    // Reason: for "8 − 3" the eight dots show three crossed out, so the answer can be counted directly
    const left = q.op === "-" ? dots(q.a, q.b) : dots(q.a);
    const right = q.op === "-" ? "" : dots(q.b);
    this.mathEl.innerHTML = `<div class="eq">
      <div class="term"><div class="num">${q.a}</div>${left}</div>
      <div class="op">${q.op === "-" ? "−" : "+"}</div>
      <div class="term"><div class="num">${q.b}</div>${right}</div>
      <div class="op">=</div>
      <div class="term"><div class="num q">?</div></div></div>`;
    requestAnimationFrame(() => this.mathEl.classList.add("show"));
  }

  dispose(): void {
    this.ui.status(null);
    this.style.remove();
    this.hintEl.remove();
    this.mathEl.remove();
  }
}

/** Progress dots: `done` of `total` filled. */
export function dots(done: number, total: number): string {
  return `<span class="vt-dots">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? "on" : ""}"></i>`).join("")}</span>`;
}

/** A coloured arrow-key chip. */
export function chip(key: string, color: string, done = false): string {
  return `<span class="vt-chip ${done ? "done" : ""}" style="background:${color}">${KEY_GLYPH[key]}</span>`;
}
