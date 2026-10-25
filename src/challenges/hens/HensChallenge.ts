/**
 * Side game "Hühner fangen mit der kleinen Mia": Mia's seven birds ran off
 * into the farmyard. Tadeo catches the hens by running into them (Space makes
 * a flying leap), leads the little chick back to the coop and finally finds
 * the golden hen hiding behind the hay. Every catch flutters home in a happy
 * arc. A gentle timer runs; the best time is remembered. No game over.
 */

import * as THREE from "three";
import { Engine, PostSettings } from "../../core/Engine";
import { CameraRig } from "../../core/CameraRig";
import { Player } from "../../characters/Player";
import { audio } from "../../audio/Audio";
import { DialogueScript } from "../../data/dialogues";
import { GameUI } from "../../ui/GameUI";
import { NarrationManager } from "../../systems/NarrationManager";
import { Challenge, ChallengeContext } from "../types";
import { toNdc, toScreen } from "../shared/speech";
import { henVoice } from "./cluck";
import { Flock, FlockEvents, Hen } from "./flock";
import { Mia, PicoFlyer } from "./friends";
import { Footsteps, Fx } from "./fx";
import { Bubble, HensHud, PopKind, loadBest, saveBest } from "./hud";
import { MIA_SPOT, RAMP_FOOT, START, YARD } from "./layout";
import { ALL_LINES, GOLDEN, INTRO, PICO, ending, homeLine } from "./script";
import { Yard } from "./yard";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CATCH_R = 1.0;
const DIVE_CATCH_R = 1.45;
const DIVE_BOOST = 4.2;
/** Seconds without progress before Pico flies over to show the way. */
const HINT_AFTER = 14;

type Phase = "intro" | "play" | "golden" | "finale" | "done";

