/**
 * Title screen overlay: the game logo over a slow flight around the island and
 * a two-item menu (new adventure / continue), driven by arrow keys + Space.
 */

import { Input } from "../core/Input";
import { audio } from "../audio/Audio";

export type TitleChoice = "new" | "continue";

export class Title {
  private el: HTMLElement;
  private items: HTMLElement[] = [];
  private choices: TitleChoice[];
  private index = 0;
  private resolve: ((c: TitleChoice) => void) | null = null;

  constructor(layer: HTMLElement, hasSave: boolean) {
    this.choices = hasSave ? ["continue", "new"] : ["new"];
    this.el = document.createElement("div");
    this.el.className = "title-screen";
    this.el.innerHTML = `
      <div class="logo">Schatzkartenspiel</div>
      <div class="sub">Das Abenteuer von Tadeo</div>
      <div class="menu"></div>`;
    const menu = this.el.querySelector(".menu")!;
    for (const c of this.choices) {
      const item = document.createElement("div");
      item.textContent = c === "new" ? "Neues Abenteuer" : "Weiterspielen";
      menu.appendChild(item);
      this.items.push(item);
    }
    layer.appendChild(this.el);
    this.highlight();
  }

  /** Resolves with the chosen menu entry. */
  choose(): Promise<TitleChoice> {
    return new Promise((r) => (this.resolve = r));
  }

  update(input: Input): void {
    if (!this.resolve) return;
    const step = (input.consume("ArrowDown") ? 1 : 0) - (input.consume("ArrowUp") ? 1 : 0);
    if (step && this.choices.length > 1) {
      this.index = (this.index + step + this.choices.length) % this.choices.length;
      audio.playSfx("sfx_menu_select", 0.7);
      this.highlight();
    }
    if (input.consume("Space")) {
      audio.playSfx("sfx_menu_confirm");
      const r = this.resolve;
      this.resolve = null;
      this.el.classList.add("hide");
      setTimeout(() => this.el.remove(), 700);
      r(this.choices[this.index]);
    }
  }

  private highlight(): void {
    this.items.forEach((el, i) => el.classList.toggle("active", i === this.index));
  }
}
