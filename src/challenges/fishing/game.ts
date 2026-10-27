/**
 * FishingGame — the live state of a fishing session and everything that runs
 * every frame: aiming with the arrow keys, where the bobber is (on the rod,
 * flying, floating, pulled under, carried by a catch), the bite window,
 * speech bubbles, the "!" alert, the HUD and the camera. The story itself
 * (flow.ts) drives it step by step through small frame-based promises.
 */

import * as THREE from "three";
import { Engine } from "../../core/Engine";
import { GameUI } from "../../ui/GameUI";
import { DialogueScript } from "../../data/dialogues";
import { NarrationManager } from "../../systems/NarrationManager";
import { SpeechBubble, toScreen } from "../shared/speech";
import { ShotCamera, SHOTS } from "./camera";
import { Bucket } from "./catch";
import { FishingHud } from "./hud";
import { IconKey, renderFishIcons } from "./icons";
import { GOAL, SAY } from "./script";
import { FishKind } from "./species";
import { Fish, FishLook } from "./swimmers";
import { swell } from "./water";
import { FishingWorld } from "./world";

export type Phase = "intro" | "aim" | "cast" | "wait" | "nibble" | "bite" | "reel" | "show" | "miss" | "ending" | "done";
export type BobberMode = "rod" | "fly" | "float" | "under" | "carried";
export type Speaker = "Fischer Jonas" | "Tadeo" | "Henni";

/** Where the aim marker may go (over the open sand). */
const AIM = { x0: -4.6, x1: 4.6, z0: -11.2, z1: -3.6 };
const AIM_SPEED = 4.2;
/** How deep the hook hangs below the bobber. */
export const HOOK_Y = -0.58;
/** Seconds to press Space once a fish bites (generous: the player is seven). */
export const BITE_WINDOW = 1.3;
const BEST_KEY = "schatzkarten_fishing_best";

interface Tween {
  t: number;
  dur: number;
  fn: (k: number, dt: number) => void;
  done: () => void;
}

export class FishingGame {
  readonly world: FishingWorld;
  readonly cam: ShotCamera;
  readonly hud: FishingHud;
  readonly bucket: Bucket;
  engine: Engine | null = null;
  phase: Phase = "intro";
  /** "play" follows the aim marker; "fixed" holds whatever shot the story set. */
  camMode: "play" | "fixed" = "fixed";
  readonly aim = new THREE.Vector3(0.8, 0, -6.4);
  /** Where the bobber floats once it has landed. */
  readonly spot = new THREE.Vector3();
  bobberMode: BobberMode = "rod";
  /** Bobber position while flying or carried by a catch (set by the story's tweens). */
  readonly carry = new THREE.Vector3();
  readonly caught: FishKind[] = [];
  bottleDone = false;
  goldenArrived = false;
  casts = 0;
  bites = 0;
  misses = 0;
  /** Misses in a row (each one makes the next bite window a little longer). */
  missStreak = 0;
  /** The message bottle once it has been fished out. */
  bottle: THREE.Group | null = null;
  /** Seconds left to strike while a fish is biting. */
  windowLeft = 0;
  castPressed = false;
  struck = false;
  biter: Fish | null = null;
  biggest = 0;
  readonly best: number;
  private bubbles: Record<Speaker, SpeechBubble>;
  private dip = 0;
  private dipVel = 0;
  private tweens: Tween[] = [];
  private waiters: { pred: () => boolean; resolve: () => void; left: number }[] = [];
  private loops = new Set<(dt: number, time: number) => void>();
  private earlyCooldown = 0;
  private trail = 0;
  private time = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(
    readonly ui: GameUI,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.world = new FishingWorld(scene);
    this.cam = new ShotCamera(camera);
    this.hud = new FishingHud(ui.layer, renderFishIcons());
    this.bucket = new Bucket(this.world.dock.bucket);
    this.bubbles = { "Fischer Jonas": new SpeechBubble(ui.layer), Tadeo: new SpeechBubble(ui.layer), Henni: new SpeechBubble(ui.layer) };
    let best = 0;
    try {
      best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    } catch {
      // Reason: storage may be blocked (private mode); the record just starts at zero
    }
    this.best = best;
    this.cam.cut(SHOTS.opening);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.cam.camera;
  }

  get tackle() {
    return this.world.tackle;
  }

  get crew() {
    return this.world.crew;
  }

  // ── Story helpers ──────────────────────────────────────────

  /** Run `fn(k)` every frame for `seconds` (k: 0 → 1). */
  tween(seconds: number, fn: (k: number, dt: number) => void = () => {}): Promise<void> {
    return new Promise((done) => this.tweens.push({ t: 0, dur: Math.max(seconds, 0.001), fn, done }));
  }

  wait(seconds: number): Promise<void> {
    return this.tween(seconds);
  }