export class HensChallenge implements Challenge {
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.3, 700);
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 0.5,
    bloomThreshold: 0.86,
    tiltShift: true,
    tiltFocus: 1.05,
    saturation: 0.14,
    contrast: 0.06,
    vignette: 0.38,
    exposure: 1.02,
  };
  readonly finished: Promise<void>;
  private resolveFinished!: () => void;
  private engine!: Engine;
  private ui: GameUI;
  private yard = new Yard();
  private player: Player;
  private rig: CameraRig;
  private flock: Flock;
  private fx: Fx;
  private steps: Footsteps;
  private hud: HensHud;
  private mia: Mia;
  private pico: PicoFlyer;
  private miaBubble: Bubble;
  private picoBubble: Bubble;
  private phase: Phase = "intro";
  private busy = true;
  private seconds = 0;
  private best = loadBest();
  private record = false;
  /** Seconds left of Tadeo's flying leap. */
  private dive = 0;
  private idle = 0;
  private squawkCool = 4;
  private picoQueue: string[] = [];
  private said = new Set<string>();
  private speaking: string | null = null;
  private sparkleT = 0;
  private smokeT = 0;
  private tmp = new THREE.Vector3();

  constructor(ctx: ChallengeContext) {
    this.ui = ctx.ui;
    this.scene = this.yard.scene;
    this.finished = new Promise((r) => (this.resolveFinished = r));
    this.fx = new Fx(this.yard.owned);
    this.scene.add(this.fx.group);
    this.steps = new Footsteps(this.fx, this.yard.ground);

    this.player = new Player(this.yard.walkable());
    this.player.addTo(this.scene);
    this.player.teleport(START[0], START[1], Math.PI);
    this.rig = new CameraRig(this.camera, () => 0);
    this.rig.offset.set(0, 8.4, 10.4);
    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.snap();

    this.flock = new Flock(this.yard.colliders, this.yard.coop, this.events(), this.yard.owned);
    this.scene.add(this.flock.group);
    this.mia = new Mia(this.scene);
    this.pico = new PicoFlyer(this.scene);
    this.pico.snap(this.player.position);

    this.hud = new HensHud(this.ui);
    this.miaBubble = new Bubble(this.ui.layer, "Kleine Mia");
    this.picoBubble = new Bubble(this.ui.layer, "Pico");
    void NarrationManager.getInstance().prefetch(ALL_LINES);
  }

  enter(engine: Engine): void {
    this.engine = engine;
    audio.playMusic("music_village");
    this.update(0, 0);
    void this.intro();
  }

  // ── Flow ─────────────────────────────────────────────────────

  private async intro(): Promise<void> {
    const [mx, mz] = MIA_SPOT;
    this.rig.jumpToShot({ pos: new THREE.Vector3(3, 15, 21), look: new THREE.Vector3(-1, 0, -2) });
    this.rig.setShot({ pos: new THREE.Vector3(mx + 2.4, 3.1, mz + 7.4), look: new THREE.Vector3(mx - 1.6, 1.2, mz - 1.2) }, 4.6);
    await wait(400);
    await this.ui.hud.showBanner("Mias Bauernhof", "Hühner fangen!", 2600);
    await this.talk(INTRO);
    this.rig.setShot(null, 1.4);
    await wait(600);
    this.phase = "play";
    this.busy = false;
  }

  private async talk(script: DialogueScript): Promise<void> {
    this.miaBubble.hide();
    this.picoBubble.hide();
    this.ui.dialogue.onLine = (speaker) => (this.speaking = speaker);
    await this.ui.say(script);
    this.ui.dialogue.onLine = null;
    this.speaking = null;
  }

  /** After the other six are home, the golden hen pops out from behind the hay. */
  private async goldenReveal(): Promise<void> {
    this.busy = true;
    this.phase = "golden";
    this.picoQueue.length = 0;
    await wait(1200);
    const g = this.flock.revealGolden(this.player.position);
    const p = this.player.position;
    // Reason: film her from her side of the pile so the hay is behind her, not in front —
    // swung towards the middle of the yard, so no sunflower or fence post blocks the view
    const away = this.tmp.set(g.x - p.x, 0, g.z - p.z).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x);
    if (side.x * g.x + side.z * g.z > 0) side.negate();
    away.multiplyScalar(0.6).addScaledVector(side, 0.8).normalize();
    const look = new THREE.Vector3(g.x, 0.6, g.z);
    this.rig.setShot({ pos: look.clone().addScaledVector(away, 5.2).add(new THREE.Vector3(0, 2.6, 0)), look }, 1.2);
    await wait(900);
    this.fx.sparkle(look, 45);
    audio.playSfx("sfx_special", 0.7);
    henVoice.bagawk(1.25);
    this.popAt(g, "!", "gold");
    await wait(1100);
    await this.talk(GOLDEN);
    this.rig.setShot(null, 1.3);
    await wait(500);
    this.idle = 0;
    this.phase = "play";
    this.busy = false;
  }

  /** All seven home: everyone cheers in front of the coop, then the ending talk. */
  private async finale(): Promise<void> {
    this.busy = true;
    this.phase = "finale";
    this.picoQueue.length = 0;
    this.ui.hud.updateCompass(null);
    const time = this.seconds;
    const previous = this.best;
    this.record = previous === null || time < previous;
    if (this.record) saveBest(time);
    const lines = ending(time, previous);
    void NarrationManager.getInstance().prefetch(lines);
    await wait(1000);

    await this.engine.fade(1, 350);
    const [mx, mz] = MIA_SPOT;
    this.player.teleport(mx - 1.4, mz + 0.9, 0.15);
    this.mia.faceTowards(mx + 1, mz + 8);
    this.pico.guide = new THREE.Vector3(mx - 0.7, 0, mz + 1.8);
    this.pico.snap(this.pico.guide);
    this.rig.jumpToShot({ pos: new THREE.Vector3(mx - 1.2, 3.0, mz + 8.6), look: new THREE.Vector3(mx - 2.6, 1.4, mz - 1.6) });
    this.miaBubble.hide();
    this.picoBubble.hide();
    await this.engine.fade(0, 450);

    audio.playSfx("sfx_victory_fanfare", 0.8);
    audio.playMusic("music_victory");
    this.celebrate();
    await wait(2300);
    await this.talk(lines);
    this.celebrate();
    await wait(1400);
    this.phase = "done";
    this.resolveFinished();
  }

  private celebrate(): void {
    this.mia.cheer(4);
    this.player.avatar.pose = "cheer";
    const colors = ["#fbf8f1", "#b8642e", "#3d3b48", "#ece6d9", "#e8a24a", "#ffd84a", "#ffc93c"];
    const [mx, mz] = MIA_SPOT;
    for (const dx of [-2.2, 0, 2.2]) this.fx.feathers.emit(new THREE.Vector3(mx - 1.2 + dx, 3.2, mz), colors, 16, 3.2, 2.5);
    this.fx.sparkle(new THREE.Vector3(mx - 0.7, 2.2, mz + 0.4), 40);
    henVoice.cackle(1.1);
  }

  // ── Hen events ───────────────────────────────────────────────

  private events(): FlockEvents {
    return {
      startled: (h) => {
        this.popAt(h, "!", "alert");
        henVoice.bagawk(this.pitch(h));
        h.model.cluck(0.4);
      },
      hop: (h) => this.fx.feathers.emit(this.henAt(h, 0.5), this.colors(h), 3, 1.4, 1.2),
      dodge: (h) => {
        this.popAt(h, "Hui!", "alert");
        henVoice.bagawk(this.pitch(h) * 1.1);
        h.model.cluck(0.5);
        this.fx.feathers.emit(this.henAt(h, 0.5), this.colors(h), 8, 2.2, 1.8);
        this.fx.puff(this.henAt(h, 0.1), 1.2);
      },
      tired: (h) => {
        this.popAt(h, "Puh!", "puff");
        if (h.kind === "golden") this.picoSays(PICO.goldTired, true);
        else if (!this.said.has("tired")) {
          this.said.add("tired");
          this.picoSays(PICO.tired, true);
        }
      },
      peep: (h) => {
        this.popAt(h, "Piep!", "peep");
        henVoice.peep();
      },
      follow: (h) => {
        this.idle = 0;
        this.popAt(h, "Piep!", "peep");
        henVoice.peep();
        if (!this.said.has("chick")) {
          this.said.add("chick");
          this.picoSays(PICO.chick, true);
        }
      },
      dash: (h) => {
        this.fx.sparkle(this.henAt(h, 0.5), 18);
        henVoice.bagawk(1.3);
        if (!this.said.has("dash")) {
          this.said.add("dash");
          this.picoSays(PICO.goldDash, true);
        }
      },
      caught: (h) => this.onCaught(h),
      home: (h) => this.onHome(h),
    };
  }

  private onCaught(h: Hen): void {
    this.idle = 0;
    this.pico.guide = null;
    const at = this.henAt(h, 0.45);
    this.fx.feathers.emit(at, this.colors(h), h.kind === "chick" ? 6 : 16, 3, 2.4);
    this.fx.puff(at, 1.8);
    if (h.kind === "golden") this.fx.sparkle(at, 50);
    this.popAt(h, h.kind === "chick" ? "Piep!" : "Gack!", h.kind === "golden" ? "gold" : "gack");
    if (h.kind === "chick") henVoice.peep();
    else henVoice.bagawk(this.pitch(h));
    audio.playSfx("sfx_berry_collect", 0.8, 1.1);
    this.rig.addShake(0.16);
  }

  private onHome(h: Hen): void {
    const coop = this.yard.coop;
    coop.bounce();
    const door = coop.doorPoint(this.tmp);
    this.fx.feathers.emit(door.clone(), this.colors(h), 8, 1.6, 1.4);
    if (h.kind === "golden") this.fx.sparkle(door.clone(), 30);
    if (h.kind === "chick") henVoice.peep();
    else henVoice.cackle(this.pitch(h));
    const home = this.flock.homeCount;
    audio.playSfx("sfx_simon_correct", 0.55, 0.9 + home * 0.07);
    this.hud.flash(this.flock.hens.indexOf(h));
    this.mia.cheer();
    if (h.kind === "golden") {
      void this.finale();
      return;
    }
    this.picoBubble.hide();
    this.miaBubble.say(homeLine(h.name, h.kind === "chick"), 2600);
    if (home === 6 && this.flock.golden.state === "hidden") void this.goldenReveal();
  }

  // ── Frame ────────────────────────────────────────────────────

  update(dt: number, time: number): void {
    if (!this.engine) return;
    const input = this.engine.input;
    const dialogue = this.ui.dialogue.isOpen;
    const free = this.phase === "play" && !this.busy && !dialogue && !this.engine.isSwitching;
    this.player.controlsEnabled = free;
    if (free && input.consume("Space")) this.startDive();
    this.player.update(dt, input, this.rig.yaw);
    this.updateDive(dt);
    if (free) this.seconds += dt;

    const p = this.player.position;
    this.flock.update(dt, time, free, { pos: p, facing: this.player.facing, catchR: this.dive > 0 ? DIVE_CATCH_R : CATCH_R });
    this.mia.talking = this.speaking === "Kleine Mia" || this.miaBubble.showing;
    this.mia.update(dt, p, this.phase !== "finale" && this.phase !== "done");
    this.pico.talking = this.speaking === "Pico" || this.picoBubble.showing;
    this.pico.update(dt, p);
    if (this.speaking === "Tadeo") this.player.avatar.pose = "talk";
    else if (this.player.avatar.pose === "talk") this.player.avatar.pose = "normal";

    this.yard.update(dt, time, p);
    this.fx.update(dt);
    this.feet(dt);
    this.ambientFx(dt);

    this.rig.follow(p, this.player.velocity);
    this.rig.update(dt);
    this.hints(dt, free);
    this.chatter(dt, free);
    this.placeBubbles();
    if (this.phase !== "intro") this.hud.status(this.slots(), this.seconds);
  }

  private startDive(): void {
    if (!this.player.grounded) return;
    this.player.jump();
    const f = this.player.facing;
    this.player.velocity.x += Math.sin(f) * DIVE_BOOST;
    this.player.velocity.z += Math.cos(f) * DIVE_BOOST;
    this.dive = 0.7;
    audio.playSfx("sfx_hammer_miss", 0.45, 1.3);
    this.fx.puff(this.player.position, 0.9);
  }

  private updateDive(dt: number): void {
    if (this.dive <= 0) return;
    this.dive -= dt;
    // Superhero leap: arms stretched out in front
    const a = this.player.avatar;
    a.armL.rotation.set(-1.9, 0, -0.2);
    a.armR.rotation.set(-1.9, 0, 0.2);
    a.torso.rotation.x = 0.35;
    if (this.player.grounded && this.dive < 0.55) {
      this.dive = 0;
      this.fx.puff(this.player.position, 2.4);
      this.rig.addShake(0.06);
    }
  }

  /** Dust and splashes under every runner, grass bending round them. */
  private feet(dt: number): void {
    const p = this.player.position;
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    if (this.player.grounded) this.steps.step("tadeo", p.x, p.z, speed, dt);
    const grass = this.yard.grass;
    grass.setPusher(0, p.x, p.z, this.player.grounded ? 1.0 : 0.6);
    this.flock.hens.forEach((h, i) => {
      const onGround = h.loose && h.y < 0.3;
      grass.setPusher(i + 1, h.x, h.z, onGround ? 0.6 : 0);
      if (onGround && h.y < 0.05) this.steps.step(h.name, h.x, h.z, h.speed, dt, true);
    });
  }

  /** Golden glitter trail and smoke from the village chimneys. */
  private ambientFx(dt: number): void {
    const g = this.flock.golden;
    this.sparkleT -= dt;
    if (g.loose && this.sparkleT <= 0) {
      this.sparkleT = g.state === "dash" ? 0.04 : 0.18;
      this.fx.sparkle(this.henAt(g, 0.45), g.state === "dash" ? 2 : 1);
    }
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.8;
      for (const c of this.yard.chimneys) this.fx.smoke(c);
    }
  }

  /** The thing Tadeo should go for next: the coop when the chick follows, else the nearest loose bird. */
  private nextTarget(): THREE.Vector3 | null {
    if (this.flock.chick.state === "follow") return new THREE.Vector3(RAMP_FOOT[0], 0.6, RAMP_FOOT[1]);
    const p = this.player.position;
    let best: Hen | null = null;
    let bestD = Infinity;
    for (const h of this.flock.hens) {
      if (!h.loose) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best ? new THREE.Vector3(best.x, 0.6, best.z) : null;
  }

  private hints(dt: number, free: boolean): void {
    if (!free) {
      this.ui.hud.updateCompass(null);
      return;
    }
    this.idle += dt;
    const target = this.nextTarget();
    this.ui.hud.updateCompass(target ? toNdc(this.camera, target) : null);
    if (this.idle > HINT_AFTER && target) {
      this.pico.guide = target;
      if (this.idle > HINT_AFTER + 0.5 && !this.said.has(`hint${Math.floor(this.idle / 20)}`)) {
        this.said.add(`hint${Math.floor(this.idle / 20)}`);
        this.picoSays(this.flock.chick.state === "follow" ? PICO.chickHint : PICO.hint);
      }
    } else this.pico.guide = null;
  }

  /** Pico squawks when a hen is within reach; queued lines wait for Mia to finish. */
  private chatter(dt: number, free: boolean): void {
    this.squawkCool -= dt;
    const busyTalking = this.miaBubble.showing || this.picoBubble.showing || this.ui.dialogue.isOpen;
    if (this.picoQueue.length && !busyTalking) this.picoBubble.say(this.picoQueue.shift()!, 3000);
    if (!free || this.squawkCool > 0 || busyTalking) return;
    const p = this.player.position;
    const close = this.flock.hens.some((h) => h.loose && h.kind !== "chick" && h.state !== "tired" && Math.hypot(h.x - p.x, h.z - p.z) < 2.4);
    if (close) {
      this.picoBubble.say(PICO.close[Math.floor(Math.random() * PICO.close.length)], 2000);
      this.squawkCool = 10;
    }
  }

  private picoSays(text: string, important = false): void {
    if (important) this.picoQueue.push(text);
    else if (!this.miaBubble.showing && !this.picoBubble.showing) this.picoBubble.say(text, 2800);
  }

  private placeBubbles(): void {
    const m = this.mia.position;
    this.miaBubble.place(toScreen(this.camera, this.tmp.set(m.x, this.mia.avatar.height + 0.55, m.z)));
    const q = this.pico.position;
    this.picoBubble.place(toScreen(this.camera, this.tmp.set(q.x, q.y + 0.75, q.z)));
  }

  // ── Helpers ──────────────────────────────────────────────────

  private slots(): { icon: "hen" | "chick" | "gold"; caught: boolean }[] {
    return this.flock.hens.map((h) => ({ icon: h.kind === "chick" ? "chick" : h.kind === "golden" ? "gold" : "hen", caught: h.state === "home" }));
  }

  private henAt(h: Hen, up: number): THREE.Vector3 {
    return new THREE.Vector3(h.x, h.y + up * h.scale, h.z);
  }

  private popAt(h: Hen, text: string, kind: PopKind): void {
    this.hud.pop(text, toScreen(this.camera, this.henAt(h, 1.15)), kind);
  }

  private colors(h: Hen): THREE.ColorRepresentation[] {
    const l = h.model.look;
    return [l.body, l.wing, l.chest ?? l.body, "#ffffff"];
  }

  private pitch(h: Hen): number {
    return h.kind === "golden" ? 1.2 : 0.85 + (h.seed % 1) * 0.3;
  }

  /** Read-only snapshot for the E2E test (it steers with real key presses). */
  get state(): object {
    const p = this.player.position;
    return {
      phase: this.phase,
      busy: this.busy,
      player: [p.x, p.z],
      grounded: this.player.grounded,
      hens: this.flock.hens.map((h) => ({ name: h.name, kind: h.kind, state: h.state, dodged: h.dodged, x: h.x, z: h.z })),
      home: this.flock.homeCount,
      total: this.flock.hens.length,
      seconds: this.seconds,
      previousBest: this.best,
      record: this.record,
      ramp: RAMP_FOOT,
      yard: YARD,
    };
  }

  exit(): void {
    this.ui.status(null);
    this.ui.prompt.show(null);
    this.ui.hud.updateCompass(null);
    this.ui.dialogue.onLine = null;
    this.miaBubble.dispose();
    this.picoBubble.dispose();
    this.hud.dispose();
    this.fx.dispose();
    this.yard.dispose();
    henVoice.dispose();
  }
}
