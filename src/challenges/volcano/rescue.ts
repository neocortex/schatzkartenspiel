/**
 * Paco's rescue: old Käpt'n Paco sits beside the ancient stone with his foot
 * under a fallen rock, waving for help. At the goal Tadeo runs over and heaves
 * the rock off with Space, like the digging in the treasure scene. Then the two
 * talk, Paco brushes aside what the stone is, and he goes ahead to the village.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { createPaco } from "../../characters/cast";
import { Humanoid } from "../../characters/Humanoid";
import { Shot } from "../../core/CameraRig";
import { mulberry32 } from "../../core/noise";
import { LandmarkMaterials } from "../../world/models/effects";
import { ball, emptyModel, rockBlob, stoneFn } from "../../world/models/shapes";
import { Actor } from "../shared/actor";
import type { Altar } from "./altar";
import { Course } from "./course";
import { meshesFromModel } from "./kit/models";
import type { VolcanoChallenge } from "./VolcanoChallenge";

/** Presses of Space it takes to get the rock off Paco's foot. */
export const LIFTS_NEEDED = 6;

/** Paco sits this far from the trail's centre line, to the left of the stone as you come up the path. */
const PACO_SIDE = 5.2;
/** How far back along the trail from the stone he sits. */
const PACO_BACK = 3;
const ROLL_SECONDS = 1.15;
const ROLL_DISTANCE = 3.8;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PacoRescue {
  readonly group = new THREE.Group();
  readonly paco: Actor;
  /** Where Tadeo stands to lift the rock. */
  readonly liftSpot: THREE.Vector2;
  /** Where Paco heads when he goes ahead to the village. */
  readonly exitAt: THREE.Vector2;
  readonly beaconAt: THREE.Vector3;
  /** Camera shots: the two of them with the stone behind, and the hollow alone. */
  readonly wideShot: Shot;
  readonly stoneShot: Shot;
  readonly promptAt: THREE.Vector3;
  /** Whom to pose heaving at the rock; set while Tadeo is at it. */
  heaver: Humanoid | null = null;
  lifts = 0;
  free = false;
  private rock = new THREE.Group();
  private home = new THREE.Vector3();
  private rollDir = new THREE.Vector3();
  private tipAxis = new THREE.Vector3();
  /** Strength of the wobble after the last heave, fading to 0. */
  private kick = 0;
  /** Seconds since the rock started rolling away (negative before that). */
  private rolled = -1;
  private time = 0;

  constructor(private course: Course, altar: Altar, materials: LandmarkMaterials) {
    const stoneS = course.trailS(altar.hollowAt.x, altar.hollowAt.z);
    const t = course.tangentAt(stoneS, 5);
    const left = new THREE.Vector2(t.y, -t.x);
    const c = course.pointAt(stoneS).addScaledVector(t, -PACO_BACK).addScaledVector(left, PACO_SIDE);

    // Reason: he looks back down the trail, a little inwards, so whoever comes up the path sees his face
    const look = new THREE.Vector2(-t.x, -t.y).addScaledVector(left, -0.45).normalize();
    const yaw = Math.atan2(look.x, look.y);
    this.paco = new Actor(createPaco(), c.x, c.y, yaw);
    this.paco.ground = (x, z) => course.ground(x, z);
    this.paco.avatar.pose = "sit";
    this.paco.overlay = (h, dt) => this.stuck(h, dt);
    this.paco.addTo(this.group);

    // Local axes of his body: +x is his right leg's side, +z the way he looks
    const right = new THREE.Vector2(look.y, -look.x);
    const local = (x: number, z: number) => c.clone().addScaledVector(right, x).addScaledVector(look, z);

    // Reason: seen from the trail the three stand side by side (Paco, rock, Tadeo), so neither of them hides the other
    const rockAt = local(0.72, 0.82);
    this.home.set(rockAt.x, course.ground(rockAt.x, rockAt.y) + 0.42, rockAt.y);
    this.rock.position.copy(this.home);
    this.buildRock(materials);
    this.group.add(this.rock);

    // It rolls towards the camera and to the side, past Tadeo and clear of the view
    const roll = right.clone().multiplyScalar(0.45).addScaledVector(look, 0.9).normalize();
    this.rollDir.set(roll.x, 0, roll.y);
    this.tipAxis.set(roll.y, 0, -roll.x);

    this.liftSpot = local(2.15, 0.7);
    this.exitAt = local(-6, 7);
    const y = course.ground(c.x, c.y);
    this.beaconAt = new THREE.Vector3(rockAt.x, y, rockAt.y);
    this.promptAt = new THREE.Vector3(rockAt.x, y + 2.1, rockAt.y);

    const camera = local(-1.6, 7);
    const target = local(0.7, 0.5);
    this.wideShot = {
      pos: new THREE.Vector3(camera.x, y + 2.7, camera.y),
      look: new THREE.Vector3(target.x, y + 1.05, target.y),
    };
    const face = new THREE.Vector3(Math.sin(altar.group.rotation.y), 0, Math.cos(altar.group.rotation.y));
    this.stoneShot = {
      pos: altar.hollowAt.clone().addScaledVector(face, 5.2).add(new THREE.Vector3(face.z * 1.3, 0.55, -face.x * 1.3)),
      look: altar.hollowAt.clone().add(new THREE.Vector3(0, -0.15, 0)),
    };
  }

  /** A cooled lava bomb: dark, heavy, cracks still glowing here and there. */
  private buildRock(materials: LandmarkMaterials): void {
    const rand = mulberry32(417);
    const m = emptyModel();
    m.solid.push(rockBlob(53, [0.86, 0.64, 0.76], stoneFn("#4a3f44", 0, rand), 2));
    m.solid.push(rockBlob(59, [0.44, 0.3, 0.4], stoneFn("#5a4c50", 0, rand), 1));
    m.solid[1].translate(0.22, 0.5, -0.07);
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      const up = 0.12 + rand() * 0.55;
      m.pulse.push(ball(0.04 + rand() * 0.04, new THREE.Color(3.6, 1.1, 0.18), [Math.cos(a) * 0.78 * (1 - up * 0.5), up * 0.55, Math.sin(a) * 0.68 * (1 - up * 0.5)], 0));
    }
    this.rock.add(meshesFromModel(m, materials, "paco-rock"));
  }

  /** His pose under the rock: leaning back, one arm tugging at the rock, the other waving for help. */
  private stuck(h: Humanoid, dt: number): void {
    this.time += dt;
    const t = this.time;
    h.legL.rotation.set(-0.95, 0, -0.34);
    h.torso.rotation.x = -0.2 + Math.sin(t * 3) * 0.03;
    h.armL.rotation.set(0, 0, -2.5 + Math.sin(t * 8) * 0.34);
    h.armR.rotation.set(-1.15 + Math.sin(t * 3.1) * 0.16, 0, 0.14);
    h.head.rotation.x = -0.08;
  }

  /** One press of Space. */
  heave(): void {
    this.lifts++;
    this.kick = 1;
  }

  /** The last heave worked: the rock tips over and rolls away, and Paco jumps up. */
  letGo(): void {
    this.rolled = 0;
    this.free = true;
    this.heaver = null;
    const p = this.paco;
    p.overlay = null;
    p.avatar.legL.rotation.z = 0;
    p.avatar.pose = "cheer";
    p.jump(7);
  }

  update(dt: number): void {
    this.paco.update(dt);
    this.kick = Math.max(0, this.kick - dt * 3.4);
    const q = this.rock.quaternion;
    if (this.rolled >= 0) {
      this.rolled += dt;
      const k = Math.min(this.rolled / ROLL_SECONDS, 1);
      const e = 1 - (1 - k) * (1 - k);
      const d = e * ROLL_DISTANCE;
      const x = this.home.x + this.rollDir.x * d;
      const z = this.home.z + this.rollDir.z * d;
      // Two bounces that die away, then it lies still
      const bounce = Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 0.55;
      this.rock.position.set(x, this.course.ground(x, z) + 0.42 + bounce, z);
      q.setFromAxisAngle(this.tipAxis, 0.62 + d / 0.8);
      return;
    }
    // Each press heaves it a little higher, tipping away from Paco; it never sinks back, so no press is ever lost
    const k = this.lifts / LIFTS_NEEDED;
    const wobble = Math.sin(this.kick * Math.PI);
    this.rock.position.copy(this.home).addScaledVector(this.rollDir, k * 0.22);
    this.rock.position.y += k * 0.3 + wobble * 0.13;
    q.setFromAxisAngle(this.tipAxis, k * 0.62 + wobble * 0.1);
    const h = this.heaver;
    if (!h) return;
    // Reason: runs after the hero's own animation, so these arms win over the idle pose
    h.armL.rotation.set(-1.45 - wobble * 0.5, 0, 0.14);
    h.armR.rotation.set(-1.45 - wobble * 0.5, 0, -0.14);
    h.torso.rotation.x = 0.32 + wobble * 0.14;
  }
}

