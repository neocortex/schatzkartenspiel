/**
 * VolcanoChallenge — Tadeo crosses the lava field at the foot of the erupting
 * volcano. Glowing lava bombs arc down from the crater; a ring on the ground
 * shows where each will land. Where the eruptions broke the bridges he jumps over
 * the lava from rock to rock. The run's `VolcanoMode` decides what happens at the
 * old stone at the goal. No game over: a hit or a missed jump means "Autsch!", a
 * hop and a fresh start at the last checkpoint flag.
 */

import * as THREE from "three";
import { Engine, PostSettings } from "../../core/Engine";
import { CameraRig, Shot } from "../../core/CameraRig";
import { Colliders } from "../../world/Colliders";
import { createFeuerherz } from "../../world/models/items";
import { glowTexture, puffTexture } from "../../world/ambient/textures";
import { audio } from "../../audio/Audio";
import { DialogueScript } from "../../data/dialogues";
import { Challenge, ChallengeContext } from "../types";
import { Stage } from "./kit/stage";
import { ScreenFx } from "./kit/fx";
import { Bursts } from "./kit/bursts";
import { Disposer } from "./kit/models";
import { Course, HopRock } from "./course";
import { createTerrain } from "./terrain";
import { createLava } from "./lava";
import { VolcanoSet } from "./set";
import { activateFlag } from "./props";
import { Peak } from "./peak";
import { Markers } from "./markers";
import { Bombs, RING_RADIUS } from "./bombs";
import { BombDirector } from "./director";
import { Hero } from "./hero";
import type { VolcanoMode } from "./modes";
import { LIFTS_NEEDED } from "./rescue";

const TIPS: DialogueScript = [
  {
    speaker: "Tadeo",
    portrait: "portrait_tadeo",
    text: "Wo ein Kreis auf dem Boden leuchtet, landet gleich ein Lavabrocken. Da gehe ich schnell weg!",
  },
  { speaker: "Tadeo", portrait: "portrait_tadeo", text: "Die Brücke ist kaputt! Mit der Leertaste springe ich über die Steine." },
  { speaker: "Tadeo", portrait: "portrait_tadeo", text: "Ich laufe zum goldenen Licht. Los geht's!" },
];

/** Generous for the player: the drawn ring is bigger than the real danger zone. */
const HIT_RADIUS = RING_RADIUS * 0.72;
/** Camera offset from the look point (which sits LOOK_AHEAD in front of Tadeo). */
const CAM_DIST = 16.5;
const CAM_HEIGHT = 5.6;
const LOOK_AHEAD = 4.5;

