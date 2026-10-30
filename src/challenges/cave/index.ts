/**
 * Cave challenge (quest 5): the natural cave. Tadeo explores it by torchlight. A
 * hungry mole digs through two rockfalls in exchange for glowing mushrooms (one,
 * then two from the side alcoves). The last door is the old people's test: three
 * crystals touched in the order the cave paintings show. Behind it the magic sword
 * rests in a great crystal in a shaft of daylight. Mistakes only dim the crystals.
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
import { CELL, COLS, CRYSTAL_ORDER, MOLE_CELLS, MOLE_WANTS, ROOMS, ROWS, START_CELL, TILE_ROWS, cellPos, inRoom } from "./layout";
import { TEST_HEX } from "./mechanisms";
import { MoleActor } from "./moleActor";
import { CaveView } from "./view";
import { SpeechBubble, toNdc, toScreen } from "../shared/speech";
import { Torch } from "./torch";
import { glowTexture } from "../../world/ambient/textures";
import { LINES, PHASE_HINTS, TADEO_REMARKS, WRONG_CRYSTAL } from "./script";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REACH = 1.9;
const MOLE_REACH = 2.4;
/** How close Tadeo comes before the mole speaks up by himself. */
const MOLE_TALK = 3.4;
/** Seconds without progress before Tadeo thinks aloud and the compass arrow points the way. */
const HINT_AFTER = 22;
/** Seconds after a talk or a scene in which Space does nothing. */
const SPACE_GUARD = 0.4;

const GOLD = new THREE.Color(2.8, 1.9, 0.5);

