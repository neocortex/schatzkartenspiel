/**
 * Quest 10 — the sea crossing. Tadeo sails his mended boat from the north
 * dock towards the treasure island on the horizon: ← → dodge sea stacks and
 * giant waves while collecting the trail of glowing starfish. Then a giant
 * angry shark circles the boat; three well-timed magic berries thrown into its
 * open mouth (Space when the ring turns green) make it lieb again, it swims off
 * happy, and the boat runs aground on the treasure island's beach. No failure:
 * hits and misses only splash Tadeo.
 */

import * as THREE from "three";
import { Engine, PostSettings } from "../../core/Engine";
import { audio } from "../../audio/Audio";
import { DIALOGUES } from "../../data/dialogues";
import { createSkyDome, Clouds, DAY_SKY } from "../../world/Sky";
import { SignAtlas } from "../../world/models/signs";
import { Challenge, ChallengeContext } from "../types";
import { Bin, Timeline, until, modelMaterials, ModelMaterials, lerp, ease, hump } from "../ogre/kit";
import { Fx } from "../ogre/fx";
import { Director } from "../ogre/director";
import { Popups } from "../ogre/popups";
import { Ocean, oceanUniforms, OceanUniforms, MAX_ISLES } from "./ocean";
import { Wake } from "./wake";
import { Course, COURSE_END, LANE, CourseHit } from "./course";
import { Scenery, LANDING_Z } from "./scenery";
import { Boat } from "./boat";
import { Gulls } from "./gulls";
import { Hearts } from "./hearts";
import { createShark, Shark } from "../../characters/Shark";
import { SharkFight } from "./sharkFight";
import { SeaUI, STARFISH_ICON } from "./seaUI";

export type SeaPhase = "intro" | "sail" | "shark" | "arrive" | "done";

const CRUISE = 9;

