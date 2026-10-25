/**
 * Fishing overlays on top of the shared game UI: the catch card (fish icon,
 * name, size and a badge), the bouncing "!" when a fish bites, a controls
 * hint at the bottom and the fish slots for the status pill.
 */

import "./fishing.css";
import { IconKey } from "./icons";

export interface CardInfo {
  icon: IconKey;
  name: string;
  size?: string;
  badge?: string;
  rare?: boolean;
}

export class FishingHud {
  private root: HTMLElement;
  private card: HTMLElement;
  private alert: HTMLElement;
  private hint: HTMLElement;

  constructor(layer: HTMLElement, private icons: Record<IconKey, string>) {
    this.root = document.createElement("div");
    this.root.className = "fish-hud";
    this.root.innerHTML = `
      <div class="fish-card"><div class="rays"></div><div class="box">
        <img class="icon" alt=""><div class="name"></div><div class="size"></div><div class="badge"></div>
      </div></div>
      <div class="fish-alert">!</div>
      <div class="fish-hint"></div>`;
    layer.appendChild(this.root);
    this.card = this.root.querySelector(".fish-card")!;
    this.alert = this.root.querySelector(".fish-alert")!;
    this.hint = this.root.querySelector(".fish-hint")!;
  }

  /** Pop the catch card in (stays until `hideCard`). */
  showCard(info: CardInfo): void {
    this.card.querySelector<HTMLImageElement>(".icon")!.src = this.icons[info.icon];
    this.card.querySelector(".name")!.textContent = info.name;
    this.card.querySelector(".size")!.textContent = info.size ?? "";
    this.card.querySelector(".badge")!.textContent = info.badge ?? "";
    this.card.classList.toggle("rare", !!info.rare);
    requestAnimationFrame(() => this.card.classList.add("show"));
  }

  hideCard(): void {
    this.card.classList.remove("show");
  }

  get cardShowing(): boolean {
    return this.card.classList.contains("show");
  }

  /** The bouncing "!" above the bobber (screen pixels), or null to hide. */
  showAlert(px: { x: number; y: number } | null): void {
    this.alert.classList.toggle("show", !!px);
    if (px) {
      this.alert.style.left = `${px.x}px`;
      this.alert.style.top = `${px.y}px`;
    }
  }

  /** Controls hint at the bottom (HTML), or null to hide. */
  showHint(html: string | null): void {
    if (html !== null && this.hint.innerHTML !== html) this.hint.innerHTML = html;
    this.hint.classList.toggle("show", html !== null);
  }

  /** Status pill content: one slot per fish to catch, filled with the icons caught so far. */
  pill(caught: IconKey[], goal: number, fresh: boolean): string {
    const slots = Array.from({ length: goal }, (_, i) => {
      const kind = caught[i];
      if (!kind) return `<span class="fish-slot empty"></span>`;
      const pop = fresh && i === caught.length - 1 ? " new" : "";
      return `<img class="fish-slot${pop}" src="${this.icons[kind]}" alt="">`;
    });
    return `<span class="fish-slots">${slots.join("")}</span><span>${caught.length} / ${goal}</span>`;
  }

  dispose(): void {
    this.root.remove();
  }
}
