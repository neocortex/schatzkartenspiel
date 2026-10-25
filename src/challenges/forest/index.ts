/**
 * Forest challenge (quest 5): the enchanted forest. Tadeo collects five
 * glowing magic berries in a twilight glade full of fireflies, light shafts
 * and glowing mushrooms. Flocke the fox trots ahead and shows the way to the
 * next berry. Thorn bushes only bounce Tadeo back with an "Autsch!" — there
 * is nothing to lose. With all five berries he holds them up high.
 */

import * as THREE from "three";
import { Engine, PostSettings } from "../../core/Engine";
import { CameraRig } from "../../core/CameraRig";
import { Player, WalkableWorld } from "../../characters/Player";
import { audio } from "../../audio/Audio";
import { DIALOGUES, DialogueScript } from "../../data/dialogues";
import { GameUI } from "../../ui/GameUI";
import { createBerries } from "../../world/models/items";
import { xrayUniforms } from "../../world/xray";
import { Challenge, ChallengeContext, ChallengeFactory } from "../types";
import { SpeechBubble, toNdc, toScreen } from "../shared/speech";
import { Berry } from "./berries";
import { Fox } from "./fox";
import { BERRIES, FOX_START, MIN_X, MIN_Z, START, THORNS } from "./layout";
import { BERRY_LINES, FOX_LINES, MEET_FOX, OUCH_LINES, WADE_LINE } from "./script";
import { ForestWorld } from "./world";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PICK_RADIUS = 1.3;
/** Seconds without finding a berry before the compass arrow helps out. */
const HINT_AFTER = 25;

type Phase = "intro" | "hunt" | "done";

