/**
 * Parrots over the jungle near the focus: bright red, green, blue and orange
 * birds flapping figure-eight loops above the tree tops, now and then gliding
 * over to another tree. They only appear where the jungle is.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { REGION_INDEX } from "../regions";
import { CritterMesh } from "./CritterMesh";
import { parrotModel } from "./regionCritterModels";
import { FLAP_ANIM } from "./critterAnims";
import { findSpot, rnd, wrapAngle } from "./spawn";

const COUNT = 6;
const SPAWN_RADIUS = 26;
const DESPAWN_RADIUS = 48;
const JUNGLE = REGION_INDEX.jungle;

const FEATHERS = [
  new THREE.Color(1.0, 0.16, 0.1),
  new THREE.Color(0.2, 0.78, 0.25),
  new THREE.Color(0.25, 0.5, 1.0),
  new THREE.Color(1.0, 0.6, 0.1),
];

interface Parrot {
  active: boolean;
  /** Centre of the current loop, and the tree it is gliding over to. */
  cx: number;
  cz: number;
  tx: number;
  tz: number;
  y: number;
  radius: number;
  omega: number;
  theta: number;
  timer: number;
  yaw: number;
  roll: number;
  seed: number;
}

export class Parrots {
  readonly object: THREE.Object3D;
  private mesh: CritterMesh;
  private parrots: Parrot[] = [];
  private spot = new THREE.Vector2();

  constructor(private hf: Heightfield) {
    this.mesh = new CritterMesh({ name: "parrots", geometry: parrotModel(), count: COUNT, animate: FLAP_ANIM, doubleSided: true, selfLit: 0.25 });
    this.object = this.mesh.mesh;
    for (let i = 0; i < COUNT; i++) {
      this.parrots.push({ active: false, cx: 0, cz: 0, tx: 0, tz: 0, y: 0, radius: 4, omega: 1, theta: 0, timer: 0, yaw: 0, roll: 0, seed: Math.random() * 100 });
      this.mesh.setLook(i, FEATHERS[i % FEATHERS.length]);
    }
  }

  private isJungle = (x: number, z: number): boolean => this.hf.regionAt(x, z, JUNGLE) > 0.6 && this.hf.heightAt(x, z) > 0.5;

  /** Flight height over a loop centre: a little above the highest ground nearby, at tree-top level. */
  private canopy(x: number, z: number): number {
    let ground = this.hf.heightAt(x, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ground = Math.max(ground, this.hf.heightAt(x + Math.cos(a) * 6, z + Math.sin(a) * 6));
    }
    return ground + rnd(5, 7);
  }

  update(dt: number, time: number, focus: THREE.Vector3): void {
    let spawns = 0;
    this.parrots.forEach((p, i) => {
      if (p.active && Math.hypot(p.cx - focus.x, p.cz - focus.z) > DESPAWN_RADIUS) p.active = false;
      if (!p.active) {
        if (spawns++ < 2 && findSpot(focus.x, focus.z, 4, SPAWN_RADIUS, 6, this.isJungle, this.spot)) {
          const { x, y: z } = this.spot;
          Object.assign(p, { active: true, cx: x, cz: z, tx: x, tz: z, y: this.canopy(x, z), radius: rnd(3, 6) });
          Object.assign(p, { omega: (Math.random() < 0.5 ? -1 : 1) * rnd(0.9, 1.3), theta: rnd(0, 6.3), timer: rnd(6, 14) });
        } else {
          this.mesh.hide(i);
          return;
        }
      }
      this.step(p, i, dt, time);
    });
    this.mesh.commit();
  }

  private step(p: Parrot, i: number, dt: number, t: number): void {
    p.timer -= dt;
    if (p.timer <= 0) {
      p.timer = rnd(6, 14);
      if (findSpot(p.cx, p.cz, 8, 18, 6, this.isJungle, this.spot)) {
        p.tx = this.spot.x;
        p.tz = this.spot.y;
      }
    }
    // Glide the loop over to the next tree
    const k = Math.min(dt * 0.5, 1);
    p.cx += (p.tx - p.cx) * k;
    p.cz += (p.tz - p.cz) * k;
    p.theta += p.omega * dt;
    // Figure eight (lemniscate of Gerono) around the loop centre
    const s = Math.sin(p.theta);
    const x = p.cx + s * p.radius;
    const z = p.cz + s * Math.cos(p.theta) * p.radius * 1.2;
    const y = p.y + Math.sin(p.theta * 2 + p.seed) * 0.6;
    // Heading along the curve's velocity (its derivative with respect to time)
    const yaw = Math.atan2(Math.cos(p.theta) * p.radius * p.omega, Math.cos(2 * p.theta) * p.radius * 1.2 * p.omega);
    // Bank into the turn, smoothed so the bird rolls gently
    const turn = wrapAngle(yaw - p.yaw) / Math.max(dt, 1e-3);
    p.roll += (THREE.MathUtils.clamp(-turn * 0.18, -0.6, 0.6) - p.roll) * Math.min(dt * 4, 1);
    p.yaw = yaw;
    const wing = 0.2 + 0.9 * Math.sin(t * Math.PI * 2 * 6 + p.seed);
    this.mesh.set(i, x, y, z, yaw, 0.1, p.roll, wing, 1.6);
  }
}