  /** Resolve once `pred()` is true (checked every frame), or after `timeout` seconds. */
  until(pred: () => boolean, timeout = Infinity): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ pred, resolve, left: timeout }));
  }

  /** Run `fn` every frame until the returned stop function is called. */
  every(fn: (dt: number, time: number) => void): () => void {
    this.loops.add(fn);
    return () => this.loops.delete(fn);
  }

  /** A short remark in a speech bubble, read aloud. */
  say(who: Speaker, text: string, seconds = 3): void {
    this.bubbles[who].say(text, seconds * 1000);
    NarrationManager.getInstance().speakLine(text, who);
  }

  /** A full dialogue in the dialogue box; the speaker's mouth (or beak) moves. */
  async talk(script: DialogueScript): Promise<void> {
    this.ui.dialogue.onLine = (speaker) => (this.crew.speaker = speaker);
    await this.ui.say(script);
    this.ui.dialogue.onLine = null;
    this.crew.speaker = null;
  }

  /** Bob the float down (positive) or up (negative) on a spring. */
  twitch(amount: number): void {
    this.dipVel += amount * 9;
  }

  splash(at: THREE.Vector3, power: number): void {
    this.world.fx.splash(at, power);
    this.world.startle(at.x, at.z);
  }

  /** The fish material for a kind (gold and rainbow shine more). */
  look(kind: FishKind): FishLook {
    const l = this.world.looks;
    return kind === "gold" ? l.gold : kind === "rainbow" ? l.rainbow : l.plain;
  }

  /** Remember a catch size; returns true if it beats every earlier fish. */
  record(cm: number): boolean {
    const before = Math.max(this.best, this.biggest);
    this.biggest = Math.max(this.biggest, cm);
    if (cm > this.best) {
      try {
        localStorage.setItem(BEST_KEY, String(cm));
      } catch {
        // Reason: storage may be blocked; the record still counts for this session
      }
    }
    return before > 0 && cm > before;
  }

  setStatus(fresh: boolean): void {
    this.ui.status(this.hud.pill(this.caught as IconKey[], GOAL, fresh));
  }

  // ── Frame ──────────────────────────────────────────────────

  update(dt: number, time: number): void {
    this.time = time;
    this.input(dt);
    this.runTimers(dt);
    this.world.update(dt, time);
    this.placeBobber(dt, time);
    this.tackle.update(time);
    this.bucket.update(dt, time, (at) =>
      this.world.fx.drops.emit(at, { count: 5, color: "#e8fbff", speed: [0.4, 1.2], up: 1.6, life: [0.4, 0.7], size: [0.05, 0.1], gravity: 9 }),
    );
    this.goldenSparkles(dt);
    if (this.camMode === "play") this.followAim();
    this.cam.update(dt, time);
    this.overlays();
  }

  private input(dt: number): void {
    const engine = this.engine;
    if (!engine) return;
    const input = engine.input;
    this.earlyCooldown = Math.max(0, this.earlyCooldown - dt);
    if (this.phase === "bite") this.windowLeft -= dt;
    if (this.ui.dialogue.isOpen || engine.isSwitching) return;
    if (this.phase === "aim") {
      const a = input.axis();
      this.aim.x = THREE.MathUtils.clamp(this.aim.x + a.x * AIM_SPEED * dt, AIM.x0, AIM.x1);
      this.aim.z = THREE.MathUtils.clamp(this.aim.z + a.y * AIM_SPEED * dt, AIM.z0, AIM.z1);
      if (input.consume("Space")) this.castPressed = true;
    } else if (this.phase === "bite") {
      if (input.consume("Space")) this.struck = true;
    } else if ((this.phase === "wait" || this.phase === "nibble") && input.consume("Space") && this.earlyCooldown <= 0) {
      this.say("Fischer Jonas", SAY.tooEarly, 2.6);
      this.earlyCooldown = 6;
    }
  }

  private runTimers(dt: number): void {
    const active = this.tweens;
    this.tweens = [];
    for (const tw of active) {
      tw.t = Math.min(tw.t + dt, tw.dur);
      tw.fn(tw.t / tw.dur, dt);
      if (tw.t >= tw.dur) tw.done();
      else this.tweens.push(tw);
    }
    this.waiters = this.waiters.filter((w) => {
      w.left -= dt;
      if (!w.pred() && w.left > 0) return true;
      w.resolve();
      return false;
    });
    for (const fn of this.loops) fn(dt, this.time);
  }

  private placeBobber(dt: number, time: number): void {
    const t = this.tackle;
    const b = t.bobber.position;
    t.bobber.rotation.set(0, 0, 0);
    switch (this.bobberMode) {
      case "rod":
        t.tipWorld(b);
        b.x += Math.sin(time * 2.1) * 0.04;
        b.y -= 0.45;
        b.z += Math.cos(time * 1.7) * 0.03;
        t.slack = 0.05;
        break;
      case "fly":
      case "carried":
        b.copy(this.carry);
        t.slack = this.bobberMode === "fly" ? 0.15 : 0;
        break;
      case "float": {
        // Reason: a damped spring makes nibbles look like real little tugs on the float
        this.dipVel += (-this.dip * 70 - this.dipVel * 7) * dt;
        this.dip += this.dipVel * dt;
        b.set(this.spot.x, swell(this.spot.x, this.spot.z, time) + 0.02 - this.dip, this.spot.z);
        t.bobber.rotation.set(Math.sin(time * 1.7) * 0.08 + this.dipVel * 0.02, 0, Math.sin(time * 1.3) * 0.08);
        t.slack = 0.55;
        break;
      }
      case "under":
        b.set(this.spot.x + Math.sin(time * 17) * 0.06, -0.3 + Math.sin(time * 11) * 0.05, this.spot.z + Math.cos(time * 13) * 0.06);
        t.bobber.rotation.set(Math.sin(time * 19) * 0.35, 0, Math.cos(time * 15) * 0.35);
        t.slack = 0;
        break;
    }
    t.hookVisible = this.bobberMode !== "rod" && this.bobberMode !== "fly";
    t.lineEnd.copy(b).add(this.tmp.set(0, 0.06, 0));
    const looking = this.bobberMode === "rod" ? this.aim : b;
    this.crew.lookAt.lerp(looking, 1 - Math.exp(-dt * 4));
    if (this.biter && (this.phase === "wait" || this.phase === "nibble" || this.phase === "bite")) {
      this.biter.setHook(this.tmp.set(b.x, b.y + HOOK_Y, b.z));
    }
    this.tackle.marker.position.set(this.aim.x, 0.03 + swell(this.aim.x, this.aim.z, time), this.aim.z);
  }

  /** The play shot leans a little towards wherever Tadeo is aiming. */
  private followAim(): void {
    const s = SHOTS.play;
    const lean = this.tmp2.set(this.aim.x * 0.14, 0, 0);
    this.cam.set({ pos: s.pos.clone().add(lean), look: s.look.clone().add(this.tmp.set(this.aim.x * 0.3, 0, (this.aim.z - s.look.z) * 0.25)) }, 1.4);
  }

  /** The golden fish leaves a glittering trail. */
  private goldenSparkles(dt: number): void {
    const g = this.world.golden;
    if (g.state === "away" || !g.root.visible) return;
    this.trail -= dt;
    if (this.trail > 0) return;
    this.trail = 0.06;
    this.world.fx.sparks.emit(g.root.position, { count: 2, color: new THREE.Color(2.4, 1.9, 0.6), speed: [0.1, 0.4], up: 0.25, life: [0.5, 1.0], size: [0.05, 0.11], spread: 0.3 });
  }

  /** Speech bubbles, the "!" alert, the strike prompt and the controls hint. */
  private overlays(): void {
    const crew = this.crew;
    const head = (h: { head: THREE.Object3D }) => toScreen(this.camera, h.head.getWorldPosition(this.tmp).add(this.tmp2.set(0, 0.62, 0)));
    this.bubbles.Tadeo.place(head(crew.tadeo));
    this.bubbles["Fischer Jonas"].place(head(crew.jonas));
    this.bubbles.Henni.place(toScreen(this.camera, crew.henni.root.getWorldPosition(this.tmp).add(this.tmp2.set(0, 0.75, 0))));
    if (!this.ui.dialogue.isOpen) {
      const who = (Object.keys(this.bubbles) as Speaker[]).find((k) => this.bubbles[k].showing);
      crew.speaker = who ?? null;
    }
    const biting = this.phase === "bite";
    const bob = biting ? toScreen(this.camera, this.tmp.copy(this.tackle.bobber.position).setY(0.2)) : null;
    this.hud.showAlert(bob);
    this.ui.prompt.show(bob ? { x: bob.x, y: bob.y + 92 } : null, "Ziehen!");
    const key = (k: string) => `<span class="key">${k}</span>`;
    this.hud.showHint(this.phase === "aim" && !this.ui.dialogue.isOpen ? `${key("← ↑ → ↓")} zielen ${key("Leertaste")} auswerfen` : null);
  }

  /** Read-only snapshot for the E2E test (it plays with real key presses). */
  get state(): object {
    const b = this.tackle.bobber.position;
    return {
      game: "fishing",
      phase: this.phase,
      caught: this.caught.length,
      kinds: [...this.caught],
      goal: GOAL,
      aim: [this.aim.x, this.aim.z],
      bobber: [b.x, b.y, b.z],
      casts: this.casts,
      bites: this.bites,
      misses: this.misses,
      windowLeft: this.windowLeft,
      bottleDone: this.bottleDone,
      goldenArrived: this.goldenArrived,
      biter: this.biter?.kind ?? null,
      card: this.hud.cardShowing,
      biggest: this.biggest,
      fish: this.world.swimming.map((f) => ({ kind: f.kind, x: f.pos.x, z: f.pos.z, state: f.state })),
    };
  }

  dispose(): void {
    this.ui.prompt.show(null);
    this.hud.dispose();
    for (const b of Object.values(this.bubbles)) b.dispose();
    this.bottle?.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
    this.world.dispose();
  }
}