type Phase = "intro" | "rockfall1" | "rockfall2" | "test" | "chamber" | "done";
type Thing = { kind: "mushroom" | "crystal"; i: number; at: THREE.Vector3 } | { kind: "mole"; at: THREE.Vector3 };

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
  /** How many mushrooms Tadeo carries for the mole. */
  private carried = 0;
  private moleActor: MoleActor;
  private view!: CaveView;
  /** How many crystals of the order are lit. */
  private orderStep = 0;
  private wrongTries = 0;
  private spaceGuard = SPACE_GUARD;
  private idle = 0;
  private lastHint = 0;
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
    this.moleActor = new MoleActor(w, this.player.avatar.root);

    this.rig = new CameraRig(this.camera, (x, z) => w.field.heightAt(x, z));
    this.rig.offset.set(0, 10.2, 6.9);
    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.snap();
    this.bubble = new SpeechBubble(this.ui.layer);
  }

  enter(engine: Engine): void {
    this.engine = engine;
    this.view = new CaveView(this.rig, this.world, engine, this.post);
    // Reason: the cave walls are bulky, so cut a wider see-through hole around Tadeo (restored on exit)
    this.islandXray = xrayUniforms.uXrayRadius.value;
    xrayUniforms.uXrayRadius.value = 1.6;
    audio.playMusic("music_dungeon");
    this.update(0, 0);
    void this.intro();
  }

  // ── Flow ─────────────────────────────────────────────────────

  private async intro(): Promise<void> {
    const at = this.world.rockfalls[0].at;
    const p = this.player.position;
    this.rig.jumpToShot({ pos: new THREE.Vector3(at.x - 0.5, 9, at.z + 13), look: new THREE.Vector3(at.x - 1.2, 0.8, at.z + 2.8) });
    await wait(600);
    await this.ui.hud.showBanner("Kapitel 5", "Die Höhle", 2400);
    await this.talk("cave_enter");
    this.rig.setShot({ pos: new THREE.Vector3(p.x + 1.5, 9, p.z + 6.5), look: new THREE.Vector3(p.x, 1, p.z - 1) }, 1);
    await wait(900);
    this.rig.setShot(null, 1);
    this.phase = "rockfall1";
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

  /** Which rockfall the mole is working on. */
  private get stop(): number {
    return this.phase === "rockfall2" ? 1 : 0;
  }

  private get wants(): number {
    return MOLE_WANTS[this.stop];
  }

  private get moleBusy(): boolean {
    return this.phase === "rockfall1" || this.phase === "rockfall2";
  }

  /** A picture is worth a counter: the mushrooms he still has to bring, on top of the screen and over the mole. */
  private updateStatus(): void {
    if (this.moleBusy) this.ui.status(`🍄 ${this.carried} / ${this.wants}`);
    else this.ui.status(null);
    this.world.wish.show(this.wants, this.carried);
    this.moleActor.showHeld(this.carried);
  }

  /** A puff of golden sparks where a mushroom is picked or eaten. */
  private goldSparks(at: THREE.Vector3, count: number): void {
    this.world.sparks.emit(at, { count, color: GOLD, speed: [1, 3], up: 1.5, life: [0.35, 0.85], size: [0.07, 0.15], gravity: 5 });
  }

  private use(thing: Thing): void {
    this.idle = 0;
    this.lastHint = 0;
    if (thing.kind === "mushroom") this.pickMushroom(thing.i);
    else if (thing.kind === "crystal") this.touchCrystal(thing.i);
    else if (this.carried >= this.wants) void this.feedMole();
    else void this.scripted(this.stop === 0 ? LINES.moleReminder : this.carried === 0 ? LINES.moleReminderTwo : LINES.moleOneMore);
  }

  private pickMushroom(i: number): void {
    const m = this.world.mushrooms[i];
    m.pick();
    this.carried++;
    audio.playSfx("sfx_berry_collect");
    this.goldSparks(m.group.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 26);
    this.updateStatus();
    const remark = this.stop === 0 ? TADEO_REMARKS.pickedForMole : this.carried < this.wants ? TADEO_REMARKS.pickedOneOfTwo : TADEO_REMARKS.pickedBoth;
    this.bubble.say(remark, 3000, true);
  }

  /** Hand the mushrooms over; the mole munches, digs, and the rocks roll aside. */
  private async feedMole(): Promise<void> {
    this.busy = true;
    const w = this.world;
    const stop = this.stop;
    const rock = w.rockfalls[stop];
    const mole = w.mole;
    const p = this.player.position;
    this.player.facing = Math.atan2(mole.root.position.x - p.x, mole.root.position.z - p.z);
    this.ui.prompt.show(null);
    this.rig.setShot({ pos: new THREE.Vector3(rock.at.x + 5.8, 5.4, rock.at.z + 9.5), look: new THREE.Vector3(rock.at.x + 0.7, 0.9, rock.at.z + 1.8) }, 0.9);
    await this.talk(LINES.handOver[stop]);

    // The mushrooms fly to him in an arc
    this.moleActor.tossHeld(this.scene);
    this.carried = 0;
    this.updateStatus();
    this.ui.status(null);
    audio.playSfx("sfx_heal", 0.7);
    await wait(stop === 0 ? 700 : 950);
    this.goldSparks(mole.root.position.clone().add(new THREE.Vector3(0, 0.95, 0.2)), 22);
    mole.hungry = false;
    await this.talk(LINES.moleFed[stop]);

    // He goes to the rock and digs; only then do the stones start to move
    const side = p.x < rock.at.x + 0.2 ? 1 : -1;
    this.moleActor.walkTo(rock.at.x + side * 0.85, rock.at.z + 2.55);
    this.moleActor.atRock = true;
    await wait(650);
    audio.playSfx("sfx_dig");
    const dug = mole.dig();
    this.rig.addShake(0.2);
    await wait(1200);
    audio.playSfx("sfx_lava_fall", 0.5, 0.6);
    audio.playSfx("sfx_door", 0.5);
    await Promise.all([dug, rock.clear()]);
    this.moleActor.atRock = false;
    this.phase = stop === 0 ? "rockfall2" : "test";

    if (stop === 0) {
      await this.moleActor.dive(1);
    } else {
      const [x, z] = cellPos(...MOLE_CELLS[1]);
      this.moleActor.walkTo(x, z);
    }
    await wait(400);
    this.updateStatus();
    this.rig.setShot(null, 1);
    await wait(700);
    this.busy = false;
    this.bubble.say(stop === 0 ? TADEO_REMARKS.wayOpen : TADEO_REMARKS.hallOpen, 3000, true);
  }

  /** The grotto: cut to the mole at the next rockfall, so Tadeo knows where he has to go back to. */
  private async moleAsksAgain(): Promise<void> {
    this.busy = true;
    const at = this.world.mole.root.position;
    this.rig.setShot({ pos: new THREE.Vector3(at.x + 2.2, 6.2, at.z + 8.5), look: new THREE.Vector3(at.x - 1.4, 1.1, at.z - 1) }, 1);
    await wait(1000);
    await this.talk(LINES.moleAsksTwo);
    this.rig.setShot(null, 1);
    await wait(700);
    this.busy = false;
  }

  /** The head of the hall: Tadeo looks up at the pictures and reads them aloud. */
  private async readPaintings(): Promise<void> {
    this.busy = true;
    const at = this.world.wall.group.position;
    this.view.aim({ pos: new THREE.Vector3(at.x, 6.8, at.z + 15), look: new THREE.Vector3(at.x, 2.1, at.z + 1) });
    this.world.paintings.setSweep(true);
    await wait(1200);
    await this.talk(LINES.paintings);
    this.world.paintings.setSweep(false);
    this.view.aim(null);
    await wait(800);
    this.busy = false;
  }

  private touchCrystal(i: number): void {
    const w = this.world;
    const crystal = w.crystals[i];
    w.sparks.emit(crystal.topPosition(this.tmp), {
      count: 30,
      color: new THREE.Color(TEST_HEX[crystal.color]).multiplyScalar(2.6),
      speed: [1.5, 4],
      up: 1.5,
      life: [0.4, 0.9],
      size: [0.08, 0.16],
      gravity: 6,
    });
    if (crystal.color === CRYSTAL_ORDER[this.orderStep]) {
      crystal.touch();
      this.orderStep++;
      w.paintings.setStep(this.orderStep);
      w.wall.setProgress(this.orderStep);
      audio.playSfx("sfx_simon_correct", 0.8, 0.9 + this.orderStep * 0.1);
      this.rig.addShake(0.15);
      if (this.orderStep === CRYSTAL_ORDER.length) void this.openWall();
      return;
    }
    // Wrong crystal: they all go dark, and Tadeo says something kind
    audio.playSfx("sfx_simon_wrong", 0.8);
    for (const c of w.crystals) c.dim();
    this.orderStep = 0;
    w.paintings.setStep(0);
    w.wall.setProgress(0);
    this.bubble.say(WRONG_CRYSTAL[this.wrongTries++ % WRONG_CRYSTAL.length], 3400, true);
    this.busy = true;
    void wait(900).then(() => (this.busy = false));
  }

  private async openWall(): Promise<void> {
    this.busy = true;
    const w = this.world;
    const at = w.wall.group.position;
    await wait(600);
    this.view.aim({ pos: new THREE.Vector3(at.x + 1, 6.6, at.z + 11.5), look: new THREE.Vector3(at.x, 1.8, at.z) });
    await wait(1100);
    w.wall.startOpening();
    audio.playSfx("sfx_door");
    audio.playSfx("sfx_lava_fall", 0.6, 0.5);
    await w.wall.opening;
    audio.playSfx("sfx_special", 0.7);
    await wait(900);
    this.view.aim(null);
    this.phase = "chamber";
    await wait(600);
    this.busy = false;
    this.bubble.say(TADEO_REMARKS.wallOpen, 3000, true);
  }

  /** The sword wakes up, flies out of the great crystal and Tadeo holds it high. */
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
    this.view.aim({ pos: new THREE.Vector3(c.x + 2, 7.6, c.z + 8.4), look: new THREE.Vector3(c.x, 2, c.z + 0.6) });
    await wait(1300);
    await this.talk(DIALOGUES.cave_sword.slice(0, 1));

    // Pull the sword free
    this.holdingTorch = false;
    this.torch.boost = 0.55;
    this.player.avatar.pose = "holdUp";
    this.scene.attach(ch.sword);
    ch.pull();
    audio.playSfx("sfx_special");
    this.world.sparks.emit(ch.swordAt, { count: 70, color: new THREE.Color(1.2, 2.4, 3.2), speed: [2, 6], up: 1, life: [0.6, 1.4], size: [0.08, 0.2], gravity: 2 });
    this.player.facing = 0;
    this.view.aim({ pos: new THREE.Vector3(p.x + 2.2, p.y + 2.6, p.z + 4), look: new THREE.Vector3(p.x, p.y + 1.85, p.z) });
    await wait(900);
    await this.ui.itemGet("sword");
    await this.talk(DIALOGUES.cave_sword.slice(1), true);
    this.player.avatar.pose = "cheer";
    await wait(1200);
    this.resolveFinished();
  }

  // ── Frame ────────────────────────────────────────────────────

  update(dt: number, time: number): void {
    if (!this.engine) return;
    const input = this.engine.input;
    const w = this.world;
    const free = !this.busy && !this.ui.dialogue.isOpen && !this.engine.isSwitching;
    this.player.controlsEnabled = free;
    // Reason: the Space that closes a talk or arrives during a scene must not touch whatever Tadeo stands next to
    this.spaceGuard = free ? Math.max(0, this.spaceGuard - dt) : SPACE_GUARD;

    const near = free ? this.nearestThing() : null;
    if (free) {
      if (this.spaceGuard > 0) input.consume("Space");
      else if (near && input.consume("Space")) this.use(near);
      else if (input.consume("Space")) this.player.jump();
    }
    this.player.update(dt, input, this.rig.yaw);
    this.torch.pose(this.holdingTorch);
    this.torch.update(dt, time);
    w.update(dt, time, this.player.position, this.torch.light.position);
    this.moleActor.update(dt, time, this.player.position, w.rockfalls[this.stop].at, this.moleBusy);
    w.chamber.carrySword(dt, time, this.player.position, w.sparks);

    for (const r of w.rockfalls) if (r.rumbling) this.rumble(r.at, dt);
    if (w.wall.rumbling) this.rumble(w.wall.group.position, dt);
    if (w.wall.open || w.wall.rumbling) w.chamber.setReveal(Math.min(1, w.chamber.revealed + dt * 0.5));

    this.view.update(dt, this.player.position, this.phase);
    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.update(dt);
    xrayUniforms.uXrayTarget.value.copy(this.player.position).add(new THREE.Vector3(0, 0.9, 0));

    this.storyTriggers();
    this.hud(near, dt);
  }

  private nearestThing(): Thing | null {
    const w = this.world;
    const p = this.player.position;
    let best: Thing | null = null;
    let bestD = Infinity;
    const offer = (thing: Thing, reach: number) => {
      const d = Math.hypot(thing.at.x - p.x, thing.at.z - p.z);
      if (d < reach && d < bestD) {
        bestD = d;
        best = thing;
      }
    };
    w.mushrooms.forEach((m, i) => {
      if (!m.picked) offer({ kind: "mushroom", i, at: m.group.position }, REACH);
    });
    if (this.moleBusy) offer({ kind: "mole", at: w.mole.root.position }, MOLE_REACH);
    if (this.phase === "test") {
      w.crystals.forEach((c, i) => {
        if (!c.lit) offer({ kind: "crystal", i, at: c.group.position }, REACH);
      });
    }
    return best;
  }

  private rumble(at: THREE.Vector3, dt: number): void {
    this.rig.addShake(dt * 1.4);
    this.world.rumbleDust(at, dt);
  }

  /** The talks that start by themselves when Tadeo gets somewhere, and the finale. */
  private storyTriggers(): void {
    if (this.busy || this.ui.dialogue.isOpen) return;
    const p = this.player.position;
    const once = (key: string, run: () => void) => {
      if (this.told.has(key)) return;
      this.told.add(key);
      run();
    };
    if (this.phase === "rockfall1") {
      const m = this.world.mole.root.position;
      if (Math.hypot(p.x - m.x, p.z - m.z) < MOLE_TALK) once("mole", () => void this.scripted(this.carried > 0 ? LINES.moleSmells : LINES.moleAsks));
    }
    if (this.phase === "rockfall2" && inRoom(p.x, p.z, ROOMS.grotto)) once("grotto", () => void this.moleAsksAgain());
    if (this.phase === "test" && inRoom(p.x, p.z, ROOMS.hall)) once("hall", () => void this.readPaintings());
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

  private hud(near: Thing | null, dt: number): void {
    const ui = this.ui;
    if (near && !this.busy) {
      const verb = near.kind === "mushroom" ? "Pflücken" : near.kind === "crystal" ? "Berühren" : this.carried >= this.wants ? "Füttern" : "Reden";
      const lift = near.kind === "crystal" ? 3.3 : near.kind === "mole" ? 1.9 : 2;
      ui.prompt.show(toScreen(this.camera, this.tmp.set(near.at.x, near.at.y + lift, near.at.z)), verb);
    } else {
      ui.prompt.show(null);
    }
    const head = this.tmp.copy(this.player.position).add(new THREE.Vector3(0, 2.4, 0));
    this.bubble.place(toScreen(this.camera, head));

    // Reason: only point the way when Tadeo has been searching for a while
    this.idle += this.busy ? 0 : dt;
    const target = this.idle > HINT_AFTER ? this.nextTarget() : null;
    ui.hud.updateCompass(target ? toNdc(this.camera, target) : null);
    if (target && !this.busy && !ui.dialogue.isOpen && this.idle - this.lastHint > HINT_AFTER) {
      this.lastHint = this.idle;
      this.bubble.say(this.hintLine(), 4500, true);
    }
  }

  /** Where the next step of the puzzle is (for the hint arrow). */
  private nextTarget(): THREE.Vector3 | null {
    const w = this.world;
    if (this.moleBusy) {
      if (this.carried >= this.wants || (this.stop === 0 && !this.told.has("mole"))) return w.mole.root.position;
      const next = w.mushrooms.find((m, i) => !m.picked && (this.stop === 0 ? i === 0 : i > 0));
      return next ? next.group.position : w.mole.root.position;
    }
    if (this.phase === "test") {
      const crystal = w.crystals.find((c) => c.color === CRYSTAL_ORDER[this.orderStep]);
      return crystal ? crystal.group.position : null;
    }
    return this.phase === "chamber" ? w.chamber.center : null;
  }

  /** The reason and the place for the next step. */
  private hintLine(): string {
    if (this.phase === "test") return PHASE_HINTS.test;
    if (this.phase === "chamber") return PHASE_HINTS.chamber;
    if (this.carried >= this.wants) return PHASE_HINTS.bring;
    if (this.stop === 1) return this.carried === 1 ? PHASE_HINTS.findOther : PHASE_HINTS.findTwo;
    return this.told.has("mole") ? PHASE_HINTS.findFirst : PHASE_HINTS.meetMole;
  }

  /** Read-only snapshot for the E2E test (it steers with real key presses). */
  get e2e(): object {
    const w = this.world;
    const m = w.mole.root.position;
    return {
      phase: this.phase,
      busy: this.busy,
      player: [this.player.position.x, this.player.position.z],
      mushrooms: w.mushrooms.map((k) => ({ x: k.group.position.x, z: k.group.position.z, picked: k.picked })),
      carried: this.carried,
      rockfalls: w.rockfalls.map((r) => r.open),
      mole: { x: m.x, z: m.z, hungry: w.mole.hungry },
      crystals: w.crystals.map((c) => ({ x: c.group.position.x, z: c.group.position.z, color: c.color, lit: c.lit })),
      order: CRYSTAL_ORDER,
      orderStep: this.orderStep,
      wallOpen: w.wall.open,
      sword: { x: w.chamber.center.x, z: w.chamber.center.z },
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
