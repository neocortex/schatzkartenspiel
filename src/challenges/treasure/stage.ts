/**
 * TreasureStage — the 3D treasure island and its toolbox for the script:
 * island, lagoon, sky, props, critters, the frozen chest, the volcano on the
 * horizon, Tadeo, the camera director and all particle effects, plus awaitable
 * helpers (sleep, wait for a key press, wait until Tadeo reaches the X, framed
 * dialogue) so the steps in `script.ts` read like a little play.
 */

import * as THREE from "three";
import { Engine } from "../../core/Engine";
import { GameUI } from "../../ui/GameUI";
import { DIALOGUES, DialogueScript } from "../../data/dialogues";
import { SmokeSystem } from "../../world/ambient/Smoke";
import { WorldUniforms } from "../../world/Terrain";
import { Director, Shot, shot } from "../shared/director";
import { Particles, createConfetti, confettiBurst } from "../shared/particles";
import { Owned } from "../shared/dispose";
import { Ground, X_AT } from "./terrain";
import { createLagoon } from "./water";
import { Daylight } from "./daylight";
import { Scenery, BLOCKERS, LANDING } from "./scenery";
import { XMark } from "./xmark";
import { Critters } from "./critters";
import { TreasureChest } from "./chest";
import { Eruption } from "./eruption";
import { TadeoRig } from "./tadeo";
import { TreasureHud } from "./hud";
import { Fireworks, createSand, createShards, createCoins, createGems, createSparkles } from "./fx";

export interface TreasureState {
  phase: "arrive" | "walk" | "dig" | "reveal" | "hammer" | "key" | "open" | "erupt" | "done";
  tadeo: { x: number; z: number };
  target: { x: number; z: number };
  digs: number;
  digsNeeded: number;
  /** Ice left on the chest (1 = intact, 0 = shattered). */
  ice: number;
  hits: number;
  perfectHits: number;
  /** Timing-meter needle (0..1) and its golden zone. */
  meter: number;
  zone: [number, number];
  turns: number;
  /** What has come out of the chest so far, in the order it comes. */
  note: boolean;
  heart: boolean;
  plan: boolean;
  gold: boolean;
  crowned: boolean;
  /** The volcano on the horizon has blown. */
  erupting: boolean;
}

/** Where the chest sits (on the X, on the flat dig site). */
export const CHEST_AT = new THREE.Vector3(X_AT.x, 0.55, X_AT.y);

/** A slice of a dialogue from the game's dialogue data. */
export const lines = (name: string, from = 0, to?: number): DialogueScript => (DIALOGUES[name] ?? []).slice(from, to);

export const ease = (k: number) => 1 - (1 - k) ** 3;

interface Timer {
  left: number;
  resolve: () => void;
}

interface Tween {
  t: number;
  d: number;
  fn: (k: number) => void;
  resolve: () => void;
}

const METER_PERIOD = 1.5;