class ForestChallenge implements Challenge {
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(44, 1, 0.3, 140);
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 1.05,
    bloomThreshold: 0.78,
    tiltShift: true,
    tiltFocus: 1.0,
    saturation: 0.16,
    contrast: 0.08,
    vignette: 0.62,
    exposure: 1.08,
  };
  readonly finished: Promise<void>;
  private resolveFinished!: () => void;
  private engine!: Engine;
  private ui: GameUI;
  private world = new ForestWorld();
  private player: Player;
  private fox: Fox;
  private rig: CameraRig;
  private bubble: SpeechBubble;
  private foxBubble: SpeechBubble;
  private phase: Phase = "intro";
  private busy = true;
  private found = 0;
  /** Seconds left of the thorn bounce (no control) and of the short grace period after it. */
  private stun = 0;
  private grace = 0;
  private ouches = 0;
  private idle = 0;
  private told = new Set<string>();
  private reward: THREE.Group | null = null;
  private tmp = new THREE.Vector3();
  private islandXray = 1.15;

  constructor(ctx: ChallengeContext) {
    this.ui = ctx.ui;
    this.scene = this.world.scene;
    this.finished = new Promise((r) => (this.resolveFinished = r));
    const w = this.world;
    const walk: WalkableWorld = {
      groundHeight: (x, z) => w.field.groundAt(x, z),
      canStand: (x, z) => w.field.walkable(x, z),
      colliders: w.colliders,
    };
    this.player = new Player(walk);
    this.player.addTo(this.scene);
    this.player.teleport(START[0], START[1], Math.PI);

    this.fox = new Fox((x, z) => w.field.groundAt(x, z));
    this.fox.addTo(this.scene);
    this.fox.teleport(FOX_START[0], FOX_START[1], -2.4);

    this.rig = new CameraRig(this.camera, (x, z) => w.field.groundAt(x, z));
    this.rig.offset.set(0, 11.5, 7.6);
    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.snap();
    this.bubble = new SpeechBubble(this.ui.layer);
    this.foxBubble = new SpeechBubble(this.ui.layer);
  }

  enter(engine: Engine): void {
    this.engine = engine;
    this.islandXray = xrayUniforms.uXrayRadius.value;
    xrayUniforms.uXrayRadius.value = 1.4;
    audio.playMusic("music_village");
    this.update(0, 0);
    void this.intro();
  }

  // ── Flow ─────────────────────────────────────────────────────

  private async intro(): Promise<void> {
    const p = this.player.position;
    this.rig.jumpToShot({ pos: new THREE.Vector3(0, 24, 26), look: new THREE.Vector3(0, 0, -4) });
    this.rig.setShot({ pos: new THREE.Vector3(p.x + 2.5, 5.5, p.z + 7.5), look: new THREE.Vector3(p.x + 0.8, 1, p.z - 2) }, 3.4);
    await wait(700);
    await this.ui.hud.showBanner("Kapitel 5", "Der Zauberwald", 2400);
    await this.talk("forest_enter");
    this.fox.hop();
    audio.playSfx("sfx_special", 0.5, 1.4);
    this.foxPoof();
    await wait(500);
    await this.talk(MEET_FOX);
    this.rig.setShot(null, 1.2);
    this.phase = "hunt";
    this.updateStatus();
    this.busy = false;
    this.foxBubble.say(FOX_LINES.follow, 2200);
  }

  /** A puff of magic sparkles around the fox. */
  private foxPoof(): void {
    this.world.sparks.emit(this.fox.position.clone().add(new THREE.Vector3(0, 0.55, 0)), {
      count: 30,
      color: new THREE.Color(1.2, 2.2, 2.6),
      speed: [1, 3],
      up: 1,
      life: [0.5, 1],
      size: [0.06, 0.14],
      gravity: 2,
    });
  }

  /** Play a dialogue; Tadeo gestures while he speaks unless `keepPose` (holding the berries up). */
  private async talk(script: string | DialogueScript, keepPose = false): Promise<void> {
    this.rig.setZoom(0.8);
    if (!keepPose) this.ui.dialogue.onLine = (speaker) => (this.player.avatar.pose = speaker === "Tadeo" ? "talk" : "normal");
    await this.ui.say(script);
    this.ui.dialogue.onLine = null;
    if (!keepPose) this.player.avatar.pose = "normal";
    this.rig.setZoom(1);
  }

  private updateStatus(): void {
    this.ui.status(`🫐 ${this.found} / 5`);
  }

  private collect(i: number): void {
    const berry = this.world.berries[i];
    berry.collect();
    this.found++;
    this.idle = 0;
    this.updateStatus();
    audio.playSfx("sfx_berry_collect");
    this.rig.addShake(0.15);
    this.fox.hop();
    if (this.found < 5) {
      this.bubble.say(BERRY_LINES[this.found - 1], 2200, true);
      return;
    }
    void this.finale();
  }

  /** Bounce Tadeo back out of a thorn bush. */
  private ouch(i: number): void {
    const t = THORNS[i];
    const p = this.player.position;
    const away = this.tmp.set(p.x - t.x, 0, p.z - t.z).normalize();
    this.player.jump();
    this.player.velocity.set(away.x * 7.5, 0, away.z * 7.5);
    this.player.facing = Math.atan2(-away.x, -away.z);
    this.stun = 0.5;
    this.grace = 1.1;
    this.world.thorns.shake(i);
    this.bubble.say(OUCH_LINES[this.ouches % OUCH_LINES.length], 1500, true);
    if (this.ouches === 0) this.foxBubble.say(FOX_LINES.firstOuch, 2200);
    this.ouches++;
    audio.playSfx("sfx_hit_damage", 0.7);
    this.rig.addShake(0.3);
    this.world.leaves.emit(new THREE.Vector3(t.x + away.x * t.r * 0.6, 0.8, t.z + away.z * t.r * 0.6), {
      count: 14,
      color: "#c0508e",
      speed: [1, 2.6],
      up: 1.6,
      life: [0.6, 1.1],
      size: [0.1, 0.18],
      gravity: 4,
    });
    this.world.sparks.emit(p.clone().add(new THREE.Vector3(0, 1.9, 0)), {
      count: 8,
      color: new THREE.Color(2.6, 2.2, 0.6),
      speed: [1.2, 2],
      life: [0.35, 0.6],
      size: [0.08, 0.14],
      flat: true,
    });
  }

  /** All five berries: Tadeo holds them up high, the fox dances. */
  private async finale(): Promise<void> {
    this.busy = true;
    this.phase = "done";
    this.ui.status(null);
    this.ui.hud.updateCompass(null);
    await wait(900);
    const p = this.player.position;
    this.player.facing = 0;
    // Reason: Flocke is a magic fox — she pops up right beside Tadeo for the celebration
    const spot = this.besideTadeo();
    this.fox.teleport(spot.x, spot.z, -0.6);
    this.foxPoof();
    this.rig.setShot({ pos: new THREE.Vector3(p.x + 1.6, p.y + 2.8, p.z + 5), look: new THREE.Vector3(p.x, p.y + 1.4, p.z) }, 1.2);
    this.player.avatar.pose = "holdUp";
    const reward = createBerries();
    reward.scale.setScalar(1.6);
    this.scene.add(reward);
    this.reward = reward;
    audio.playSfx("sfx_special");
    this.world.sparks.emit(p.clone().add(new THREE.Vector3(0, 2.3, 0)), {
      count: 60,
      color: new THREE.Color(1.8, 0.9, 3.0),
      speed: [2, 5],
      up: 1,
      life: [0.6, 1.3],
      size: [0.08, 0.18],
      gravity: 2,
    });
    await wait(900);
    await this.ui.itemGet("berry");
    await this.talk(DIALOGUES.forest_complete, true);
    this.player.avatar.pose = "cheer";
    this.fox.hop();
    this.foxBubble.say(FOX_LINES.bye, 2400);
    await wait(1600);
    this.resolveFinished();
  }

  // ── Frame ────────────────────────────────────────────────────

  update(dt: number, time: number): void {
    if (!this.engine) return;
    const input = this.engine.input;
    const w = this.world;
    this.stun = Math.max(0, this.stun - dt);
    this.grace = Math.max(0, this.grace - dt);
    const free = !this.busy && !this.ui.dialogue.isOpen && !this.engine.isSwitching;
    this.player.controlsEnabled = free && this.stun <= 0;
    if (free && this.stun <= 0 && input.consume("Space")) this.player.jump();
    this.player.update(dt, input, this.rig.yaw);

    if (free) this.rules();
    // Reason: once all berries are found, the fox comes to sit at Tadeo's side for the celebration
    const goal = this.phase === "hunt" ? (this.nextBerry()?.at ?? null) : this.phase === "done" ? this.besideTadeo() : null;
    this.fox.update(dt, time, this.player.position, goal, w.nav, w.sparks);
    w.update(dt, time, this.player.position);
    if (this.reward) this.reward.position.copy(this.player.position).add(this.tmp.set(0, 1.72 + Math.sin(time * 3) * 0.04, 0.05));
    if (this.reward) this.reward.rotation.y = time * 0.9;

    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.update(dt);
    xrayUniforms.uXrayTarget.value.copy(this.player.position).add(this.tmp.set(0, 0.9, 0));
    this.hud(dt);
  }

  /** Berries, thorns and little first-time remarks. */
  private rules(): void {
    const p = this.player.position;
    const w = this.world;
    w.berries.forEach((b, i) => {
      if (!b.collected && Math.hypot(p.x - b.at.x, p.z - b.at.z) < PICK_RADIUS) this.collect(i);
    });
    if (this.grace <= 0 && this.player.grounded) {
      const t = w.thorns.touching(p.x, p.z);
      if (t >= 0) this.ouch(t);
    }
    const once = (key: string, run: () => void) => {
      if (this.told.has(key)) return;
      this.told.add(key);
      run();
    };
    if (this.player.wading && w.field.brookAt(p.x, p.z) > 0.5) once("wade", () => this.bubble.say(WADE_LINE, 2200, true));
    const hedge = w.berries[2];
    if (!hedge.collected && Math.hypot(p.x - hedge.at.x, p.z - hedge.at.z) < 4.2 && p.z > hedge.at.z) {
      once("hedge", () => this.foxBubble.say(FOX_LINES.hedge, 2600));
    }
  }

  private besideTadeo(): THREE.Vector3 {
    return new THREE.Vector3(this.player.position.x + 1.3, 0, this.player.position.z - 0.1);
  }

  /** The uncollected berry closest to Tadeo (the fox leads there). */
  private nextBerry(): Berry | null {
    const p = this.player.position;
    let best: Berry | null = null;
    let bestD = Infinity;
    for (const b of this.world.berries) {
      if (b.collected) continue;
      const d = Math.hypot(p.x - b.at.x, p.z - b.at.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  private hud(dt: number): void {
    const head = this.tmp.copy(this.player.position).add(new THREE.Vector3(0, 2.4, 0));
    this.bubble.place(toScreen(this.camera, head));
    const foxHead = this.tmp.copy(this.fox.position).add(new THREE.Vector3(0, 1.3, 0));
    this.foxBubble.place(toScreen(this.camera, foxHead));
    // Reason: only point the way when Tadeo has been searching for a while
    this.idle += this.busy ? 0 : dt;
    const target = this.idle > HINT_AFTER && this.phase === "hunt" ? this.nextBerry() : null;
    this.ui.hud.updateCompass(target ? toNdc(this.camera, target.at) : null);
  }

  /** Read-only snapshot for the E2E test (it steers with real key presses). */
  get e2e(): object {
    const w = this.world;
    return {
      phase: this.phase,
      busy: this.busy,
      found: this.found,
      ouches: this.ouches,
      player: [this.player.position.x, this.player.position.z],
      fox: [this.fox.position.x, this.fox.position.z, this.fox.mode],
      berries: w.berries.map((b, i) => ({ name: BERRIES[i].name, x: b.at.x, z: b.at.z, collected: b.collected })),
      thorns: THORNS,
    };
  }

  /** Walkability grid for the E2E test's own path finding (rows of '1' free / '0' blocked). */
  get e2eGrid(): object {
    const nav = this.world.nav;
    return { minX: MIN_X, minZ: MIN_Z, res: 0.5, nx: nav.nx, nz: nav.nz, rows: nav.rows() };
  }

  exit(): void {
    this.ui.hud.updateCompass(null);
    this.bubble.dispose();
    this.foxBubble.dispose();
    this.fox.dispose();
    this.world.dispose();
    xrayUniforms.uXrayTarget.value.set(1e5, 0, 1e5);
    xrayUniforms.uXrayRadius.value = this.islandXray;
  }
}

const factory: ChallengeFactory = (ctx) => new ForestChallenge(ctx);
export default factory;
