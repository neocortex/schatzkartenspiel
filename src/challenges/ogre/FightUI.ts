/**
 * HTML overlay for the ogre fight: four big chunky action cards (Angreifen,
 * Verteidigen, Heilen, Spezial) chosen with the arrow keys and Space, the two
 * health bars (in the shared status pill) with a trailing "damage ghost", and
 * a bouncing warning bubble when the ogre winds up his club.
 */

import { GameUI } from "../../ui/GameUI";
import { Input } from "../../core/Input";
import { audio } from "../../audio/Audio";
import { injectStyle } from "./popups";
import { HeroAction, CHARGE_NEEDED } from "./fight";

const CSS = /* css */ `
.og-menu {
  position: absolute; left: 50%; bottom: 26px; transform: translate(-50%, 160px);
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  opacity: 0; transition: transform .45s cubic-bezier(.2,1.4,.4,1), opacity .25s;
  font-family: "Fredoka", system-ui, sans-serif;
}
.og-menu.show { transform: translate(-50%, 0); opacity: 1; }
.og-row { display: flex; gap: 18px; }
.og-hint { color: #fff; font-size: 22px; font-weight: 600; text-shadow: 0 2px 0 rgba(0,0,0,.45), 0 4px 14px rgba(0,0,0,.4); display: flex; gap: 10px; align-items: center; }
.og-card {
  position: relative; width: 168px; height: 150px; border-radius: 26px;
  background: linear-gradient(180deg, #fff6e0, #f2deb0);
  border: 5px solid #8a5530; box-shadow: 0 8px 0 #5e3a1f, 0 16px 30px rgba(0,0,0,.35), inset 0 0 0 3px rgba(255,255,255,.6);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: #3b2414; font-size: 25px; font-weight: 600;
  transition: transform .22s cubic-bezier(.2,1.6,.4,1), box-shadow .2s, filter .2s;
}
.og-card .ico { width: 78px; height: 78px; display: grid; place-items: center; font-size: 60px; line-height: 1; filter: drop-shadow(0 4px 2px rgba(0,0,0,.25)); }
.og-card .ico img { width: 100%; height: 100%; }
.og-card.active { transform: translateY(-16px) scale(1.12); border-color: #ffc83d; box-shadow: 0 8px 0 #b77d14, 0 0 0 6px rgba(255,214,90,.55), 0 22px 40px rgba(0,0,0,.4); }
.og-card.active::before {
  content: "▼"; position: absolute; top: -48px; left: 50%; transform: translateX(-50%);
  color: #ffc83d; font-size: 36px; -webkit-text-stroke: 3px #5e3a1f; paint-order: stroke fill;
  animation: og-point .7s ease-in-out infinite;
}
@keyframes og-point { 50% { margin-top: -8px; } }
.og-card.pressed { animation: og-press .25s ease; }
@keyframes og-press { 40% { transform: translateY(-4px) scale(.94); } }
.og-card.locked .ico { filter: grayscale(1) brightness(1.1) opacity(.45); }
.og-card.locked { color: #8d7a63; }
.og-card.ready { background: linear-gradient(180deg, #fff9d6, #ffd96b); }
.og-card.ready .ico { animation: og-wiggle 1s ease-in-out infinite; }
@keyframes og-wiggle { 25% { transform: rotate(-12deg) scale(1.1); } 75% { transform: rotate(12deg) scale(1.1); } }
.og-card.warn { animation: og-warn .6s ease-in-out infinite; }
.og-card.warn.active { animation: none; }
@keyframes og-warn { 50% { box-shadow: 0 8px 0 #5e3a1f, 0 0 0 8px rgba(255,80,60,.75), 0 16px 30px rgba(0,0,0,.35); } }
.og-card.shake { animation: og-shake .4s ease; }
@keyframes og-shake { 20%,60% { transform: translateX(-10px); } 40%,80% { transform: translateX(10px); } }
.og-pips { display: flex; gap: 6px; }
.og-pips i { width: 14px; height: 14px; border-radius: 50%; background: #d8c39b; border: 2px solid #8a5530; }
.og-pips i.on { background: #ffc83d; box-shadow: 0 0 8px #ffd23f; }
.og-warnbox {
  position: absolute; left: 50%; top: 118px; transform: translate(-50%, 0) scale(.6); opacity: 0;
  padding: 12px 28px; border-radius: 22px; background: #e63946; color: #fff; border: 5px solid #fff;
  font-family: "Fredoka", system-ui, sans-serif; font-size: 34px; font-weight: 600; white-space: nowrap;
  box-shadow: 0 7px 0 #8f1d27, 0 18px 34px rgba(0,0,0,.35); text-shadow: 0 3px 0 rgba(0,0,0,.25);
  transition: transform .35s cubic-bezier(.2,1.6,.4,1), opacity .2s;
}
.og-warnbox.show { transform: translate(-50%, 0) scale(1); opacity: 1; animation: og-bob .8s ease-in-out infinite; }
@keyframes og-bob { 50% { margin-top: -6px; } }
.og-bars { display: flex; align-items: center; gap: 18px; font-size: 22px; }
.og-side { display: flex; align-items: center; gap: 10px; }
.og-side.right { flex-direction: row-reverse; }
.og-face { width: 54px; height: 54px; border-radius: 50%; border: 4px solid #8a5530; background: radial-gradient(circle at 40% 35%, #fff3cf, #f5c86a); overflow: hidden; display: grid; place-items: center; font-size: 34px; }
.og-face img { width: 120%; height: 120%; object-fit: cover; }
.og-track { position: relative; width: 230px; height: 26px; border-radius: 14px; background: #5e3a1f; border: 3px solid #3b2414; overflow: hidden; box-shadow: inset 0 3px 0 rgba(0,0,0,.35); }
.og-ghost, .og-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 10px; }
.og-ghost { background: #fff3c4; transition: width .7s ease .35s; }
.og-fill { transition: width .25s ease, background .3s; box-shadow: inset 0 5px 0 rgba(255,255,255,.35), inset 0 -4px 0 rgba(0,0,0,.15); }
.og-hero .og-fill { background: linear-gradient(180deg, #7ee05a, #3fae35); }
.og-hero.low .og-fill { background: linear-gradient(180deg, #ffb45a, #e8642c); }
.og-ogre .og-fill { background: linear-gradient(180deg, #ff7a5a, #d8382b); }
.og-num { min-width: 64px; text-align: center; font-weight: 600; }
.og-vs { font-size: 30px; font-weight: 600; color: #e63946; -webkit-text-stroke: 2px #5e3a1f; paint-order: stroke fill; }
.og-track.bump { animation: og-bump .35s ease; }
@keyframes og-bump { 30% { transform: scale(1.08) rotate(-2deg); } 60% { transform: scale(.97) rotate(1deg); } }
`;