/** Space lifts the rock, the status bar fills; the conversation follows in two beats. */
export async function rescueEnding(c: VolcanoChallenge): Promise<void> {
  const r = c.set.rescue;
  if (!r) return;
  const ui = c.ctx.ui;
  const hero = c.hero;
  const paco = r.paco;

  c.rig.setShot(r.wideShot, 1.8);
  await hero.walkTo(r.liftSpot.x, r.liftSpot.y);
  hero.facing = Math.atan2(r.promptAt.x - hero.position.x, r.promptAt.z - hero.position.z);
  r.heaver = hero.avatar;

  c.statusBar("💪", 0, "Stein heben");
  c.prompt = { at: r.promptAt, verb: "Heben" };
  while (r.lifts < LIFTS_NEEDED) {
    await c.nextSpace();
    r.heave();
    audio.playSfx("sfx_dig", 0.85, 0.5 + r.lifts * 0.05);
    c.rig.addShake(0.16);
    c.bursts.puffs(r.promptAt.clone().setY(r.beaconAt.y + 0.1), 6, "#b9a68c", [0.35, 1.2], 1.3, 0.5, 0.75, 0.75);
    c.statusBar("💪", Math.round((r.lifts / LIFTS_NEEDED) * 100), "Stein heben");
  }
  c.prompt = null;
  await wait(260);

  // It tips over and rolls away
  r.letGo();
  audio.playSfx("sfx_hammer_hit", 0.8, 0.5);
  audio.playSfx("sfx_dig", 0.9, 0.45);
  c.rig.addShake(0.75);
  c.bursts.puffs(r.promptAt.clone().setY(r.beaconAt.y + 0.1), 22, "#b9a68c", [0.5, 2.1], 2.2, 0.9, 1.1, 0.8);
  hero.avatar.pose = "cheer";
  c.celebrate("Geschafft!");
  ui.status(null);
  await wait(ROLL_SECONDS * 1000 + 500);
  hero.avatar.pose = "normal";
  paco.avatar.pose = "normal";

  const turnToEachOther = () => {
    hero.facing = Math.atan2(paco.position.x - hero.position.x, paco.position.z - hero.position.z);
    paco.faceTo(hero.position.x, hero.position.z);
  };
  turnToEachOther();

  // Beat one: who he is, and the stone he would rather not talk about
  let line = 0;
  ui.dialogue.onLine = (speaker) => {
    line++;
    hero.avatar.pose = speaker === "Tadeo" ? "talk" : "normal";
    paco.avatar.pose = speaker === "Tadeo" ? "normal" : "talk";
    if (line === 2) {
      c.rig.setShot(r.stoneShot, 1.3);
      const stone = c.set.altar.hollowAt;
      hero.facing = Math.atan2(stone.x - hero.position.x, stone.z - hero.position.z);
    } else if (line === 3) {
      c.rig.setShot(r.wideShot, 1.1);
      turnToEachOther();
    }
  };
  await ui.say("volcano_paco_thanks");
  hero.avatar.pose = "normal";
  paco.avatar.pose = "normal";
  await wait(600);

  // Beat two: the boat, the way to the village
  ui.dialogue.onLine = (speaker) => {
    hero.avatar.pose = speaker === "Tadeo" ? "talk" : "normal";
    paco.avatar.pose = speaker === "Tadeo" ? "normal" : "talk";
  };
  await ui.say("volcano_paco_boat");
  ui.dialogue.onLine = null;

  // Paco goes ahead; Tadeo waves him off
  paco.avatar.pose = "normal";
  hero.avatar.pose = "cheer";
  hero.facing = Math.atan2(r.exitAt.x - hero.position.x, r.exitAt.y - hero.position.z);
  void paco.walkTo(r.exitAt.x, r.exitAt.y, 3.4);
  await wait(1900);
}