export class SeaChallenge implements Challenge {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2200);
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 0.65,
    bloomThreshold: 0.9,
    tiltShift: false,
    saturation: 0.1,
    contrast: 0.05,
    vignette: 0.35,
  };
  readonly finished: Promise<void>;
  phase: SeaPhase = "intro";
  starfish = 0;

  private resolve!: () => void;
  private engine!: Engine;
  private bin = new Bin();
  private tl = new Timeline();
  private fx = new Fx(this.bin);
  private cam = new Director(this.camera);
  private popups: Popups;
  private seaUI: SeaUI;
  private sunDir = new THREE.Vector3(-0.35, 0.75, -0.55).normalize();
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private clouds = new Clouds(18, 12);
  private uniforms: OceanUniforms;
  private ocean: Ocean;
  private wake: Wake;
  private mats: ModelMaterials;
  private atlas = new SignAtlas();
  private scenery: Scenery;
  private course: Course;
  private boat: Boat;
  private gulls = new Gulls(6);
  private shark: Shark = createShark();
  private hearts = new Hearts(this.camera);
  private fight: SharkFight;
  private isles = 0;
  private sceneTime = 0;
  private stepDt = 0;
  private timeScale = 1;
  private slowLeft = 0;
  private hitStopLeft = 0;
  /** Target forward speed and (when not steered by the player) target x. */
  private cruise = 0;
  private autoX: number | null = null;
  private chase = false;
  /** Tadeo's walk state once he is ashore. */
  private heroMotion = { speed: 0, grounded: true, vy: 0 };

  constructor(private ctx: ChallengeContext) {
    this.finished = new Promise((r) => (this.resolve = r));
    const scene = this.scene;
    this.popups = new Popups(ctx.ui.layer, this.camera);
    this.seaUI = new SeaUI(ctx.ui, this.camera);
    this.mats = modelMaterials(this.bin);
    this.bin.texture(this.atlas.texture);
    this.bin.material(this.atlas.material);

    scene.fog = new THREE.Fog(DAY_SKY.horizon.clone(), 160, 1050);
    this.sky = createSkyDome(this.sunDir);
    // Reason: sky and cloud materials are created per call, so this challenge owns (and frees) them
    this.sky.userData.ownMaterial = true;
    this.clouds.group.traverse((o) => (o.userData.ownMaterial = true));
    scene.add(this.sky, this.clouds.group);
    scene.add(new THREE.HemisphereLight("#d6ecff", "#3d7fa8", 1.15));
    this.sun = new THREE.DirectionalLight("#fff1dc", 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -22;
    sc.right = sc.top = 22;
    sc.near = 1;
    sc.far = 140;
    scene.add(this.sun, this.sun.target);

    this.uniforms = oceanUniforms(this.sunDir);
    this.ocean = new Ocean(this.uniforms, DAY_SKY.horizon);
    this.bin.material(this.ocean.material);
    this.wake = new Wake(this.uniforms.uTime);
    const addIsle = (x: number, z: number, rx: number, rz: number, slope: number) => {
      if (this.isles >= MAX_ISLES) return;
      this.uniforms.uIsles.value[this.isles].set(x, z, rx, rz);
      this.uniforms.uIsleSlope.value[this.isles] = slope;
      this.isles++;
    };
    this.scenery = new Scenery(this.bin, this.mats, this.fx, addIsle);
    this.course = new Course(this.bin, this.mats, this.fx, this.uniforms);
    for (const r of this.course.rocks) addIsle(r.x, r.z, r.r * 0.95, r.r * 0.9, 0.6);
    this.atlas.draw();
    this.boat = new Boat(this.atlas, this.mats, this.fx);
    this.shark.root.visible = false;
    scene.add(this.ocean.mesh, this.wake.mesh, this.scenery.group, this.course.group, this.boat.root, this.gulls.group, this.shark.root, this.hearts.group, this.fx.group);

    this.fight = new SharkFight(
      {
        tl: this.tl,
        boat: this.boat,
        shark: this.shark,
        fx: this.fx,
        hearts: this.hearts,
        cam: this.cam,
        pop: this.popups,
        ui: this.seaUI,
        input: () => this.engine.input,
        dt: () => this.stepDt,
        slowmo: (scale, s) => {
          this.timeScale = scale;
          this.slowLeft = s;
        },
        hitStop: (s) => (this.hitStopLeft = Math.max(this.hitStopLeft, s)),
        onFeed: (n) => this.seaUI.showFeeds(n),
      },
      this.bin,
      scene,
    );
    this.cam.drift = 0.12;
    this.cam.cut(new THREE.Vector3(-7, 3.0, -12), new THREE.Vector3(0.5, 2.2, 4));
  }

  /** Live state for the E2E test (it only reads this to decide which keys to press). */
  get e2e() {
    return {
      challenge: "sea",
      phase: this.phase,
      x: this.boat.x,
      z: this.boat.z,
      safe: this.course.nextSafe(this.boat.z),
      leaping: this.fight.leaping,
      ringNow: this.fight.ringNow,
      throws: this.fight.throws,
      mood: this.shark.mood,
      starfish: this.starfish,
    };
  }

  enter(engine: Engine): void {
    this.engine = engine;
    void this.run();
  }

  exit(): void {
    this.popups.clear();
    this.seaUI.destroy();
    this.ctx.ui.status(null);
    this.bin.dispose(this.scene);
  }

  update(dt: number): void {
    let sdt = dt * this.timeScale;
    if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      if (this.slowLeft <= 0) this.timeScale = 1;
    }
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= dt;
      sdt = dt * 0.03;
    }
    this.stepDt = sdt;
    this.sceneTime += sdt;
    const t = this.sceneTime;
    this.uniforms.uTime.value = t;
    this.mats.time.value = t;
    this.tl.update(sdt);
    this.sail(sdt);

    const b = this.boat.root.position;
    const yaw = this.boat.root.rotation.y;
    this.boat.update(sdt, t);
    if (!this.boat.aboard) this.boat.hero.update(sdt, this.heroMotion);
    this.uniforms.uBoat.value.set(b.x, b.z, yaw, this.boat.aground > 0.5 ? 0 : 1);
    this.wake.update(sdt, b.x + Math.sin(yaw) * 2.3, b.z + Math.cos(yaw) * 2.3, -Math.sin(yaw), -Math.cos(yaw), this.boat.speed / CRUISE);
    this.gulls.update(sdt, b);
    this.shark.update(sdt);
    this.hearts.update(sdt);
    this.fight.update(sdt);
    this.scenery.update(sdt);
    this.clouds.update(sdt);
    this.fx.update(sdt);
    this.popups.update(dt);
    if (this.chase) this.cam.move(new THREE.Vector3(b.x * 0.6, 6.0, b.z + 12.5), new THREE.Vector3(b.x * 0.85, 0.6, b.z - 10), 0.3);
    this.cam.update(dt);
    // Sky, clouds, ocean grid and sun shadows follow the camera / boat
    this.sky.position.copy(this.camera.position);
    this.clouds.group.position.set(this.camera.position.x, 0, this.camera.position.z - 150);
    this.ocean.follow(this.camera.position.x, this.camera.position.z);
    this.sun.target.position.set(b.x, 0, b.z - 4);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 70);
  }

  /** Forward motion, steering, the obstacle course and the starfish trail. */
  private sail(dt: number): void {
    const boat = this.boat;
    boat.speed += (this.cruise - boat.speed) * Math.min(dt * 1.2, 1);
    const input = this.engine?.input;
    let steer = 0;
    if (this.phase === "sail" && input && !this.ctx.ui.dialogue.isOpen) steer = (input.isDown("ArrowRight") ? 1 : 0) - (input.isDown("ArrowLeft") ? 1 : 0);
    else if (this.autoX !== null) steer = THREE.MathUtils.clamp((this.autoX - boat.x) * 0.5, -1, 1);
    boat.vx += (steer * 7 - boat.vx) * Math.min(dt * 4, 1);
    const p = boat.root.position;
    p.x += boat.vx * dt;
    if (Math.abs(p.x) > LANE) {
      p.x = Math.sign(p.x) * LANE;
      boat.vx = 0;
    }
    p.z -= boat.speed * dt;
    boat.root.rotation.y = lerp(boat.root.rotation.y, -boat.vx * 0.045, Math.min(dt * 5, 1));
    const res = this.course.update(dt, this.sceneTime, p.x, p.z, this.phase === "sail");
    if (this.phase !== "sail") return;
    for (const hit of res.hits) this.onHit(hit);
    for (const at of res.starfish) {
      this.starfish++;
      this.fx.stars(at, 8);
      this.fx.glow.emit({ at, count: 1, speed: [0, 0], life: [0.25, 0.25], size: [1.2, 2.4], color: "#ffb070", intensity: 2 });
      audio.playSfx("sfx_berry_collect", 0.55, 1 + (this.starfish % 5) * 0.06);
    }
    this.seaUI.setVoyage(-p.z / -LANDING_Z, this.starfish);
  }

  private onHit(hit: CourseHit): void {
    const boat = this.boat;
    this.fx.splash(hit.at, hit.kind === "wave" ? 2.0 : 1.3);
    boat.bump(hit.kind === "wave" ? 1.0 : 0.6);
    boat.vx = hit.push * 7;
    boat.speed *= 0.45;
    this.cam.shake(0.6);
    audio.playSfx(hit.kind === "wave" ? "sfx_wave" : "sfx_hit_damage", 0.7);
    const head = boat.hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 2.2, 0));
    this.popups.show(hit.kind === "wave" ? "Platsch!" : "Bumm!", head, { color: "#7fdcff", size: 64 });
  }

  private async run(): Promise<void> {
    const ui = this.ctx.ui;
    const { tl, boat, cam, fight, seaUI } = this;
    // Intro: the boat at the pier, the home island and its volcano behind
    audio.playMusic("music_overworld");
    cam.move(new THREE.Vector3(-9, 4.2, -15.5), new THREE.Vector3(0.5, 3.2, 6), 7);
    await tl.wait(1.6);
    await ui.say(DIALOGUES.sea_crossing);
    this.chase = true;
    this.cruise = CRUISE;
    seaUI.showVoyage();
    seaUI.showHint(`<span class="key">←</span><span class="key">→</span> lenken · folge den Seesternen <span class="sea-hint-fish">${STARFISH_ICON}</span>`);
    this.phase = "sail";
    await ui.hud.showBanner("Ahoi!", "Auf zur Schatzinsel!", 1800);
    await tl.wait(5);
    seaUI.showHint(null);
    await until(tl, () => boat.z < COURSE_END);

    // The giant shark
    this.phase = "shark";
    this.cruise = 0;
    this.chase = false;
    audio.playMusic("music_combat");
    const b = boat.root.position;
    cam.move(new THREE.Vector3(b.x - 5, 4.5, b.z + 9), new THREE.Vector3(b.x + 2, 0.5, b.z - 14), 2);
    const arrive = fight.arrive();
    await tl.wait(1.4);
    // Reason: Tadeo takes the berries out as he says his line, so "Hier, Hai!" has something to show
    ui.dialogue.onLine = (speaker) => {
      if (speaker === "Tadeo") this.raiseBerries();
    };
    await ui.say(DIALOGUES.sea_shark);
    ui.dialogue.onLine = null;
    await arrive;
    seaUI.showFeeds(0);
    await ui.hud.showBanner("Riesenhai!", "Wirf die Beeren in sein Maul!", 1800);
    seaUI.showHint(`Warte auf den <b>grünen</b> Ring, dann <span class="key">Leertaste</span>!`);
    const hide = tl.wait(9).then(() => seaUI.showHint(null));
    await fight.run();
    void hide;
    seaUI.showHint(null);
    audio.playSfx("sfx_victory_fanfare", 0.7);
    audio.playMusic("music_overworld");
    await fight.farewell();
    await ui.say(DIALOGUES.shark_defeat.slice(0, 1));
    await this.arrive();
    this.phase = "done";
    this.resolve();
  }

  /** Tadeo stands up and holds the magic berries high. */
  private raiseBerries(): void {
    const { boat } = this;
    boat.berries.visible = true;
    boat.pose = "stand";
    boat.side = 1;
    this.fx.heal(boat.berries.getWorldPosition(new THREE.Vector3()));
    audio.playSfx("sfx_item_get", 0.7);
  }

  /** Sail the last stretch, run aground, hop onto the beach next to the big X. */
  private async arrive(): Promise<void> {
    const ui = this.ctx.ui;
    const { tl, boat, cam, fx } = this;
    this.phase = "arrive";
    boat.berries.visible = false;
    boat.pose = "sit";
    this.seaUI.showVoyage();
    this.chase = true;
    // Land a little east of the X so the boat frames the beach shot instead of blocking it
    this.autoX = 6;
    this.cruise = 7.5;
    await until(tl, () => {
      this.seaUI.setVoyage(-boat.z / -LANDING_Z, this.starfish);
      return boat.z < LANDING_Z + 26;
    });
    this.chase = false;
    cam.move(new THREE.Vector3(boat.x + 10, 3.6, LANDING_Z - 8), new THREE.Vector3(boat.x - 1, 1.6, LANDING_Z + 6), 2.2);
    await until(tl, () => {
      this.cruise = Math.max(1.2, (boat.z - LANDING_Z) * 0.45);
      this.seaUI.setVoyage(-boat.z / -LANDING_Z, this.starfish);
      return boat.z <= LANDING_Z;
    });
    // Scrape onto the sand
    this.cruise = 0;
    boat.speed = 0;
    this.autoX = null;
    audio.playSfx("sfx_dig");
    fx.dust(boat.bowPos().setY(0.6), 1.2, 16, "#f2dc9b");
    cam.shake(0.3);
    await tl.tween(0.6, (k) => (boat.aground = ease.outQuad(k)));
    ui.status(null);
    // Tadeo hops out onto the beach
    const hero = boat.hero;
    boat.aboard = false;
    this.scene.attach(hero.root);
    hero.pose = "normal";
    const from = hero.root.position.clone();
    const mark = this.scenery.xMark;
    const ground = this.scenery.treasureGround;
    const land = new THREE.Vector3(boat.x - 0.4, 0, LANDING_Z - 4.2);
    land.y = ground(land.x, land.z);
    hero.root.rotation.set(0, Math.PI, 0);
    const motion = this.heroMotion;
    motion.grounded = false;
    await tl.tween(0.7, (k) => {
      hero.root.position.lerpVectors(from, land, k);
      hero.root.position.y += hump(k) * 1.6;
      motion.vy = k < 0.5 ? 1 : -1;
    });
    motion.grounded = true;
    motion.vy = 0;
    fx.dust(land, 0.6, 10, "#f2dc9b");
    audio.playSfx("sfx_menu_confirm", 0.6);
    // Walk across the X and stop just behind it, so the camera sees both
    const goal = new THREE.Vector3(mark.x + 0.6, mark.y, mark.z - 2.4);
    const start = hero.root.position.clone();
    hero.root.rotation.y = Math.atan2(goal.x - start.x, goal.z - start.z);
    const camAt = new THREE.Vector3(mark.x - 4.5, mark.y + 3.8, mark.z + 7.5);
    cam.move(camAt, new THREE.Vector3(mark.x + 0.3, mark.y + 0.9, mark.z - 1.2), 2.5);
    motion.speed = 3.2;
    await tl.tween(1.8, (k) => {
      hero.root.position.lerpVectors(start, goal, ease.inOut(k));
      hero.root.position.y = ground(hero.root.position.x, hero.root.position.z);
    });
    motion.speed = 0;
    // Turn towards the camera
    hero.root.rotation.y = Math.atan2(camAt.x - goal.x, camAt.z - goal.z);
    await ui.say(DIALOGUES.shark_defeat.slice(1));
    hero.pose = "cheer";
    audio.playMusic("music_victory");
    audio.playSfx("sfx_victory_fanfare");
    fx.stars(hero.root.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 18);
    await ui.hud.showBanner("Geschafft!", "Die Schatzinsel!", 2400);
  }
}