interface CardDef {
  action: HeroAction;
  label: string;
  icon: string;
}

export class FightUI {
  private menu: HTMLElement;
  private cards: HTMLElement[] = [];
  private hint: HTMLElement;
  private warnBox: HTMLElement;
  private index = 0;
  private pick: ((a: HeroAction) => void) | null = null;
  private charge = 0;
  private warnDefend = false;
  private hintTimer = 0;
  private defs: CardDef[];

  constructor(
    private ui: GameUI,
    private ogrePortrait: string,
  ) {
    injectStyle("og-fight-style", CSS);
    this.defs = [
      { action: "attack", label: "Angreifen", icon: `<img src="${ui.icons.sword}" alt="">` },
      { action: "defend", label: "Verteidigen", icon: "🛡️" },
      { action: "heal", label: "Heilen", icon: `<img src="${ui.icons.berry}" alt="">` },
      { action: "special", label: "Spezial", icon: "🌟" },
    ];
    this.menu = document.createElement("div");
    this.menu.className = "og-menu";
    this.menu.innerHTML = `<div class="og-hint"></div><div class="og-row">${this.defs
      .map((d) => `<div class="og-card" data-a="${d.action}"><div class="ico">${d.icon}</div><div>${d.label}</div>${d.action === "special" ? `<div class="og-pips">${"<i></i>".repeat(CHARGE_NEEDED)}</div>` : ""}</div>`)
      .join("")}</div>`;
    ui.layer.appendChild(this.menu);
    this.cards = [...this.menu.querySelectorAll<HTMLElement>(".og-card")];
    this.hint = this.menu.querySelector(".og-hint")!;
    this.warnBox = document.createElement("div");
    this.warnBox.className = "og-warnbox";
    ui.layer.appendChild(this.warnBox);
  }

  /** Show the health bars in the status pill. */
  showBars(heroMax: number, ogreMax: number): void {
    const side = (cls: string, img: string, max: number) => `
      <div class="og-side ${cls}">
        <div class="og-face">${img}</div>
        <div class="og-track"><div class="og-ghost" style="width:100%"></div><div class="og-fill" style="width:100%"></div></div>
        <div class="og-num">${max}</div>
      </div>`;
    const tadeo = `<img src="${this.ui.portraits.tadeo}" alt="">`;
    const ogre = this.ogrePortrait ? `<img src="${this.ogrePortrait}" alt="">` : "👹";
    this.ui.status(`<div class="og-bars">${side("og-hero", tadeo, heroMax)}<div class="og-vs">VS</div>${side("og-ogre right", ogre, ogreMax)}</div>`);
  }

