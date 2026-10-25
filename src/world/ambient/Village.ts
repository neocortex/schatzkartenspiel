/**
 * Village life: a handful of hens wandering the plaza — strutting with the
 * typical head bob, stopping to peck at the ground, looking around, scurrying
 * off when the player comes close — and a cat curled up asleep next to the
 * well, gently breathing.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { Colliders } from "../Colliders";
import { P2, VILLAGE } from "../layout";
import { CritterMesh } from "./CritterMesh";
import { catModel, chickenModel } from "./critterModels";
import { CAT_ANIM, CHICKEN_ANIM } from "./critterAnims";
import { findSpot, rnd, turnToward, yawTo } from "./spawn";

const HENS = 6;
/** Hens closer than this to the player scurry away. */
const FLEE_RADIUS = 2;
/** Sunny nap spot just south-west of the well. */
const CAT_SPOT: P2 = [VILLAGE.well[0] - 2.1, VILLAGE.well[1] + 1.7];

const FEATHERS = [
  new THREE.Color(1, 1, 1),
  new THREE.Color(0.78, 0.45, 0.22),
  new THREE.Color(1, 1, 1),
  new THREE.Color(0.32, 0.28, 0.26),
  new THREE.Color(0.95, 0.75, 0.45),
];

/** Places on the plaza the hens keep clear of (well, villagers, the cat). */
const KEEP_CLEAR: { at: P2; r: number }[] = [
  { at: VILLAGE.well, r: 2.6 },
  { at: VILLAGE.elder, r: 1.3 },
  { at: VILLAGE.wiseWoman, r: 1.3 },
  { at: VILLAGE.wiseMan, r: 1.3 },
  { at: CAT_SPOT, r: 1.1 },
];

type HenMode = "walk" | "peck" | "look";

interface Hen {
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  mode: HenMode;
  timer: number;
  phase: number;
  seed: number;
}

export class Village {
  readonly group = new THREE.Group();
  private hens: Hen[] = [];
  private henMesh: CritterMesh;
  private catMesh: CritterMesh;
  private spot = new THREE.Vector2();

  constructor(
    private hf: Heightfield,
    private colliders: Colliders | null,
  ) {
    this.henMesh = new CritterMesh({ name: "hens", geometry: chickenModel(), count: HENS, animate: CHICKEN_ANIM, castShadow: true, selfLit: 0.1 });
    this.catMesh = new CritterMesh({ name: "cat", geometry: catModel(), count: 1, animate: CAT_ANIM, castShadow: true, selfLit: 0.1 });
    this.group.add(this.henMesh.mesh, this.catMesh.mesh);
    for (let i = 0; i < HENS; i++) {
      const h: Hen = { x: 0, z: 0, yaw: rnd(-Math.PI, Math.PI), tx: 0, tz: 0, mode: "look", timer: rnd(0, 2), phase: 0, seed: Math.random() * 100 };
      this.pickTarget(h);
      h.x = h.tx;
      h.z = h.tz;
      this.hens.push(h);
      this.henMesh.setLook(i, FEATHERS[i % FEATHERS.length]);
    }
  }

  private isFree = (x: number, z: number): boolean =>
    KEEP_CLEAR.every((k) => Math.hypot(x - k.at[0], z - k.at[1]) > k.r) && !this.colliders?.hits(x, z, 0.3);

  private pickTarget(h: Hen): void {
    const [px, pz] = VILLAGE.plaza;
    if (findSpot(px, pz, 0, VILLAGE.plazaRadius + 1, 12, this.isFree, this.spot)) {
      h.tx = this.spot.x;
      h.tz = this.spot.y;
    }
  }

  update(dt: number, time: number, focus: THREE.Vector3): void {
    this.hens.forEach((h, i) => this.stepHen(h, i, dt, time, focus));
    this.henMesh.commit();
    const [cx, cz] = CAT_SPOT;
    // Reason: yaw -0.5 turns the sleepy face south, towards the usual camera position
    this.catMesh.set(0, cx, this.hf.heightAt(cx, cz), cz, -0.5, 0, 0, time * 1.6, 1.25);
    this.catMesh.commit();
  }

  private stepHen(h: Hen, i: number, dt: number, t: number, focus: THREE.Vector3): void {
    h.timer -= dt;
    // Startled by the player: scurry off a few steps in the opposite direction
    const ax = h.x - focus.x;
    const az = h.z - focus.z;
    const d = Math.hypot(ax, az);
    const scared = d < FLEE_RADIUS;
    if (scared && (h.mode !== "walk" || Math.hypot(h.tx - focus.x, h.tz - focus.z) < FLEE_RADIUS + 1)) {
      const tx = h.x + (ax / Math.max(d, 0.01)) * 3;
      const tz = h.z + (az / Math.max(d, 0.01)) * 3;
      const onPlaza = Math.hypot(tx - VILLAGE.plaza[0], tz - VILLAGE.plaza[1]) < VILLAGE.plazaRadius + 2;
      if (onPlaza && this.isFree(tx, tz)) {
        h.tx = tx;
        h.tz = tz;
      } else this.pickTarget(h);
      h.mode = "walk";
      h.timer = 3;
    }
    let head = 0;
    let bob = 0;
    if (h.mode === "walk") {
      const left = Math.hypot(h.tx - h.x, h.tz - h.z);
      h.yaw = turnToward(h.yaw, yawTo(h.x, h.z, h.tx, h.tz), (scared ? 9 : 5) * dt);
      const speed = scared ? 2.4 : 0.9;
      const nx = h.x + Math.sin(h.yaw) * speed * dt;
      const nz = h.z + Math.cos(h.yaw) * speed * dt;
      if (this.isFree(nx, nz)) {
        h.x = nx;
        h.z = nz;
      } else this.pickTarget(h);
      h.phase += dt * (scared ? 18 : 9);
      // The chicken strut: head jerks forward and back with every step
      head = Math.sin(h.phase) * 0.18;
      bob = Math.abs(Math.sin(h.phase)) * 0.03;
      if (left < 0.2 || h.timer <= 0) this.nextMode(h);
    } else if (h.mode === "peck") {
      const k = (t * 2.4 + h.seed) % 1;
      head = THREE.MathUtils.smoothstep(k, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(k, 0.45, 0.75)) * 1.15;
      if (h.timer <= 0) this.nextMode(h);
    } else {
      // Looking around in little jerks
      head = -0.15;
      if (Math.sin(t * 3 + h.seed * 5) > 0.97) h.yaw += rnd(-0.5, 0.5);
      if (h.timer <= 0) this.nextMode(h);
    }
    this.henMesh.set(i, h.x, this.hf.heightAt(h.x, h.z) + bob, h.z, h.yaw, 0, 0, head, 1.3);
  }

  private nextMode(h: Hen): void {
    const r = Math.random();
    if (r < 0.45) {
      h.mode = "walk";
      h.timer = rnd(3, 7);
      this.pickTarget(h);
    } else if (r < 0.8) {
      h.mode = "peck";
      h.timer = rnd(1.5, 4);
    } else {
      h.mode = "look";
      h.timer = rnd(1, 3);
    }
  }
}
