/**
 * GameUI — the HTML overlay shared by the island and every challenge:
 * dialogue box, HUD, world prompts, a status pill for challenge counters and
 * the big "you found an item!" celebration.
 */

import "./ui.css";
import { Dialogue } from "./Dialogue";
import { Hud, WorldPrompt } from "./Hud";
import { renderSnapshots } from "./Snapshots";
import { DIALOGUES, DialogueScript } from "../data/dialogues";
import { ITEMS } from "../data/items";
import { Input } from "../core/Input";
import { audio } from "../audio/Audio";
import { ItemKey } from "../world/models/items";

export class GameUI {
  readonly layer: HTMLElement;
  readonly dialogue: Dialogue;
  readonly hud: Hud;
  readonly prompt: WorldPrompt;
  /** Portrait (data URL) per character key: tadeo, elder, wiseWoman, wiseMan. */
  readonly portraits: Record<string, string>;
  /** Icon (data URL) per quest item. */
  readonly icons: Record<ItemKey, string>;
  private statusEl: HTMLElement;
  private itemEl: HTMLElement;

  constructor() {
    this.layer = document.getElementById("ui")!;
    this.layer.classList.add("ui-layer");
    const snaps = renderSnapshots();
    this.portraits = snaps.portraits;
    this.icons = snaps.items;

    this.hud = new Hud(this.layer);
    this.hud.setIcons(this.icons);
    this.prompt = new WorldPrompt(this.layer);
    this.dialogue = new Dialogue(this.layer);
    this.dialogue.setPortraits(this.portraits);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "status";
    this.statusEl.style.display = "none";
    this.layer.appendChild(this.statusEl);

    this.itemEl = document.createElement("div");
    this.itemEl.className = "item-get";
    this.layer.appendChild(this.itemEl);
  }

  /** Call once per frame (before scenes read input) so Space advances dialogue. */
  update(dt: number, input: Input): void {
    this.dialogue.update(dt, input);
  }

  /** A dialogue read on a black screen. Reason: the fade sits above the UI, so the UI steps in front of it for this. */
  async sayOverBlack(script: string | DialogueScript): Promise<void> {
    this.layer.style.zIndex = "101";
    await this.say(script);
    this.layer.style.zIndex = "";
  }

  /** Play a dialogue from `DIALOGUES` by key, or an inline script. */
  say(script: string | DialogueScript): Promise<void> {
    const lines = typeof script === "string" ? DIALOGUES[script] : script;
    if (!lines?.length) {
      console.warn(`Dialogue "${String(script)}" not found`);
      return Promise.resolve();
    }
    return this.dialogue.play(lines);
  }

  /**
   * Small top-centre pill for challenge counters ("🫐 3 / 5", hearts, timers).
   * Accepts HTML; pass null to hide it.
   */
  status(html: string | null): void {
    if (html === null) {
      this.statusEl.style.display = "none";
      return;
    }
    this.statusEl.style.display = "flex";
    if (this.statusEl.innerHTML !== html) this.statusEl.innerHTML = html;
  }

  /** Full-screen "item found" celebration with rays and a fanfare. Resolves when it has faded. */
  itemGet(key: ItemKey, ms = 3200): Promise<void> {
    const name = ITEMS[key]?.name ?? key;
    this.itemEl.innerHTML = `
      <div class="rays"></div>
      <img class="icon" src="${this.icons[key]}" alt="">
      <div class="caption"><div class="small">Du hast gefunden:</div><div class="big">${name}!</div></div>`;
    audio.playSfx("sfx_item_get");
    requestAnimationFrame(() => this.itemEl.classList.add("show"));
    return new Promise((resolve) =>
      setTimeout(() => {
        this.itemEl.classList.remove("show");
        setTimeout(resolve, 500);
      }, ms),
    );
  }
}
