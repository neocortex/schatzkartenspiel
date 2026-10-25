/**
 * MountainChallenge — the climb up the island's highest peak. Builds the
 * scene (sea, foothills, mountain, platforms, summit), runs the flow (intro
 * flight, dialogue, play, summit finale with the golden hammer) and the
 * per-frame game loop: controls, hazards, checkpoints, gentle respawns.
 */

import * as THREE from "three";
import { Challenge, ChallengeContext } from "../types";
import { Engine, PostSettings } from "../../core/Engine";
import { GameUI } from "../../ui/GameUI";
import { DialogueScript } from "../../data/dialogues";
import { audio } from "../../audio/Audio";
import { DAY_SKY } from "../../world/Sky";
import { createWater } from "../../world/Water";
import { createMaterials } from "../../world/models/effects";
import { glowTexture, puffTexture } from "../../world/ambient/textures";
import { Stage } from "../volcano/kit/stage";
import { ScreenFx } from "../volcano/kit/fx";
import { Bursts } from "../volcano/kit/bursts";
import { meshesFromModel, Disposer } from "../volcano/kit/models";
import { Course, SUMMIT_Y, DEPTH } from "./course";
import { createTerrain, baseHeight, Terrain } from "./terrain";
import { buildPlatforms } from "./platforms";
import { Climber, STEP_UP } from "./climber";
import { Hazards, Hit } from "./hazards";
import { Summit } from "./summit";
import { Decor } from "./decor";
import { CheckpointFlag } from "./flags";
import { SpiralCamera, Shot } from "./camera";

type State = "intro" | "play" | "hurt" | "finale" | "done";

const TIP: DialogueScript = [
  { speaker: "Tadeo", portrait: "portrait_tadeo", text: "Mit den Pfeiltasten laufe ich, mit der Leertaste springe ich über Lücken und Steine!" },
  { speaker: "Tadeo", portrait: "portrait_tadeo", text: "Und an Leitern klettere ich mit dem Pfeil nach oben. Los, hinauf!" },
];

const FLAG_COLORS = ["#ff4d4d", "#ffd23f", "#4fc3ff", "#b36bff"];

interface Anim {
  t: number;
  dur: number;
  fn: (k: number) => void;
  done: () => void;
}