type State = "intro" | "play" | "ouch" | "won";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class VolcanoChallenge implements Challenge {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2500);
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 0.85,
    bloomThreshold: 0.88,
    tiltShift: true,
    tiltFocus: 1.35,
    tiltOffset: 0.05,
    saturation: 0.08,
    contrast: 0.07,
    vignette: 0.5,
  };
  readonly finished: Promise<void>;
  state: State = "intro";
  /** Index of the last checkpoint reached. */
  checkpoint = 0;
  hits = 0;
  /** Trail progress (arc length) of Tadeo. */
  playerS = 0;
  // Built in enter() (behind the black fade) so the island doesn't freeze while loading
  course!: Course;
  hero!: Hero;
  bombs!: Bombs;
  set!: VolcanoSet;
  rig!: CameraRig;
  director!: BombDirector;
  readonly bursts = new Bursts();
  /** Shown above the world while no line is on screen: what Space would do, and where. */
  prompt: { at: THREE.Vector3; verb: string } | null = null;
  private resolve!: () => void;
  private engine!: Engine;
  private stage!: Stage;
  private peak!: Peak;
  private markers!: Markers;
  private fx: ScreenFx;
  private disposer = new Disposer();
  private yaw = 0;
  private invulnerable = 0;
  private cinematic: ((t: number) => Shot) | null = null;
  private cinematicTime = 0;
  private statusKey = "";
  private ownedGroups: THREE.Object3D[] = [];
  private wasGrounded = true;
  private spaceWaiter: (() => void) | null = null;
  private tmp = new THREE.Vector3();

  constructor(readonly ctx: ChallengeContext, readonly mode: VolcanoMode) {
    this.finished = new Promise((r) => (this.resolve = r));
    this.fx = new ScreenFx(ctx.ui.layer);
  }

  /** What the E2E proof reads: see `scripts/e2e/volcano.mjs`. */
  get e2e(): { paco: "stuck" | "free" | "none"; lifts: number; liftsNeeded: number; rocks: HopRock[]; lastCheckpoint: number; bombsNearRocks: number } {
    const rescue = this.set.rescue;
    return {
      paco: !rescue ? "none" : rescue.free ? "free" : "stuck",
      lifts: rescue?.lifts ?? 0,
      liftsNeeded: LIFTS_NEEDED,
      rocks: this.course.rocks,
      lastCheckpoint: this.checkpoint,
      bombsNearRocks: this.director.bombsNearRocks,
    };
  }

  enter(engine: Engine): void {
    this.engine = engine;
    this.build();
    void this.flow();
  }

  private build(): void {
    const course = (this.course = new Course());
    const sky = this.mode.sky;
    this.stage = new Stage({
      scene: this.scene,
      sky,
      sunDir: new THREE.Vector3(-0.45, 0.72, 0.52),
      sunColor: "#fff0d6",
      sunIntensity: 2.7,
      hemiSky: "#ffe7cf",
      hemiGround: "#7a4434",
      hemiIntensity: 1.05,
      fog: { color: sky.horizon.clone().lerp(new THREE.Color("#e7a98c"), 0.3), near: 150, far: 640 },
      shadowExtent: 34,
      height: (x, z) => course.terrain(x, z),
    });
    const world = this.stage.world;
    const terrain = createTerrain(course, world);
    this.disposer.own(terrain.material);
    this.scene.add(terrain.mesh);
    const lava = createLava(course, world);
    this.scene.add(lava.group);

    const colliders = new Colliders();
    // Reason: Tadeo only carries the heart long after Paco went home
    this.set = new VolcanoSet(course, world, sky.horizon, colliders, !this.mode.carriesHeart);
    this.disposer.ownAll(Object.values(this.set.materials));
    this.scene.add(this.set.group);
    if (this.set.rescue) this.scene.add(this.set.rescue.group);
    this.set.smoke.add(lava.mouths.flatMap((m) => [m, m.clone().add(new THREE.Vector3(1.5, 0, 1))]), "seaSteam");

    this.peak = new Peak(this.set.smoke, this.bursts);
    this.scene.add(this.peak.group);
    this.markers = new Markers((x, z) => course.ground(x, z), RING_RADIUS);
    // Reason: these groups only hold materials created for this challenge (no shared toon/mat() ones)
    this.ownedGroups.push(lava.group, this.set.group, this.peak.group, this.markers.group);
    this.bombs = new Bombs((x, z) => course.ground(x, z), this.markers, this.bursts, this.peak.vent);
    this.disposer.ownAll(this.bombs.materials);
    this.director = new BombDirector(course, this.bombs, this.peak, this.mode.bombInterval);
    this.scene.add(this.markers.group, this.bombs.group, this.bursts.group);

    this.hero = new Hero({
      ground: (x, z) => course.ground(x, z),
      canStand: (x, z) => course.canStand(x, z),
      canLeap: (x, z) => course.canLeap(x, z),
      colliders,
    });
    this.hero.addTo(this.scene);
    if (this.mode.carriesHeart) {
      const heart = createFeuerherz();
      heart.scale.setScalar(0.58);
      heart.position.set(0, 0.16, -0.3);
      this.hero.avatar.back.add(heart);
      this.disposer.ownMaterials(heart);
    }
    const cp = course.checkpoints[0];
    this.hero.teleport(cp.pos.x, cp.pos.y, cp.facing);
    activateFlag(this.set.flags[0]);
    this.playerS = course.trailS(cp.pos.x, cp.pos.y);

    this.rig = new CameraRig(this.camera, (x, z) => course.terrain(x, z));
    this.yaw = this.trailYaw(this.playerS);
    this.updateCamera(0);
    this.rig.snap();
    this.update(0, 0);
  }

  // ── Flow ──────────────────────────────────────────────────

  private async flow(): Promise<void> {
    const ui = this.ctx.ui;
    audio.playMusic("music_combat");
    // Intro: start on the smoking volcano, glide down to Tadeo at the start of the trail
    const p = this.hero.position.clone();
    const from: Shot = { pos: new THREE.Vector3(p.x + 26, p.y + 9, p.z + 16), look: this.peak.vent.clone().setY(30) };
    const to: Shot = { pos: new THREE.Vector3(p.x + 3.5, p.y + 3.2, p.z + 7.5), look: p.clone().add(new THREE.Vector3(-0.5, 1.4, -2)) };
    this.cinematic = (t) => {
      const k = THREE.MathUtils.smootherstep(t, 1.2, 6.5);
      return { pos: from.pos.clone().lerp(to.pos, k), look: from.look.clone().lerp(to.look, k) };
    };
    this.hero.facing = Math.atan2(3.5, 7.5);
    await wait(1800);
    this.peak.erupt(2);
    this.rig.addShake(0.5);
    await wait(2600);
    await ui.say("volcano_enter");
    this.hero.avatar.pose = "talk";
    await ui.say(TIPS);
    this.hero.avatar.pose = "normal";
    this.hero.facing = this.course.checkpoints[0].facing;
    this.cinematic = null;
    this.rig.setShot(null, 1.4);
    void ui.hud.showBanner("Weiche den leuchtenden Kreisen aus!", "Los geht's!", 2000);
    this.state = "play";
    this.director.dangerous = true;
    this.director.grace = 1.2;
  }

  /** Tadeo reached the goal: the danger stops, and the run's ending plays out at the old stone. */
  private async win(): Promise<void> {
    this.state = "won";
    this.director.dangerous = false;
    this.hero.controls = false;
    this.set.beacon.set(null);
    await this.mode.ending(this);
    this.resolve();
  }

  /** The big moment: flash, fanfare and victory music, sparkles and a word above Tadeo's head. */
  celebrate(word: string): void {
    audio.playSfx("sfx_victory_fanfare");
    audio.playMusic("music_victory");
    this.fx.flash("#fff4c8", 0.35, 500);
    const head = this.hero.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    this.bursts.twinkle(head, 40, 2.2, new THREE.Color(3, 2.4, 0.8), 0.4);
    this.fx.pop(word, head, this.camera, "#ffe14a", 56);
  }

  /** Resolves on the next press of Space that no dialogue took. */
  nextSpace(): Promise<void> {
    return new Promise((resolve) => (this.spaceWaiter = resolve));
  }

  private hit(from: THREE.Vector3): void {
    this.state = "ouch";
    this.hits++;
    this.hero.controls = false;
    this.hero.knock(from);
    audio.playSfx("sfx_hit_damage");
    this.fx.flash("#ff5a3c", 0.45, 450);
    this.rig.addShake(0.9);
    const head = this.hero.position.clone().add(new THREE.Vector3(0, 2.1, 0));
    this.fx.pop("Autsch!", head, this.camera, "#ffd23f", 54);
    this.bursts.twinkle(head, 14, 1.2, new THREE.Color(3, 2.6, 0.6), 0.32);
    setTimeout(() => this.respawn(), 1150);
  }

  private respawn(): void {
    const cp = this.course.checkpoints[this.checkpoint];
    this.bursts.puffs(this.hero.position.clone(), 8, "#ffffff", [0.6, 1.8], 1, 1.2, 0.9, 0.9);
    this.hero.teleport(cp.pos.x, cp.pos.y, cp.facing);
    this.hero.avatar.pose = "normal";
    this.bursts.twinkle(this.hero.position.clone().setY(this.hero.position.y + 1), 26, 1.6, new THREE.Color(1.6, 2.4, 3.2), 0.34);
    audio.playSfx("sfx_heal", 0.7);
    this.invulnerable = 2.2;
    this.director.grace = 1.6;
    this.state = "play";
  }

  // ── Per frame ─────────────────────────────────────────────

  update(dt: number, time: number): void {
    if (!this.course) return;
    const ui = this.ctx.ui;
    const input = this.engine?.input ?? null;
    const paused = ui.dialogue.isOpen && this.state === "play";
    this.stage.update(time);

    if (this.state === "play") {
      this.hero.controls = !paused;
      if (!paused && input?.consume("Space")) this.hero.jump();
    }
    if (this.spaceWaiter && !ui.dialogue.isOpen && input?.consume("Space")) {
      const resume = this.spaceWaiter;
      this.spaceWaiter = null;
      resume();
    }
    this.hero.update(dt, input, this.yaw);
    const hp = this.hero.position;
    this.playerS = Math.max(this.course.trailS(hp.x, hp.z), 0);
    this.hopping(hp);

    if (!paused) {
      this.director.update(dt, hp, this.playerS, this.hero.velocity);
      const impacts = this.bombs.update(dt, (b) => this.whistle(b.to));
      for (const imp of impacts) this.impact(imp.pos, imp.dangerous, imp.water);
    }
    this.markers.update(dt, time);
    this.bursts.update(dt);
    this.peak.update(dt, time);
    this.set.update(dt, time, hp, this.camera);
    this.set.rescue?.update(dt);

    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      this.hero.avatar.root.visible = this.invulnerable <= 0 || Math.floor(time * 12) % 2 === 0;
    }
    if (this.state === "play" && !paused) {
      this.checkpoints();
      if (this.playerS >= this.course.goalS + 3) void this.win();
      this.status();
    }
    this.updateCamera(dt);
    this.showPrompt(paused);
  }

  /** Comes down in the lava: "Autsch!". Comes down on a rock: a puff of dust and a little cheer. */
  private hopping(hp: THREE.Vector3): void {
    const landed = this.hero.grounded && !this.wasGrounded;
    this.wasGrounded = this.hero.grounded;
    if (this.state !== "play" || !this.hero.grounded) return;
    if (this.course.lavaAt(hp.x, hp.z)) {
      this.bursts.sparks(hp.clone().setY(hp.y + 0.2), 44, 7.5, new THREE.Color(3.6, 1.5, 0.25), 0.3);
      audio.playSfx("sfx_lava_fall", 0.8, 0.8);
      this.hit(hp);
      return;
    }
    if (!landed || !this.course.rockAt(hp.x, hp.z)) return;
    this.bursts.puffs(hp.clone(), 7, "#d8c6a8", [0.3, 1.1], 1, 0.5, 0.6, 0.7);
    audio.playSfx("sfx_menu_confirm", 0.55, 1.15);
    this.fx.pop("Hopp!", hp.clone().setY(hp.y + 2.1), this.camera, "#8dff6a", 38);
  }

  /** The prompt the flow asked for; otherwise, the first thing a child should learn at a broken crossing. */
  private showPrompt(paused: boolean): void {
    const hp = this.hero.position;
    const canHop = this.state === "play" && !paused && this.hero.grounded && this.course.canLeap(hp.x, hp.z);
    const prompt = this.prompt ?? (canHop ? { at: this.tmp.set(hp.x, hp.y + 2.2, hp.z), verb: "Springen" } : null);
    if (!prompt || this.ctx.ui.dialogue.isOpen) {
      this.ctx.ui.prompt.show(null);
      return;
    }
    const v = this.tmp.copy(prompt.at).project(this.camera);
    this.ctx.ui.prompt.show({ x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight }, prompt.verb);
  }

  private updateCamera(dt: number): void {
    const target = this.trailYaw(this.playerS);
    const d = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    this.yaw += d * (1 - Math.exp(-dt * 0.9));
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    this.rig.offset.set(-s * CAM_DIST, CAM_HEIGHT, c * CAM_DIST);
    const look = this.hero.position.clone().add(new THREE.Vector3(s * LOOK_AHEAD, 0.4, -c * LOOK_AHEAD));
    this.rig.follow(look, this.hero.velocity);
    if (this.cinematic) {
      this.cinematicTime += dt;
      this.rig.jumpToShot(this.cinematic(this.cinematicTime));
    }
    this.rig.update(dt);
    this.stage.focus(this.hero.position);
  }

  /** Camera yaw that looks along the trail a little ahead of Tadeo (0 = north). */
  private trailYaw(s: number): number {
    const t = this.course.tangentAt(s + 6, 9);
    return Math.atan2(t.x, -t.y);
  }

  private checkpoints(): void {
    const cps = this.course.checkpoints;
    for (let i = this.checkpoint + 1; i < cps.length; i++) {
      if (this.playerS < cps[i].s - 1) break;
      this.checkpoint = i;
      const flag = this.set.flags[i];
      activateFlag(flag);
      audio.playSfx("sfx_simon_correct");
      const top = flag.pos.clone().add(new THREE.Vector3(1.6, 3, 0));
      this.bursts.twinkle(top, 30, 2, new THREE.Color(3.2, 2.2, 0.6), 0.38);
      this.fx.pop("Super!", top, this.camera, "#8dff6a", 48);
      void this.ctx.ui.hud.showBanner("Zwischenstation erreicht", "Super!", 1300);
    }
  }

  private impact(pos: THREE.Vector3, dangerous: boolean, water: boolean): void {
    const d = pos.distanceTo(this.hero.position);
    const near = Math.max(0, 1 - d / 22);
    if (water) {
      if (near > 0.1) audio.playSfx("sfx_wave", 0.35 * near, 1.4);
      return;
    }
    if (near > 0.05) {
      audio.playSfx("sfx_dig", 0.9 * near, 0.55);
      audio.playSfx("sfx_enemy_hit", 0.5 * near, 0.5);
    }
    this.rig.addShake(0.55 * near * near);
    const flat = Math.hypot(pos.x - this.hero.position.x, pos.z - this.hero.position.z);
    if (dangerous && this.state === "play" && this.invulnerable <= 0 && flat < HIT_RADIUS) this.hit(pos);
  }

  private whistle(at: THREE.Vector3): void {
    const d = at.distanceTo(this.hero.position);
    if (d < 20) audio.playSfx("sfx_lava_fall", 0.45 * (1 - d / 20), 0.85 + Math.random() * 0.3);
  }

  private status(): void {
    const left = Math.max(0, Math.round(this.course.goalS + 3 - this.playerS));
    const pct = Math.round(this.course.progress(this.playerS) * 100);
    const key = `${left}|${pct}`;
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.statusBar("🌋", pct, `noch ${left} m`);
  }

  /** The status pill with its orange progress bar. */
  statusBar(icon: string, pct: number, label: string): void {
    this.ctx.ui.status(
      `<span>${icon}</span>` +
        `<span style="display:inline-block;width:190px;height:18px;border-radius:9px;background:#6b4a2f;overflow:hidden;box-shadow:inset 0 3px 0 rgba(0,0,0,.3)">` +
        `<span style="display:block;height:100%;width:${pct}%;border-radius:9px;background:linear-gradient(90deg,#ff6a1a,#ffd23f)"></span></span>` +
        `<span>${label}</span>`,
    );
  }

  exit(): void {
    this.ctx.ui.prompt.show(null);
    for (const g of this.ownedGroups) this.disposer.ownMaterials(g);
    this.fx.dispose();
    this.bursts.dispose();
    this.disposer.disposeAll(this.scene, [glowTexture(), puffTexture()]);
    this.stage.dispose();
    this.scene.clear();
  }
}
