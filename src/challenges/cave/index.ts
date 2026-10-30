/**
 * Cave challenge (quest 4): the crystal cave. Tadeo explores a dark cave by
 * torchlight and opens three doors with levers: one lever for the first
 * gate, two hidden in side alcoves for the second, and three coloured levers
 * pulled in the order shown on the secret wall. Behind it the magic sword
 * waits on an altar in a shaft of light. Mistakes only reset the levers.
 */

import * as THREE from "three";
import { Engine, PostSettings } from "../../core/Engine";
import { CameraRig } from "../../core/CameraRig";
import { Player, WalkableWorld } from "../../characters/Player";
import { audio } from "../../audio/Audio";
import { DIALOGUES, DialogueScript } from "../../data/dialogues";
import { GameUI } from "../../ui/GameUI";
import { xrayUniforms } from "../../world/xray";
import { Challenge, ChallengeContext, ChallengeFactory } from "../types";
import { CaveWorld } from "./world";
import { CELL, COLS, LEVERS, ROOMS, ROWS, START_CELL, TILE_ROWS, cellPos, inRoom } from "./layout";
import { SpeechBubble, toNdc, toScreen } from "../shared/speech";
import { Torch } from "./torch";
import { glowTexture } from "../../world/ambient/textures";
import { HINTS, LINES } from "./script";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REACH = 1.9;
/** Seconds without progress before the compass arrow starts pointing the way. */
const HINT_AFTER = 22;

type Phase = "intro" | "gate1" | "gate2" | "runes" | "chamber" | "done";