export class MountainChallenge implements Challenge {
  readonly name = "mountain";
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2500);
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 0.6,
    bloomThreshold: 0.9,
    tiltShift: false,
    vignette: 0.32,
    saturation: 0.06,
    contrast: 0.05,
  };
  readonly finished: Promise<void>;
  readonly course = new Course();
  readonly climber: Climber;
  readonly hazards: Hazards;
  state: State = "intro";
  /** Index of the last checkpoint reached. */
  checkpoint = 0;
  private resolveFinished!: () => void;
  private engine!: Engine;
  private ui: GameUI;
  private stage: Stage;
  private terrain: Terrain;
  private summit: Summit;
  private decor: Decor;
  private flags: CheckpointFlag[] = [];
  private bursts = new Bursts();
  private fx: ScreenFx;
  private cam: SpiralCamera;
  private disposer = new Disposer();
  private anims: Anim[] = [];
  private timers: { t: number; fn: () => void }[] = [];
  private tmp = new THREE.Vector3();

  constructor(ctx: ChallengeContext) {
    this.ui = ctx.ui;
    this.finished = new Promise((r) => (this.resolveFinished = r));
    this.stage = new Stage({
      sky: { zenith: new THREE.Color("#3a87e2"), horizon: DAY_SKY.horizon.clone(), sunGlow: DAY_SKY.sunGlow.clone() },
      sunDir: new THREE.Vector3(-0.4, 0.8, 0.45),
      sunColor: "#fff1dc",
      sunIntensity: 2.7,
      hemiSky: "#cfe8ff",
      hemiGround: "#6b7d45",
      hemiIntensity: 1.1,
      fog: { color: DAY_SKY.horizon.clone(), near: 160, far: 820 },
      shadowExtent: 28,
      height: baseHeight,
    });
    this.scene = this.stage.scene;
    const world = this.stage.world;

    this.terrain = createTerrain(this.course);
    this.disposer.own(this.terrain.mesh.material as THREE.Material);
    const water = createWater(world, DAY_SKY.horizon);
    this.disposer.own(water.material as THREE.Material);
    this.scene.add(this.terrain.mesh, water);

    const mats = createMaterials(world);
    this.disposer.ownAll(Object.values(mats));
    const model = buildPlatforms(this.course);
    this.summit = new Summit(this.course, model);
    this.disposer.ownAll([this.summit.beamMaterial, this.summit.glowMaterial]);
    this.scene.add(meshesFromModel(model, mats, "mountain-set"), this.summit.group);

    this.decor = new Decor(this.course, this.terrain.height, world);
    this.scene.add(this.decor.group);

    this.course.checkpoints.forEach((cp, i) => {
      const flag = new CheckpointFlag(FLAG_COLORS[i % FLAG_COLORS.length]);
      const y = this.course.support(cp.s, 0.2);
      const th = this.course.theta(cp.s);
      this.course.point(cp.s, this.course.radius(y) - DEPTH / 2 + 0.5, y, flag.group.position);
      flag.group.rotation.y = Math.atan2(-Math.cos(th), -Math.sin(th));
      this.disposer.own(flag.material);
      this.flags.push(flag);
      this.scene.add(flag.group);
    });

    this.climber = new Climber(this.course);
    this.climber.addTo(this.scene);
    this.climber.teleport(this.course.checkpoints[0].s);
    this.climber.onFall = () => this.fell();
    this.hazards = new Hazards(this.course, this.bursts);
    this.scene.add(this.hazards.group, this.bursts.group);
    this.fx = new ScreenFx(this.ui.layer);

    this.cam = new SpiralCamera(this.camera, this.course, this.terrain.height);
    this.cam.snap(this.climber);
    this.flags[0].reach();
  }

  enter(engine: Engine): void {
    this.engine = engine;
    audio.playMusic("music_dungeon");
    this.cam.setShot(this.introShot(), 0);
    this.update(0, 0);
    void this.run();
  }

  // ── Flow ──────────────────────────────────────────────────

  private async run(): Promise<void> {
    await this.wait(1.6);
    await this.ui.say("mountain_enter");
    await this.ui.say(TIP);
    this.cam.setShot(null, 1.4);
    await this.wait(0.6);
    void this.ui.hud.showBanner("Klettere hinauf zum Gipfel!", "Los geht's!", 2000);
    this.state = "play";
  }

  /** Intro flight: close on the floating hammer, out over the sea, down to Tadeo at the foot. */
  private introShot(): (t: number) => Shot {
    const h = this.summit.hammerHome;
    const out = new THREE.Vector3(h.x, 0, h.z).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const a: Shot = { pos: h.clone().addScaledVector(out, 6.8).addScaledVector(side, 2.2).setY(h.y + 1.9), look: h.clone().setY(h.y - 0.1) };
    const th = this.course.theta(this.climber.s);
    const dir = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const b: Shot = { pos: dir.clone().multiplyScalar(70).setY(38), look: new THREE.Vector3(0, 26, 0) };
    const c = this.cam.followShot(this.climber.s, this.climber.y, this.climber.radius);
    const mix = (p: Shot, q: Shot, k: number): Shot => {
      const e = k * k * (3 - 2 * k);
      return { pos: p.pos.clone().lerp(q.pos, e), look: p.look.clone().lerp(q.look, e) };
    };
    return (t) => {
      if (t < 1.8) {
        const o = a.pos.clone().sub(h).applyAxisAngle(new THREE.Vector3(0, 1, 0), t * 0.25).add(h);
        return { pos: o, look: a.look };
      }
      if (t < 4.2) return mix({ pos: a.pos.clone().sub(h).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.45).add(h), look: a.look }, b, (t - 1.8) / 2.4);
      return mix(b, c, Math.min(1, (t - 4.2) / 2.6));
    };
  }

  /** Tadeo reached the plaza: hammer, fanfare, the view, the final words. */
  private async finale(): Promise<void> {
    this.state = "finale";
    this.ui.status(null);
    const c = this.climber;
    c.mode = "auto";
    const from = c.position.clone();
    const to = this.summit.standAt;
    const yaw = Math.atan2(to.x - from.x, to.z - from.z);
    c.avatar.root.rotation.y = yaw;
    // Camera: watch from the side as he crosses the plaza to the pedestal
    const face = this.summit.faceDir;
    const out = face.clone().negate();
    const side = new THREE.Vector3(-face.z, 0, face.x);
    const walk: Shot = {
      pos: to.clone().addScaledVector(out, 2.2).addScaledVector(side, 5.2).setY(SUMMIT_Y + 2.2),
      look: to.clone().addScaledVector(out, 2).setY(SUMMIT_Y + 1),
    };
    this.cam.setShot(() => walk, 1.4);
    await this.animate(1.5, (k) => {
      c.position.lerpVectors(from, to, k);
      c.avatar.root.position.copy(c.position);
      c.avatar.update(1 / 60, { speed: k < 1 ? 4 : 0, grounded: true, vy: 0 });
    });
    // Turn round to face out over the sea and lift the hammer
    c.avatar.root.rotation.y = Math.atan2(-face.x, -face.z);
    const hammer = this.summit.hammer;
    this.summit.taken = true;
    const start = hammer.position.clone();
    const above = to.clone().setY(SUMMIT_Y + 1.72);
    audio.playSfx("sfx_heal", 0.8);
    await this.animate(1.0, (k) => {
      hammer.position.lerpVectors(start, above, k).setY(THREE.MathUtils.lerp(start.y, above.y, k) + Math.sin(k * Math.PI) * 0.8);
      hammer.rotation.y += 0.25;
    });
    hammer.rotation.set(0, c.avatar.root.rotation.y, 0);
    hammer.position.copy(above);
    c.avatar.pose = "holdUp";
    this.fx.flash("#fff3c4", 0.55, 600);
    this.bursts.sparks(above.clone().setY(above.y + 1.2), 60, 7, new THREE.Color(4, 3, 1), 0.3);
    this.bursts.twinkle(above.clone().setY(above.y + 1.2), 40, 2.4, new THREE.Color(3.5, 2.8, 1.2), 0.45);
    audio.playMusic("music_victory", 0.6);
    audio.playSfx("sfx_victory_fanfare", 0.8);
    // Hero shot: from just off the summit, looking up at Tadeo with the hammer, the shrine behind
    this.cam.setShot((t) => {
      const pos = to.clone().addScaledVector(out, 4.6 + t * 0.15).addScaledVector(side, 1.3 + t * 0.1).setY(SUMMIT_Y + 0.9);
      return { pos, look: to.clone().setY(SUMMIT_Y + 1.75) };
    }, 1.0);
    await this.wait(1.2);
    await this.ui.itemGet("hammer");
    // Epic view: over his shoulder, out across the island and the sea
    this.cam.setShot((t) => {
      const pos = to.clone().addScaledVector(out, -5 - t * 0.25).addScaledVector(side, 5.5 + t * 0.15).setY(SUMMIT_Y + 5 + t * 0.12);
      return { pos, look: to.clone().addScaledVector(out, 6).setY(SUMMIT_Y - 1) };
    }, 2.4);
    await this.ui.say("mountain_complete");
    this.state = "done";
    this.resolveFinished();
  }

  // ── Per-frame ─────────────────────────────────────────────

  update(dt: number, time: number): void {
    this.stage.update(time);
    for (const a of [...this.anims]) {
      a.t = Math.min(a.dur, a.t + dt);
      a.fn(a.t / a.dur);
      if (a.t >= a.dur) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.done();
      }
    }
    for (const tm of [...this.timers]) {
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(this.timers.indexOf(tm), 1);
        tm.fn();
      }
    }

    const input = this.engine?.input ?? null;
    const talking = this.ui.dialogue.isOpen;
    const playing = this.state === "play" && !talking;
    if (this.state !== "finale" && this.state !== "done") {
      this.climber.update(talking ? 0 : dt, playing ? input : null);
    } else if (this.state === "done" || this.anims.length === 0) {
      this.climber.avatar.update(dt, { speed: 0, grounded: true, vy: 0 });
      if (this.climber.avatar.pose === "holdUp") this.holdHammerPose();
    }
    if (playing) this.play(dt);
    if (!talking) {
      const hit = this.hazards.update(dt, time, this.climber, playing);
      if (hit) this.hurt(hit);
    }

    for (const f of this.flags) f.update(dt, time);
    this.summit.update(dt, time);
    this.bursts.update(dt);
    this.cam.update(dt, this.climber);
    this.decor.update(dt, time, this.camera, THREE.MathUtils.smoothstep(this.camera.position.y, 22, 32));
    this.lighting();
  }

  private play(dt: number): void {
    const c = this.climber;
    if (c.landed) this.bursts.puffs(c.position.clone().setY(c.position.y + 0.05), 4, "#ece4d8", [0.25, 0.7], 0.8, 0.3, 0.5, 0.6);
    // Checkpoints
    const next = this.course.checkpoints[this.checkpoint + 1];
    if (next && c.s >= next.s && c.grounded) {
      this.checkpoint++;
      const flag = this.flags[this.checkpoint];
      flag.reach();
      this.bursts.twinkle(flag.group.position.clone().setY(flag.group.position.y + 2.4), 30, 2, new THREE.Color(3, 2.6, 1), 0.4);
      audio.playSfx("sfx_simon_correct", 0.8);
      void this.ui.hud.showBanner("Zwischenziel erreicht!", next.name, 1600);
    }
    if (c.s >= this.course.end && c.grounded && c.mode === "walk") {
      void this.finale();
      return;
    }
    this.status();
    void dt;
  }

  private status(): void {
    const top = SUMMIT_Y;
    const h = THREE.MathUtils.clamp(this.climber.y, 0, top);
    const p = Math.round((h / top) * 100);
    this.ui.status(
      `⛰️ <span>${Math.round(h)} m</span>` +
        `<span style="display:inline-block;width:150px;height:14px;border-radius:7px;background:rgba(90,58,34,.22);overflow:hidden;box-shadow:inset 0 2px 0 rgba(0,0,0,.15)">` +
        `<span style="display:block;height:100%;width:${p}%;border-radius:7px;background:linear-gradient(90deg,#6fcf45,#ffd23f)"></span></span>` +
        `<span style="opacity:.75">🏁 ${top} m</span>`,
    );
  }

  /** Arms up a bit more forward so the hands frame the hammer over Tadeo's head. */
  private holdHammerPose(): void {
    const a = this.climber.avatar;
    a.armL.rotation.set(-0.25, 0, -2.75);
    a.armR.rotation.set(-0.25, 0, 2.75);
    this.summit.hammer.position.y = SUMMIT_Y + 1.72 + Math.sin(this.engine.time * 3) * 0.03;
  }

  /** Rotate the sun with the camera so the slope Tadeo climbs is always sunlit. */
  private lighting(): void {
    const p = this.camera.position;
    const az = Math.atan2(p.z, p.x) + 0.85;
    this.stage.sunDir.set(Math.cos(az) * 0.62, 0.78, Math.sin(az) * 0.62).normalize();
    this.stage.focus(this.cam.focus);
  }

  // ── Hits, falls and respawns ──────────────────────────────

  private hurt(hit: Hit): void {
    const c = this.climber;
    this.state = "hurt";
    c.ouch(Math.sign(hit.s - c.s) || 1);
    this.fx.flash("#ff6a5a", 0.45, 420);
    this.fx.pop("Autsch!", this.tmp.copy(c.position).setY(c.position.y + 2.3), this.camera, "#ff8a6a");
    this.bursts.twinkle(c.position.clone().setY(c.position.y + 1.7), 10, 1.0, new THREE.Color(3, 2.6, 0.6), 0.3);
    this.cam.addShake(0.6);
    audio.playSfx("sfx_hit_damage", 0.9);
    this.after(1.1, () => this.respawn(this.course.checkpoints[this.checkpoint].s, 2));
  }

  private fell(): void {
    this.state = "hurt";
    const c = this.climber;
    this.fx.pop("Hoppla!", this.tmp.copy(c.position).setY(c.position.y + 3), this.camera, "#7fd4ff");
    audio.playSfx("sfx_hammer_miss", 0.8, 0.7);
    this.after(0.55, () => this.respawn(c.safeS, 1.2));
  }

  private respawn(s: number, shield: number): void {
    const c = this.climber;
    this.hazards.clear();
    c.teleport(s);
    c.invulnerable = shield;
    this.cam.snap(c);
    const at = c.position.clone().setY(c.position.y + 0.8);
    this.bursts.twinkle(at, 26, 1.6, new THREE.Color(2.4, 2.2, 3.2), 0.35);
    this.bursts.puffs(c.position, 8, "#ffffff", [0.4, 1.2], 1.2, 0.8, 0.9, 0.7);
    audio.playSfx("sfx_heal", 0.6);
    this.state = "play";
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Run `fn(k)` for k = 0 → 1 over `seconds` of game time. */
  private animate(seconds: number, fn: (k: number) => void): Promise<void> {
    return new Promise((done) => this.anims.push({ t: 0, dur: seconds, fn, done }));
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push({ t: seconds, fn });
  }

  private wait(seconds: number): Promise<void> {
    return new Promise((r) => this.after(seconds, r));
  }

  /** Live state for the E2E autopilot (read via `window.engine.scene`). */
  autopilot(): object {
    const c = this.climber;
    return {
      state: this.state,
      talking: this.ui.dialogue.isOpen,
      s: c.s,
      y: c.y,
      vs: c.vs,
      vy: c.vy,
      grounded: c.grounded,
      mode: c.mode,
      invulnerable: c.invulnerable,
      checkpoint: this.checkpoint,
      end: this.course.end,
      gaps: this.course.gaps(),
      steps: this.course.steps(STEP_UP),
      ladders: this.course.ladders,
      hazards: this.hazards.info(),
    };
  }

  exit(): void {
    this.ui.status(null);
    this.fx.dispose();
    this.hazards.dispose();
    this.decor.dispose();
    this.bursts.dispose();
    this.disposer.disposeAll(this.scene, [glowTexture(), puffTexture()]);
    this.stage.dispose();
  }
}