  /** Update one health bar (animated). */
  setHealth(who: "hero" | "ogre", hp: number, max: number): void {
    const el = this.ui.layer.querySelector<HTMLElement>(`.og-${who}`);
    if (!el) return;
    const pct = `${Math.max(0, (hp / max) * 100)}%`;
    const fill = el.querySelector<HTMLElement>(".og-fill")!;
    const ghost = el.querySelector<HTMLElement>(".og-ghost")!;
    const track = el.querySelector<HTMLElement>(".og-track")!;
    const dropped = parseFloat(fill.style.width) > parseFloat(pct);
    fill.style.width = pct;
    // Reason: the pale ghost lags behind on damage (shows the chunk lost) but jumps up instantly on heals
    ghost.style.transition = dropped ? "" : "none";
    ghost.style.width = pct;
    el.querySelector(".og-num")!.textContent = String(Math.max(0, Math.round(hp)));
    el.classList.toggle("low", hp / max < 0.35);
    track.classList.remove("bump");
    void track.offsetWidth;
    track.classList.add("bump");
  }

  setCharge(charge: number): void {
    this.charge = charge;
    const card = this.cards[3];
    card.querySelectorAll("i").forEach((pip, i) => pip.classList.toggle("on", i < charge));
    card.classList.toggle("locked", charge < CHARGE_NEEDED);
    card.classList.toggle("ready", charge >= CHARGE_NEEDED);
  }

  /** Big red warning bubble (null hides it). */
  warn(text: string | null): void {
    if (text) this.warnBox.textContent = text;
    this.warnBox.classList.toggle("show", !!text);
  }

  /** Show the menu and resolve with the chosen action. `suggest` preselects (and highlights) a card. */
  choose(suggest: HeroAction | null = null): Promise<HeroAction> {
    this.warnDefend = suggest === "defend";
    if (suggest) this.index = this.defs.findIndex((d) => d.action === suggest);
    else if (this.charge >= CHARGE_NEEDED) this.index = 3;
    else if (this.index === 3 || this.index === 1) this.index = 0;
    this.cards[1].classList.toggle("warn", this.warnDefend);
    this.setHint(null);
    this.render();
    this.menu.classList.add("show");
    return new Promise((resolve) => (this.pick = resolve));
  }

  get isChoosing(): boolean {
    return this.pick !== null;
  }

  /** The action currently highlighted (for tests and debugging). */
  get highlighted(): HeroAction {
    return this.defs[this.index].action;
  }

  update(dt: number, input: Input, blocked: boolean): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.setHint(null);
    }
    if (!this.pick || blocked) return;
    const n = this.cards.length;
    if (input.consume("ArrowLeft") || input.consume("ArrowUp")) this.move(-1, n);
    if (input.consume("ArrowRight") || input.consume("ArrowDown")) this.move(1, n);
    if (input.consume("Space")) this.confirm();
  }

  hide(): void {
    this.menu.classList.remove("show");
    this.cards[1].classList.remove("warn");
  }

  destroy(): void {
    this.menu.remove();
    this.warnBox.remove();
  }

  private move(dir: number, n: number): void {
    this.index = (this.index + dir + n) % n;
    audio.playSfx("sfx_menu_select", 0.7);
    this.render();
  }

  private confirm(): void {
    const def = this.defs[this.index];
    const card = this.cards[this.index];
    if (def.action === "special" && this.charge < CHARGE_NEEDED) {
      audio.playSfx("sfx_simon_wrong", 0.5);
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");
      this.setHint(`Noch nicht bereit! Greif ${CHARGE_NEEDED - this.charge}× an oder verteidige dich.`, 2.6);
      return;
    }
    audio.playSfx("sfx_menu_confirm", 0.8);
    card.classList.remove("pressed");
    void card.offsetWidth;
    card.classList.add("pressed");
    const pick = this.pick!;
    this.pick = null;
    this.hide();
    pick(def.action);
  }

  private render(): void {
    this.cards.forEach((c, i) => c.classList.toggle("active", i === this.index));
  }

  private setHint(text: string | null, seconds = 0): void {
    this.hint.innerHTML = text ?? `<span class="key">← →</span> aussuchen &nbsp; <span class="key">Leertaste</span> los!`;
    this.hintTimer = seconds;
  }
}