class CaveChallenge implements Challenge {
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.3, 140);
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 1.25,
    bloomThreshold: 0.72,
    tiltShift: true,
    tiltFocus: 0.95,
    saturation: 0.12,
    contrast: 0.1,
    vignette: 0.8,
    exposure: 1.12,
  };
  readonly finished: Promise<void>;
  private resolveFinished!: () => void;
  private engine!: Engine;
  private ui: GameUI;
  private world = new CaveWorld();
  private player: Player;
  private rig: CameraRig;
  private torch: Torch;
  private bubble: SpeechBubble;
  private phase: Phase = "intro";
  private busy = true;
  private holdingTorch = true;
  /** Rune hall: lever indices in the order the wall asks for, and how far along we are. */
  readonly order: number[];
  private orderStep = 0;
  private idle = 0;
  private told = new Set<string>();
  private tmp = new THREE.Vector3();
  private islandXray = 1.15;

  constructor(ctx: ChallengeContext) {
    this.ui = ctx.ui;
    this.scene = this.world.scene;
    this.finished = new Promise((r) => (this.resolveFinished = r));
    const w = this.world;
    const exitZ = cellPos(8, 19.55)[1];
    const walk: WalkableWorld = {
      groundHeight: (x, z) => w.field.heightAt(x, z),
      canStand: (x, z) => w.field.openAt(x, z) > 0.42 && w.field.waterAt(x, z) < -0.15 && z < exitZ && !w.blocked(x, z),
      colliders: w.colliders,
    };
    this.player = new Player(walk);
    this.player.addTo(this.scene);
    const [sx, sz] = cellPos(...START_CELL);
    this.player.teleport(sx, sz, 0.35);
    this.torch = new Torch(this.player.avatar, glowTexture(), w.sparks, w.owned);
    this.scene.add(this.torch.light);

    this.rig = new CameraRig(this.camera, (x, z) => w.field.heightAt(x, z));
    this.rig.offset.set(0, 10.2, 6.9);
    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.snap();
    this.bubble = new SpeechBubble(this.ui.layer);

    // Rune hall order (lever indices 3, 4, 5): any order except plain left-to-right
    const orders = [[4, 3, 5], [5, 3, 4], [3, 5, 4], [4, 5, 3], [5, 4, 3]];
    this.order = orders[Math.floor(Math.random() * orders.length)];
    this.world.wall.showOrder(this.order.map((i) => new THREE.Color(LEVERS[i].color)));
  }

  enter(engine: Engine): void {
    this.engine = engine;
    // Reason: the cave walls are bulky, so cut a wider see-through hole around Tadeo (restored on exit)
    this.islandXray = xrayUniforms.uXrayRadius.value;
    xrayUniforms.uXrayRadius.value = 1.6;
    audio.playMusic("music_dungeon");
    this.update(0, 0);
    void this.intro();
  }

  // ── Flow ─────────────────────────────────────────────────────

  private async intro(): Promise<void> {
    const gate = this.world.gates[0].group.position;
    const p = this.player.position;
    this.rig.jumpToShot({ pos: new THREE.Vector3(gate.x + 5, 13, gate.z + 9), look: new THREE.Vector3(gate.x, 1, gate.z + 2) });
    this.rig.setShot({ pos: new THREE.Vector3(p.x + 3, 7, p.z + 7), look: new THREE.Vector3(p.x, 1.2, p.z - 3) }, 3.2);
    await wait(600);
    await this.ui.hud.showBanner("Kapitel 5", "Die Kristallhöhle", 2400);
    await this.talk("cave_enter");
    await this.talk(LINES.firstGate);
    this.rig.setShot(null, 1.2);
    this.phase = "gate1";
    this.updateStatus();
    this.busy = false;
  }

  /** Play a dialogue; Tadeo gestures while he speaks unless `keepPose` (holding the sword up). */
  private async talk(script: string | DialogueScript, keepPose = false): Promise<void> {
    this.rig.setZoom(0.78);
    if (!keepPose) this.ui.dialogue.onLine = (speaker) => (this.player.avatar.pose = speaker === "Tadeo" ? "talk" : "normal");
    await this.ui.say(script);
    this.ui.dialogue.onLine = null;
    if (!keepPose) this.player.avatar.pose = "normal";
    this.rig.setZoom(1);
  }

  private updateStatus(): void {
    const open = this.world.gates.filter((g) => g.open).length + (this.world.wall.open ? 1 : 0);
    this.ui.status(`🔓 Tore offen: ${open} / 3`);
  }

  private pullLever(i: number): void {
    const w = this.world;
    const lever = w.levers[i];
    const spec = LEVERS[i];
    lever.pull();
    this.idle = 0;
    audio.playSfx("sfx_key_unlock", 0.9);
    this.rig.addShake(0.25);
    w.sparks.emit(lever.knobPosition(this.tmp), {
      count: 26,
      color: new THREE.Color(spec.color).multiplyScalar(2.6),
      speed: [1.5, 4],
      up: 1.5,
      life: [0.4, 0.9],
      size: [0.08, 0.16],
      gravity: 6,
    });
    if (spec.gate === 2) {
      this.runeHallPull(i);
      return;
    }
    const gate = w.gates[spec.gate];
    const gem = LEVERS.filter((l) => l.gate === spec.gate).indexOf(spec);
    w.trails[i].onArrive = () => {
      gate.light(gem);
      audio.playSfx("sfx_simon_correct", 0.7);
      const all = LEVERS.every((l, k) => l.gate !== spec.gate || w.levers[k].pulled);
      if (all) void this.openGate(spec.gate);
      else this.bubble.say(LINES.oneMore, 2600, true);
    };
    w.trails[i].ignite();
  }

  private runeHallPull(i: number): void {
    const w = this.world;
    if (this.order[this.orderStep] === i) {
      this.orderStep++;
      w.wall.setProgress(this.orderStep);
      w.trails[i].ignite();
      audio.playSfx("sfx_simon_correct", 0.8, 0.9 + this.orderStep * 0.1);
      if (this.orderStep === 3) void this.openSecretWall();
      return;
    }
    // Wrong lever: blink red, then gently put every lever back
    audio.playSfx("sfx_simon_wrong", 0.8);
    w.wall.flashWrong();
    this.orderStep = 0;
    this.bubble.say(HINTS[Math.floor(Math.random() * HINTS.length)], 3200, true);
    this.busy = true;
    void wait(900).then(() => {
      for (const k of [3, 4, 5]) {
        w.levers[k].reset();
        w.trails[k].extinguish();
      }
      audio.playSfx("sfx_door", 0.35, 1.6);
      this.busy = false;
    });
  }

  /** Cut to the gate, let it rumble into the floor, then hand the camera back. */
  private async openGate(g: number): Promise<void> {
    this.busy = true;
    const gate = this.world.gates[g];
    const at = gate.group.position;
    await wait(300);
    this.rig.setShot({ pos: new THREE.Vector3(at.x + 1.5, 6.5, at.z + 8.5), look: new THREE.Vector3(at.x, 1.4, at.z) }, 0.9);
    await wait(950);
    gate.startOpening();
    audio.playSfx("sfx_door");
    audio.playSfx("sfx_lava_fall", 0.5, 0.6);
    await wait(2500);
    this.updateStatus();
    this.rig.setShot(null, 1);
    this.phase = g === 0 ? "gate2" : "runes";
    await wait(700);
    this.busy = false;
    this.bubble.say(g === 0 ? LINES.gate1Open : LINES.gate2Open, 3000, true);
  }

  private async openSecretWall(): Promise<void> {
    this.busy = true;
    const w = this.world;
    const at = w.wall.group.position;
    await wait(600);
    this.rig.setShot({ pos: new THREE.Vector3(at.x + 1, 7.5, at.z + 9.5), look: new THREE.Vector3(at.x, 1.6, at.z - 1.5) }, 1);
    await wait(1100);
    w.wall.startOpening();
    audio.playSfx("sfx_door");
    audio.playSfx("sfx_lava_fall", 0.6, 0.5);
    await wait(2900);
    audio.playSfx("sfx_special", 0.7);
    this.updateStatus();
    await wait(900);
    this.rig.setShot(null, 1.2);
    this.phase = "chamber";
    await wait(600);
    this.busy = false;
    this.bubble.say(LINES.wallOpen, 3000, true);
  }

  /** The sword wakes up, flies out of the altar and Tadeo holds it high. */
  private async finale(): Promise<void> {
    this.busy = true;
    this.phase = "done";
    this.ui.status(null);
    this.ui.prompt.show(null);
    this.ui.hud.updateCompass(null);
    const ch = this.world.chamber;
    const c = ch.center;
    const p = this.player.position;
    this.player.facing = Math.atan2(c.x - p.x, c.z - p.z);
    this.rig.setShot({ pos: new THREE.Vector3(c.x + 3.2, 3.6, c.z + 7.2), look: new THREE.Vector3(c.x, 1.3, c.z + 1) }, 1.4);
    await wait(1300);
    await this.talk(DIALOGUES.cave_sword.slice(0, 1));

    // Pull the sword free
    this.holdingTorch = false;
    this.torch.boost = 0.55;
    this.player.avatar.pose = "holdUp";
    this.scene.attach(ch.sword);
    this.world.swordFree = true;
    this.swordLift = 0;
    ch.flare(1);
    audio.playSfx("sfx_special");
    this.world.sparks.emit(ch.swordAt, { count: 70, color: new THREE.Color(1.2, 2.4, 3.2), speed: [2, 6], up: 1, life: [0.6, 1.4], size: [0.08, 0.2], gravity: 2 });
    this.player.facing = 0;
    this.rig.setShot({ pos: new THREE.Vector3(p.x + 1.4, p.y + 2.6, p.z + 4.6), look: new THREE.Vector3(p.x, p.y + 1.5, p.z) }, 1.2);
    await wait(900);
    await this.ui.itemGet("sword");
    await this.talk(DIALOGUES.cave_sword.slice(1), true);
    this.player.avatar.pose = "cheer";
    await wait(1200);
    this.resolveFinished();
  }

  private swordLift = -1;

  // ── Frame ────────────────────────────────────────────────────

  update(dt: number, time: number): void {
    if (!this.engine) return;
    const input = this.engine.input;
    const w = this.world;
    const free = !this.busy && !this.ui.dialogue.isOpen && !this.engine.isSwitching;
    this.player.controlsEnabled = free;

    const near = free ? this.nearestLever() : -1;
    if (free) {
      if (near >= 0 && input.consume("Space")) this.pullLever(near);
      else if (input.consume("Space")) this.player.jump();
    }
    this.player.update(dt, input, this.rig.yaw);
    this.torch.pose(this.holdingTorch);
    this.torch.update(dt, time);
    w.update(dt, time, this.player.position, this.torch.light.position);
    this.animateSword(dt, time);

    for (const g of [...w.gates, w.wall]) if (g.rumbling) this.rumble(g.group.position, dt);
    if (w.wall.open || w.wall.rumbling) w.chamber.setReveal(Math.min(1, w.chamber.spot.intensity / 260 + dt * 0.5));

    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.update(dt);
    xrayUniforms.uXrayTarget.value.copy(this.player.position).add(new THREE.Vector3(0, 0.9, 0));

    this.storyTriggers();
    this.hud(near, dt);
  }

  private nearestLever(): number {
    let best = -1;
    let bestD = REACH;
    this.world.levers.forEach((l, i) => {
      if (l.pulled) return;
      const d = Math.hypot(l.group.position.x - this.player.position.x, l.group.position.z - this.player.position.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private animateSword(dt: number, time: number): void {
    if (this.swordLift < 0) return;
    this.swordLift = Math.min(1, this.swordLift + dt * 1.6);
    const sword = this.world.chamber.sword;
    const above = this.tmp.copy(this.player.position).add(new THREE.Vector3(0, 2.05 + Math.sin(time * 3) * 0.04, 0.05));
    const k = 1 - (1 - this.swordLift) ** 3;
    sword.position.lerpVectors(this.world.chamber.swordAt, above, k);
    sword.rotation.set(0, time * 0.8 * k, Math.PI * (1 - k) * 0.5);
    if (Math.random() < dt * 14) {
      this.world.sparks.emit(sword.position.clone().add(new THREE.Vector3(0, 0.7, 0)), {
        count: 1,
        color: new THREE.Color(1.4, 2.6, 3.4),
        speed: [0.3, 0.9],
        life: [0.5, 0.9],
        size: [0.06, 0.12],
        spread: 0.8,
      });
    }
  }

  private rumble(at: THREE.Vector3, dt: number): void {
    this.rig.addShake(dt * 1.4);
    if (Math.random() < dt * 22) {
      this.world.dust.emit(new THREE.Vector3(at.x + (Math.random() - 0.5) * 3, 0.15, at.z + 0.6), {
        count: 2,
        color: "#8a7f96",
        speed: [0.3, 1.2],
        up: 0.6,
        life: [0.8, 1.5],
        size: [0.4, 0.8],
        grow: 2.2,
        drag: 2,
        flat: true,
      });
    }
  }

  /** First-time remarks when Tadeo walks into a new room, and the finale trigger. */
  private storyTriggers(): void {
    if (this.busy || this.ui.dialogue.isOpen) return;
    const p = this.player.position;
    const once = (key: string, run: () => void) => {
      if (this.told.has(key)) return;
      this.told.add(key);
      run();
    };
    if (this.phase === "gate2" && inRoom(p.x, p.z, ROOMS.grotto)) once("grotto", () => void this.scripted(LINES.grotto));
    if (this.phase === "runes" && inRoom(p.x, p.z, ROOMS.runeHall)) once("runes", () => void this.scripted(LINES.runeHall));
    if (this.phase === "chamber") {
      const c = this.world.chamber.center;
      if (Math.hypot(p.x - c.x, p.z - c.z) < 3.6) void this.finale();
    }
  }

  private async scripted(lines: DialogueScript): Promise<void> {
    this.busy = true;
    await this.talk(lines);
    this.busy = false;
  }

  private hud(near: number, dt: number): void {
    const ui = this.ui;
    if (near >= 0 && !this.busy) {
      const l = this.world.levers[near].group.position;
      ui.prompt.show(toScreen(this.camera, this.tmp.set(l.x, l.y + 2.3, l.z)), "Ziehen");
    } else {
      ui.prompt.show(null);
    }
    const head = this.tmp.copy(this.player.position).add(new THREE.Vector3(0, 2.4, 0));
    this.bubble.place(toScreen(this.camera, head));

    // Reason: only point the way when Tadeo has been searching for a while
    this.idle += this.busy ? 0 : dt;
    const target = this.idle > HINT_AFTER ? this.nextTarget() : null;
    ui.hud.updateCompass(target ? toNdc(this.camera, target) : null);
  }

  /** Where the next step of the puzzle is (for the hint arrow). */
  private nextTarget(): THREE.Vector3 | null {
    const w = this.world;
    const gate = this.phase === "gate1" ? 0 : this.phase === "gate2" ? 1 : this.phase === "runes" ? 2 : -1;
    if (gate < 0) return this.phase === "chamber" ? w.chamber.center : null;
    if (gate === 2) {
      const next = this.order[this.orderStep];
      return w.levers[next].group.position;
    }
    const i = LEVERS.findIndex((l, k) => l.gate === gate && !w.levers[k].pulled);
    return i >= 0 ? w.levers[i].group.position : null;
  }

  /** Read-only snapshot for the E2E test (it steers with real key presses). */
  get e2e(): object {
    const w = this.world;
    return {
      phase: this.phase,
      busy: this.busy,
      player: [this.player.position.x, this.player.position.z],
      levers: w.levers.map((l, i) => ({ x: l.group.position.x, z: l.group.position.z, pulled: l.pulled, gate: LEVERS[i].gate })),
      gates: [...w.gates.map((g) => g.open), w.wall.open],
      order: this.order,
      orderStep: this.orderStep,
      altar: [w.chamber.center.x, w.chamber.center.z],
      tiles: TILE_ROWS,
      cell: CELL,
      cols: COLS,
      rows: ROWS,
    };
  }

  exit(): void {
    this.ui.prompt.show(null);
    this.ui.hud.updateCompass(null);
    this.bubble.dispose();
    this.torch.light.dispose();
    this.world.dispose();
    xrayUniforms.uXrayTarget.value.set(1e5, 0, 1e5);
    xrayUniforms.uXrayRadius.value = this.islandXray;
  }
}

const factory: ChallengeFactory = (ctx) => new CaveChallenge(ctx);
export default factory;
