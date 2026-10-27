/**
 * The shield timing ring for the ogre fight: while the ogre swings, a white
 * ring shrinks onto a golden shield ring over Tadeo. When it turns green,
 * Space raises the magic shield in time. Too early only shows "Zu früh!" and
 * Tadeo can try again a moment later; the green window runs in slow motion.
 * Runs on the fight's game-time timeline, so it stays in sync with the swing.
 */

import * as THREE from "three";
import { GameUI } from "../../ui/GameUI";
import { Input } from "../../core/Input";
import { audio } from "../../audio/Audio";
import { Timeline } from "./kit";
import { Popups, injectStyle } from "./popups";

/** Seconds (game time) before the strike lands in which Space blocks. */
const WINDOW = 0.38;
/** After a too-early press Tadeo has to wait this long before trying again. */
const RETRY_AFTER = 0.25;

const CSS = /* css */ `
.og-block { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; display: none; font-family: "Fredoka", system-ui, sans-serif; }
.og-block.show { display: block; }
.og-block > div { position: absolute; left: 0; top: 0; border-radius: 50%; transform: translate(-50%, -50%); }
.og-block .target { width: 128px; height: 128px; border: 9px solid rgba(255, 210, 63, 0.95); background: rgba(255, 246, 224, 0.18);
  box-shadow: 0 0 18px rgba(255, 210, 63, 0.8), inset 0 0 14px rgba(255, 210, 63, 0.5); display: grid; place-items: center; font-size: 58px; }
.og-block .shrink { width: 128px; height: 128px; border: 7px solid #ffffff; box-shadow: 0 0 10px rgba(255,255,255,0.8); }
.og-block .label { width: auto; height: auto; border-radius: 0; top: 92px; transform: translate(-50%, 0); font-size: 34px; font-weight: 700; color: #fff;
  -webkit-text-stroke: 6px #3b2414; paint-order: stroke fill; white-space: nowrap; }
.og-block.now .target { border-color: #5dff7a; box-shadow: 0 0 30px #5dff7a, inset 0 0 20px rgba(93, 255, 122, 0.7); animation: og-block-pulse 0.22s infinite alternate; }
.og-block.now .shrink { border-color: #5dff7a; }
.og-block.now .label { color: #5dff7a; font-size: 48px; }
.og-block.done .target { border-color: #7fdcff; box-shadow: 0 0 34px #7fdcff, inset 0 0 22px rgba(127, 220, 255, 0.8); animation: none; transform: translate(-50%, -50%) scale(1.25); transition: transform .15s; }
.og-block.done .shrink { display: none; }
.og-block.done .label { color: #7fdcff; }
@keyframes og-block-pulse { to { transform: translate(-50%, -50%) scale(1.12); } }
`;

export interface BlockStage {
  tl: Timeline;
  pop: Popups;
  slowmo(scale: number, seconds: number): void;
}

export class BlockPrompt {
  /** True while the green window is open (read by the E2E test). */
  now = false;
  /** How many times the ring was shown (the first one explains itself). */
  private shown = 0;
  private el: HTMLElement;
  private shrink: HTMLElement;
  private label: HTMLElement;
  private running = false;
  private pressed = false;
  private v = new THREE.Vector3();

  constructor(
    ui: GameUI,
    private camera: THREE.Camera,
  ) {
    injectStyle("og-block-style", CSS);
    this.el = document.createElement("div");
    this.el.className = "og-block";
    this.el.innerHTML = `<div class="target">🛡️</div><div class="shrink"></div><div class="label"></div>`;
    this.shrink = this.el.querySelector(".shrink")!;
    this.label = this.el.querySelector(".label")!;
    ui.layer.appendChild(this.el);
  }

  /**
   * Latch Space while the ring runs. Called every frame before the timeline
   * updates: code resuming after an `await` would run too late to see the press.
   */
  update(input: Input): void {
    if (this.running && input.consume("Space")) this.pressed = true;
  }

  /**
   * Show the ring over `at()` for `lead` seconds of game time, until the strike
   * lands. `onBlock` runs the moment Tadeo raises his shield in time.
   * Resolves (at the strike) with whether he blocked.
   */
  async run(s: BlockStage, lead: number, at: () => THREE.Vector3, slow: number, onBlock: () => void): Promise<boolean> {
    this.shown++;
    this.running = true;
    this.pressed = false;
    let blocked = false;
    let slowed = false;
    let retryAt = 0;
    const idle = this.shown === 1 ? "Leertaste, wenn's grün wird!" : "Leertaste!";
    this.el.classList.remove("done", "now");
    this.el.classList.add("show");
    await s.tl.tween(lead, (k) => {
      const t = k * lead;
      const open = !blocked && lead - t <= WINDOW;
      if (open && !slowed) {
        slowed = true;
        s.slowmo(slow, WINDOW / slow + 0.1);
      }
      if (this.pressed && !blocked) {
        this.pressed = false;
        if (open && t >= retryAt) {
          blocked = true;
          this.el.classList.add("done");
          onBlock();
        } else if (!open && t >= retryAt) {
          retryAt = t + RETRY_AFTER;
          audio.playSfx("sfx_simon_wrong", 0.4);
          s.pop.show("Zu früh!", at().add(new THREE.Vector3(0, 1.3, 0)), { size: 36, color: "#ffe066", life: 0.9 });
        }
      }
      this.now = open;
      this.el.classList.toggle("now", open);
      this.label.textContent = blocked ? "Abgewehrt!" : open ? "JETZT!" : idle;
      this.shrink.style.transform = `translate(-50%, -50%) scale(${(1 + (1 - k) * 2.4).toFixed(3)})`;
      this.place(at());
    });
    this.running = false;
    this.now = false;
    this.el.classList.remove("show", "now", "done");
    s.slowmo(1, 0);
    return blocked;
  }

  destroy(): void {
    this.el.remove();
  }

  private place(world: THREE.Vector3): void {
    this.v.copy(world).project(this.camera);
    const x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }
}
