/**
 * HUD: current quest card (top left), the four quest-item slots (top right),
 * control hints (bottom left), chapter banners and the off-screen objective arrow.
 */

import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { QUESTS } from "../data/quests";
import { ItemKey } from "../world/models/items";

const ITEM_ORDER: ItemKey[] = ["sword", "berry", "key", "hammer"];

export class Hud {
  private quest: HTMLElement;
  private items: HTMLElement;
  private help: HTMLElement;
  private banner: HTMLElement;
  private compass: HTMLElement;
  private coins: HTMLElement;
  private icons: Record<string, string> = {};

  constructor(private layer: HTMLElement) {
    this.quest = this.el("hud-quest");
    this.items = this.el("hud-items");
    this.coins = this.el("hud-coins");
    this.help = this.el("hud-help");
    this.help.innerHTML = `<span><span class="key">← ↑ → ↓</span> laufen</span>
      <span><span class="key">Leertaste</span> sprechen / springen</span>
      <span><span class="key">M</span> Ton</span><span><span class="key">V</span> Stimme</span>`;
    this.banner = this.el("banner");
    this.compass = this.el("compass");
    this.compass.textContent = "➤";
    this.compass.style.display = "none";
  }

  private el(cls: string): HTMLElement {
    const e = document.createElement("div");
    e.className = cls;
    this.layer.appendChild(e);
    return e;
  }

  setIcons(icons: Record<string, string>): void {
    this.icons = icons;
    this.refresh();
  }

  /** Re-read quest + inventory state. */
  refresh(): void {
    const q = QuestManager.getInstance();
    const quest = q.currentQuest;
    this.quest.innerHTML = `
      <div class="label">Aufgabe ${quest.id} von ${QUESTS.length}</div>
      <div class="title">${quest.name}</div>
      <div class="hint">${quest.hint}</div>`;
    const inv = InventoryManager.getInstance();
    this.items.innerHTML = ITEM_ORDER.map(
      (k) => `<div class="slot ${inv.hasItem(k) ? "" : "empty"}" data-item="${k}">${this.icons[k] ? `<img src="${this.icons[k]}" alt="">` : ""}</div>`,
    ).join("");
  }

  /** Bounce an item slot (after picking the item up). */
  popItem(key: ItemKey): void {
    this.refresh();
    const slot = this.items.querySelector(`[data-item="${key}"]`);
    slot?.classList.add("pop");
    setTimeout(() => slot?.classList.remove("pop"), 600);
  }

  /** Coin counter under the item slots; `pop` bounces it after a pickup. */
  setCoins(count: number, total: number, pop: boolean): void {
    this.coins.innerHTML = `<span class="coin"></span>${count} / ${total}`;
    if (!pop) return;
    this.coins.classList.remove("pop");
    void this.coins.offsetWidth;
    this.coins.classList.add("pop");
  }

  setVisible(v: boolean): void {
    for (const e of [this.quest, this.items, this.help, this.coins]) e.classList.toggle("hud-hidden", !v);
  }

  /** Big animated title card. Resolves after it has faded out again. */
  showBanner(small: string, big: string, ms = 2600): Promise<void> {
    this.banner.innerHTML = `<div class="small">${small}</div><div class="big">${big}</div>`;
    requestAnimationFrame(() => this.banner.classList.add("show"));
    return new Promise((resolve) =>
      setTimeout(() => {
        this.banner.classList.remove("show");
        setTimeout(resolve, 450);
      }, ms),
    );
  }

  /**
   * Point an arrow at the screen edge towards an off-screen objective.
   * `screen` is the objective in normalised device coords (x, y in [-1, 1]); `behind` = behind the camera.
   */
  updateCompass(screen: { x: number; y: number; behind: boolean } | null): void {
    if (!screen || (!screen.behind && Math.abs(screen.x) < 0.92 && Math.abs(screen.y) < 0.88)) {
      this.compass.style.display = "none";
      return;
    }
    let { x, y } = screen;
    // Reason: a target behind the camera projects mirrored — flip it and push it to the bottom edge
    if (screen.behind) {
      x = -x;
      y = -Math.abs(y) - 0.5;
    }
    const s = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.82, 1e-3);
    const ex = x / s;
    const ey = y / s;
    this.compass.style.display = "grid";
    this.compass.style.left = `${(ex * 0.5 + 0.5) * window.innerWidth}px`;
    this.compass.style.top = `${(-ey * 0.5 + 0.5) * window.innerHeight}px`;
    this.compass.style.transform = `rotate(${Math.atan2(-ey, ex)}rad)`;
  }
}

/** A floating "Leertaste" bubble above something the player can interact with. */
export class WorldPrompt {
  private el: HTMLElement;

  constructor(layer: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "prompt";
    this.el.style.display = "none";
    layer.appendChild(this.el);
  }

  /** Show at a screen position (pixels) with a verb, or hide with null. */
  show(px: { x: number; y: number } | null, verb = "Sprechen"): void {
    if (!px) {
      this.el.style.display = "none";
      return;
    }
    if (this.el.dataset.verb !== verb) {
      this.el.innerHTML = `<span class="key">Leertaste</span> ${verb}`;
      this.el.dataset.verb = verb;
    }
    this.el.style.display = "flex";
    this.el.style.left = `${px.x}px`;
    this.el.style.top = `${px.y}px`;
  }
}

/** A thought bubble above Tadeo for short remarks that don't need a dialogue box. */
export class Bubble {
  private el: HTMLElement;
  private until = 0;

  constructor(layer: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "bubble";
    layer.appendChild(this.el);
  }

  say(text: string, ms = 3200): void {
    this.el.textContent = text;
    this.until = performance.now() + ms;
  }

  get speaking(): boolean {
    return performance.now() < this.until;
  }

  /** Follow a screen position (pixels); hides itself once the remark has expired. */
  place(px: { x: number; y: number } | null): void {
    const show = px !== null && performance.now() < this.until;
    this.el.classList.toggle("show", show);
    if (px && show) {
      this.el.style.left = `${px.x}px`;
      this.el.style.top = `${px.y}px`;
    }
  }
}