export class TreasureStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2600);
  readonly owned = new Owned();
  readonly director: Director;
  readonly world: WorldUniforms;
  readonly daylight: Daylight;
  readonly ground: Ground;
  readonly xmark: XMark;
  readonly critters: Critters;
  readonly chest: TreasureChest;
  readonly eruption: Eruption;
  readonly tadeo: TadeoRig;
  readonly hud: TreasureHud;
  readonly sand: Particles;
  readonly shards: Particles;
  readonly coins: Particles;
  readonly gems: Particles;
  readonly sparkles: Particles;
  readonly confetti: Particles;
  readonly fireworks: Fireworks;
  readonly shock: THREE.Mesh;
  readonly state: TreasureState = {
    phase: "arrive",
    tadeo: { x: 0, z: 0 },
    target: { x: X_AT.x, z: X_AT.y },
    digs: 0,
    digsNeeded: 12,
    ice: 1,
    hits: 0,
    perfectHits: 0,
    meter: 0,
    zone: [0.72, 0.98],
    turns: 0,
    note: false,
    heart: false,
    plan: false,
    gold: false,
    crowned: false,
    erupting: false,
  };
  engine!: Engine;
  /** Arrow keys move Tadeo while true. */
  steering = false;
  /** While set, the chest blocks walking (radius around the X). */
  chestSolid = false;
  /** Prompt bubble ("Leertaste …") anchored above a world point, or null. */
  prompt: { at: THREE.Vector3; verb: string } | null = null;
  /** Run the hammer timing meter. */
  meterOn = false;
  /** Hole depth and sand-pile height the ground eases towards. */
  readonly dig = { hole: 0, pile: 0 };
  disposed = false;
  private smoke: SmokeSystem;
  private timers: Timer[] = [];
  private waiter: { keys: readonly string[]; resolve: (k: string) => void } | null = null;
  private arrival: { radius: number; resolve: () => void } | null = null;
  private tweens: Tween[] = [];
  private shockT = 9;
  private meterT = 0;
  private meterFlash = 0;
  time = 0;
  private tmp = new THREE.Vector3();

  constructor(readonly ui: GameUI) {
    this.daylight = new Daylight(this.owned, CHEST_AT);
    this.scene.fog = this.daylight.fog;
    this.world = {
      uTime: { value: 0 },
      // Reason: the shared landmark/smoke materials only read uTime; the terrain textures are unused here
      uHeightTex: { value: this.owned.add(new THREE.Texture()) },
      uMaskTex: { value: this.owned.add(new THREE.Texture()) },
      uRegionTex: { value: this.owned.add(new THREE.Texture()) },
      uSunDir: { value: this.daylight.sunDir },
    };
    this.director = new Director(this.camera);
    this.smoke = new SmokeSystem(this.world);
    this.ground = new Ground(this.owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    const lagoon = createLagoon({ uTime: this.world.uTime, uSunDir: { value: this.daylight.sunDir }, uSky: { value: this.daylight.waterSky }, uSunColor: { value: this.daylight.glint }, uTint: { value: this.daylight.waterTint } });
    const scenery = new Scenery(this.ground, this.world, this.owned);
    this.xmark = new XMark(this.ground, this.owned);
    this.critters = new Critters(this.ground);
    this.chest = new TreasureChest(this.owned);
    this.chest.group.position.copy(CHEST_AT);
    this.chest.group.visible = false;
    this.eruption = new Eruption(this.smoke, this.owned);

    this.tadeo = new TadeoRig(LANDING.x, LANDING.y, Math.PI * 0.85);
    this.tadeo.actor.ground = (x, z) => this.ground.heightAt(x, z);
    this.tadeo.actor.canStand = (x, z) => this.canStand(x, z);
    this.tadeo.actor.addTo(this.scene);
    this.hud = new TreasureHud(ui);

    const floor = (x: number, z: number) => this.ground.heightAt(x, z);
    this.sand = createSand(floor, this.owned);
    this.shards = createShards(floor, this.owned);
    this.coins = createCoins(floor, this.owned);
    this.gems = createGems(floor, this.owned);
    this.sparkles = createSparkles(this.owned);
    this.confetti = createConfetti(1000, floor);
    this.owned.add(this.confetti.mesh.material as THREE.Material);
    this.fireworks = new Fireworks(this.owned);
    this.shock = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.85, 40).rotateX(-Math.PI / 2),
      this.owned.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.2, 2.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    this.shock.position.copy(CHEST_AT).setY(CHEST_AT.y + 0.06);

    this.scene.add(
      this.daylight.group, this.ground.mesh, lagoon, scenery.group, this.xmark.group, this.critters.group, this.chest.group, this.eruption.group, this.smoke.group,
      this.sand.mesh, this.shards.mesh, this.coins.mesh, this.gems.mesh, this.sparkles.mesh, this.confetti.mesh, this.fireworks.sparks.mesh, this.shock,
    );
    this.director.cut(shot(30, 18, 40, 0, 1, -3));
    this.syncState();
  }

  private canStand(x: number, z: number): boolean {
    if (this.ground.heightAt(x, z) < 0.04) return false;
    if (this.chestSolid && Math.hypot(x - CHEST_AT.x, z - CHEST_AT.z) < 1.35) return false;
    return BLOCKERS.every(([bx, bz, r]) => Math.hypot(x - bx, z - bz) > r);
  }

  // ── Awaitable helpers ─────────────────────────────────────

  sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => this.timers.push({ left: seconds, resolve }));
  }

  /** Call `fn(k)` every frame with k going 0 → 1 over `seconds`. */
  tween(seconds: number, fn: (k: number) => void): Promise<void> {
    return new Promise((resolve) => this.tweens.push({ t: 0, d: Math.max(seconds, 0.001), fn, resolve }));
  }

  /** Briefly light up the meter needle (it was just used). */
  flashMeter(): void {
    this.meterFlash = 0.25;
  }

  /** Resolve with the next pressed key out of `keys` (ignored while a dialogue is open). */
  nextKey(keys: readonly string[]): Promise<string> {
    return new Promise((resolve) => (this.waiter = { keys, resolve }));
  }

  /** Resolve once Tadeo (steered by the player) is within `radius` of the X. */
  reachX(radius: number): Promise<void> {
    return new Promise((resolve) => (this.arrival = { radius, resolve }));
  }

  /** Play a dialogue; Tadeo gets the talking pose when he speaks; optionally hold a camera shot. */
  async say(script: string | DialogueScript, framing: Shot | null = null): Promise<void> {
    if (framing) void this.director.move(framing, 1.0);
    const av = this.tadeo.avatar;
    this.ui.dialogue.onLine = (speaker) => {
      if (av.pose === "normal" || av.pose === "talk") av.pose = speaker === "Tadeo" ? "talk" : "normal";
    };
    await this.ui.say(script);
    this.ui.dialogue.onLine = null;
    if (av.pose === "talk") av.pose = "normal";
  }

  /** Medium shot of Tadeo from the front, framed above the dialogue box. */
  tadeoShot(side = 1.4, dist = 4.4): Shot {
    const p = this.tadeo.actor.position;
    const f = this.tadeo.actor.facing;
    const fwd = new THREE.Vector3(Math.sin(f), 0, Math.cos(f));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    return {
      pos: p.clone().addScaledVector(fwd, dist).addScaledVector(right, side).add(new THREE.Vector3(0, 1.9, 0)),
      look: p.clone().addScaledVector(right, side * 0.2).add(new THREE.Vector3(0, 0.95, 0)),
    };
  }

  // ── Effects ───────────────────────────────────────────────

  sparkleAt(at: THREE.Vector3, count: number, color: THREE.ColorRepresentation, speed = 3, size = 1): void {
    const c = new THREE.Color(color).multiplyScalar(3);
    this.sparkles.emit(count, (p) => {
      p.pos.copy(at);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      p.color.copy(c);
      p.life = 0.7 + Math.random() * 0.9;
      p.size = (0.6 + Math.random() * 0.9) * size;
    });
  }

  /** Sand thrown from `from` towards `to` in an arc (one shovelful). */
  throwSand(from: THREE.Vector3, to: THREE.Vector3, count: number): void {
    const flight = 0.55;
    this.sand.emit(count, (p) => {
      p.pos.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3));
      const target = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9));
      // Ballistic velocity that lands near the target after `flight` seconds (gravity 13)
      p.vel.set((target.x - p.pos.x) / flight, (target.y - p.pos.y) / flight + 0.5 * 13 * flight, (target.z - p.pos.z) / flight);
      p.vel.multiplyScalar(0.85 + Math.random() * 0.3);
      p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      p.color.set(Math.random() < 0.5 ? "#e9d3a0" : "#d4b67e");
      p.life = 1.2 + Math.random() * 1.2;
      p.size = 0.6 + Math.random() * 0.9;
    });
  }

  /** Ice shards flying off the block from `at` (outward, away from the chest centre). */
  burstShards(at: THREE.Vector3, count: number, power: number): void {
    this.shards.emit(count, (p) => {
      p.pos.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6));
      const out = p.pos.clone().sub(CHEST_AT).setY(0).normalize();
      p.vel.copy(out).multiplyScalar((2 + Math.random() * 3) * power).add(new THREE.Vector3((Math.random() - 0.5) * 2, (3 + Math.random() * 4) * power, (Math.random() - 0.5) * 2));
      p.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      p.life = 2.5 + Math.random() * 2.5;
      p.size = 0.6 + Math.random() * 1.2;
    });
  }

  shockwave(): void {
    this.shockT = 0;
  }

  /** Confetti cannons on both sides of the chest. */
  confettiCannons(strength = 1): void {
    for (const sx of [-1, 1]) {
      confettiBurst(this.confetti, new THREE.Vector3(sx * 4.2, 0.9, 1.2), new THREE.Vector3(-sx * 0.45, 1, 0.1), Math.round(170 * strength), 11);
    }
  }

  // ── Frame ─────────────────────────────────────────────────

  update(dt: number, time: number): void {
    this.time = time;
    this.world.uTime.value = time;
    const input = this.engine?.input ?? null;
    const talking = this.ui.dialogue.isOpen;
    const live = !!input && !talking && !this.engine.isSwitching;
    if (this.waiter && live) {
      for (const k of this.waiter.keys) {
        if (input!.consume(k)) {
          const w = this.waiter;
          this.waiter = null;
          w.resolve(k);
          break;
        }
      }
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.left -= dt;
      if (t.left <= 0) {
        this.timers.splice(i, 1);
        t.resolve();
      }
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(tw.t / tw.d, 1);
      tw.fn(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.resolve();
      }
    }
    this.updateDig(dt);
    this.updateMeter(dt, talking);

    this.tadeo.steer(input, dt, this.steering && live);
    this.tadeo.update(dt);
    const tp = this.tadeo.actor.position;
    if (this.arrival && Math.hypot(tp.x - X_AT.x, tp.z - X_AT.y) < this.arrival.radius) {
      const a = this.arrival;
      this.arrival = null;
      a.resolve();
    }

    this.daylight.update(dt);
    this.xmark.update(dt);
    if (this.xmark.beacon.visible && Math.random() < dt * 14) {
      // Golden glitter rising from the X so it calls for attention
      this.sparkles.emit(1, (p) => {
        p.pos.set(X_AT.x + (Math.random() - 0.5) * 1.6, CHEST_AT.y + 0.05, X_AT.y + (Math.random() - 0.5) * 1.6);
        p.vel.set(0, 0.9 + Math.random() * 0.8, 0);
        p.color.setRGB(3, 2.3, 0.8);
        p.life = 1.2 + Math.random();
        p.size = 0.8 + Math.random() * 0.6;
      });
    }
    this.critters.update(dt, time, tp);
    this.chest.update(dt, time);
    this.eruption.update(dt, time, this.camera);
    this.sand.update(dt, this.camera, time);
    this.shards.update(dt, this.camera, time);
    this.coins.update(dt, this.camera, time);
    this.gems.update(dt, this.camera, time);
    this.sparkles.update(dt, this.camera, time);
    this.confetti.update(dt, this.camera, time);
    this.fireworks.update(dt, this.camera, time);
    this.shockT += dt;
    const k = Math.min(this.shockT / 0.4, 1);
    this.shock.scale.setScalar(1 + k * 2.6);
    (this.shock.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
    this.director.update(dt);
    this.updatePrompt(talking);
    this.syncState();
  }

  private updateDig(dt: number): void {
    const g = this.ground;
    if (Math.abs(g.holeDepth - this.dig.hole) < 1e-3 && Math.abs(g.pile - this.dig.pile) < 1e-3) return;
    const k = 1 - Math.exp(-dt * 9);
    g.holeDepth += (this.dig.hole - g.holeDepth) * k;
    g.pile += (this.dig.pile - g.pile) * k;
    g.refresh();
    this.xmark.refresh();
  }

  private updateMeter(dt: number, talking: boolean): void {
    if (!this.meterOn) return;
    // Reason: a sine sweep lingers at the ends, so the golden zone at the right end is easy to catch
    if (!talking) this.meterT += dt;
    this.meterFlash = Math.max(0, this.meterFlash - dt);
    this.state.meter = 0.5 - 0.5 * Math.cos((this.meterT / METER_PERIOD) * Math.PI * 2);
    this.hud.needle(this.state.meter, this.meterFlash > 0);
  }

  private updatePrompt(talking: boolean): void {
    if (!this.prompt || talking) {
      this.ui.prompt.show(null);
      return;
    }
    const v = this.tmp.copy(this.prompt.at).project(this.camera);
    this.ui.prompt.show({ x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight }, this.prompt.verb);
  }

  private syncState(): void {
    const p = this.tadeo.actor.position;
    this.state.tadeo.x = p.x;
    this.state.tadeo.z = p.z;
  }

  dispose(): void {
    this.disposed = true;
    this.ui.dialogue.onLine = null;
    this.hud.dispose();
    this.owned.disposeScene(this.scene);
  }
}
