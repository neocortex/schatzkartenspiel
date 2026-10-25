/**
 * Rabbits in the meadows near the focus: they sit with twitching ears, then
 * bound off in a short series of hops, turning back when the next hop would
 * leave the grass; they bolt when the player gets close. Far-away rabbits are
 * recycled to meadow spots near the focus.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { Colliders } from "../Colliders";
import { CritterMesh } from "./CritterMesh";
import { rabbitModel } from "./critterModels";
import { RABBIT_ANIM } from "./critterAnims";
import { findSpot, rnd } from "./spawn";

const COUNT = 6;
const SPAWN_RADIUS = 28;
const DESPAWN_RADIUS = 40;
const HOP_TIME = 0.36;
const HOP_LENGTH = 0.75;
/** Sitting rabbits closer than this to the player bolt. */
const FLEE_RADIUS = 3.5;

const FURS = [new THREE.Color(1, 1, 1), new THREE.Color(0.72, 0.52, 0.36), new THREE.Color(0.62, 0.6, 0.58)];

interface Rabbit {
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  hopsLeft: number;
  hopT: number;
  fromX: number;
  fromZ: number;
  timer: number;
  seed: number;
}

export class Rabbits {
  readonly object: THREE.Object3D;
  private mesh: CritterMesh;
  private rabbits: Rabbit[] = [];
  private spot = new THREE.Vector2();

  constructor(
    private hf: Heightfield,
    private colliders: Colliders | null,
  ) {
    this.mesh = new CritterMesh({ name: "rabbits", geometry: rabbitModel(), count: COUNT, animate: RABBIT_ANIM, castShadow: true, selfLit: 0.1 });
    this.object = this.mesh.mesh;
    for (let i = 0; i < COUNT; i++) {
      this.rabbits.push({ active: false, x: 0, z: 0, yaw: 0, hopsLeft: 0, hopT: 0, fromX: 0, fromZ: 0, timer: 0, seed: Math.random() * 100 });
      this.mesh.setLook(i, FURS[i % FURS.length]);
    }
  }

  private isMeadow = (x: number, z: number): boolean =>
    this.hf.maskAt(x, z, 3) > 0.55 &&
    this.hf.heightAt(x, z) > 1 &&
    this.hf.maskAt(x, z, 1) < 0.3 &&
    this.hf.slopeAt(x, z) < 0.35 &&
    !this.colliders?.hits(x, z, 0.35);

  update(dt: number, time: number, focus: THREE.Vector3): void {
    let spawns = 0;
    this.rabbits.forEach((r, i) => {
      if (r.active && Math.hypot(r.x - focus.x, r.z - focus.z) > DESPAWN_RADIUS) r.active = false;
      if (!r.active) {
        if (spawns++ < 2 && findSpot(focus.x, focus.z, 6, SPAWN_RADIUS, 6, this.isMeadow, this.spot)) {
          Object.assign(r, { active: true, x: this.spot.x, z: this.spot.y, yaw: rnd(-Math.PI, Math.PI), hopsLeft: 0, timer: rnd(0.5, 4) });
        } else {
          this.mesh.hide(i);
          return;
        }
      }
      this.step(r, i, dt, time, focus);
    });
    this.mesh.commit();
  }

  private step(r: Rabbit, i: number, dt: number, t: number, focus: THREE.Vector3): void {
    let lift = 0;
    let pitch = 0;
    let ears: number;
    if (r.hopsLeft > 0) {
      r.hopT += dt / HOP_TIME;
      if (r.hopT >= 1) {
        r.hopsLeft--;
        r.hopT = 0;
        r.fromX = r.x = r.fromX + Math.sin(r.yaw) * HOP_LENGTH;
        r.fromZ = r.z = r.fromZ + Math.cos(r.yaw) * HOP_LENGTH;
        if (r.hopsLeft > 0) this.aimHop(r);
        else r.timer = rnd(1.5, 5);
      } else {
        const u = r.hopT;
        r.x = r.fromX + Math.sin(r.yaw) * HOP_LENGTH * u;
        r.z = r.fromZ + Math.cos(r.yaw) * HOP_LENGTH * u;
        lift = 4 * 0.28 * u * (1 - u);
        // Nose up on take-off, nose down on landing
        pitch = (0.5 - u) * 0.7;
      }
      ears = 0.45;
    } else {
      // Sitting: ears flick now and then, head dips to nibble
      ears = Math.pow(Math.max(Math.sin(t * 2.3 + r.seed), 0), 16) * 0.5;
      pitch = -Math.pow(Math.max(Math.sin(t * 0.7 + r.seed * 3), 0), 6) * 0.25;
      r.timer -= dt;
      const scared = Math.hypot(r.x - focus.x, r.z - focus.z) < FLEE_RADIUS;
      if (r.timer <= 0 || scared) {
        r.hopsLeft = 2 + Math.floor(Math.random() * 5);
        // A startled rabbit bounds straight away from the player
        r.yaw = scared ? Math.atan2(r.x - focus.x, r.z - focus.z) : r.yaw + rnd(-1.2, 1.2);
        r.fromX = r.x;
        r.fromZ = r.z;
        r.hopT = 0;
        this.aimHop(r);
      }
    }
    this.mesh.set(i, r.x, this.hf.heightAt(r.x, r.z) + lift, r.z, r.yaw, pitch, 0, ears, 1.15);
  }

  /** Wiggle the heading a little; turn round if the next landing spot isn't meadow. */
  private aimHop(r: Rabbit): void {
    r.yaw += rnd(-0.35, 0.35);
    const ok = (yaw: number) => this.isMeadow(r.x + Math.sin(yaw) * HOP_LENGTH * 2, r.z + Math.cos(yaw) * HOP_LENGTH * 2);
    if (!ok(r.yaw)) {
      r.yaw += Math.PI + rnd(-0.6, 0.6);
      if (!ok(r.yaw)) {
        r.hopsLeft = 0;
        r.timer = rnd(1, 3);
      }
    }
  }
}
