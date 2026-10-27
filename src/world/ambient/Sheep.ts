/**
 * Sheep grazing on the flower hills near the focus: heads down nibbling,
 * now and then looking up, then ambling a few steps to fresh grass. When the
 * player comes close they trot away with a little rocking gait. Far-away
 * sheep are recycled to meadow spots near the focus.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { Colliders } from "../Colliders";
import { REGION_INDEX } from "../regions";
import { CritterMesh } from "./CritterMesh";
import { sheepModel } from "./regionCritterModels";
import { SHEEP_ANIM } from "./critterAnims";
import { findSpot, rnd } from "./spawn";

const COUNT = 8;
const SPAWN_RADIUS = 30;
const DESPAWN_RADIUS = 42;
/** Sheep closer than this to the player trot away. */
const FLEE_RADIUS = 3.2;
const HILLS = REGION_INDEX.hills;

/** Mostly white wool, the odd cream and one black sheep. */
const WOOL = [new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1), new THREE.Color(1, 0.93, 0.8), new THREE.Color(1, 1, 1), new THREE.Color(0.3, 0.28, 0.27)];

interface Grazer {
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  timer: number;
  phase: number;
  seed: number;
  scale: number;
}

export class Sheep {
  readonly object: THREE.Object3D;
  private mesh: CritterMesh;
  private sheep: Grazer[] = [];
  private spot = new THREE.Vector2();

  constructor(
    private hf: Heightfield,
    private colliders: Colliders | null,
  ) {
    this.mesh = new CritterMesh({ name: "sheep", geometry: sheepModel(), count: COUNT, animate: SHEEP_ANIM, castShadow: true, selfLit: 0.12 });
    this.object = this.mesh.mesh;
    for (let i = 0; i < COUNT; i++) {
      this.sheep.push({ active: false, x: 0, z: 0, yaw: 0, speed: 0, timer: 0, phase: 0, seed: Math.random() * 100, scale: 1 });
      this.mesh.setLook(i, WOOL[i % WOOL.length]);
    }
  }

  private isMeadow = (x: number, z: number): boolean =>
    this.hf.regionAt(x, z, HILLS) > 0.5 &&
    this.hf.heightAt(x, z) > 1 &&
    this.hf.slopeAt(x, z) < 0.35 &&
    this.hf.maskAt(x, z, 0) < 0.3 &&
    !this.colliders?.hits(x, z, 0.6);

  update(dt: number, time: number, focus: THREE.Vector3): void {
    let spawns = 0;
    this.sheep.forEach((s, i) => {
      if (s.active && Math.hypot(s.x - focus.x, s.z - focus.z) > DESPAWN_RADIUS) s.active = false;
      if (!s.active) {
        if (spawns++ < 2 && findSpot(focus.x, focus.z, 6, SPAWN_RADIUS, 6, this.isMeadow, this.spot)) {
          Object.assign(s, { active: true, x: this.spot.x, z: this.spot.y, yaw: rnd(-Math.PI, Math.PI), speed: 0, timer: rnd(1, 6), scale: rnd(1.0, 1.2) });
        } else {
          this.mesh.hide(i);
          return;
        }
      }
      this.step(s, i, dt, time, focus);
    });
    this.mesh.commit();
  }

  private step(s: Grazer, i: number, dt: number, t: number, focus: THREE.Vector3): void {
    s.timer -= dt;
    if (Math.hypot(s.x - focus.x, s.z - focus.z) < FLEE_RADIUS && s.speed < 2) {
      s.yaw = Math.atan2(s.x - focus.x, s.z - focus.z) + rnd(-0.4, 0.4);
      s.speed = 2.3;
      s.timer = rnd(1.2, 2);
    }
    if (s.speed > 0) {
      const nx = s.x + Math.sin(s.yaw) * s.speed * dt;
      const nz = s.z + Math.cos(s.yaw) * s.speed * dt;
      if (this.isMeadow(nx, nz)) {
        s.x = nx;
        s.z = nz;
      } else s.yaw += Math.PI * rnd(0.5, 1.5) * dt * 4;
      s.phase += dt * s.speed * 9;
      if (s.timer <= 0) {
        s.speed = 0;
        s.timer = rnd(3, 8);
      }
    } else if (s.timer <= 0) {
      s.speed = 0.55;
      s.timer = rnd(1.5, 3.5);
      s.yaw += rnd(-1, 1);
    }
    // Grazing: head down most of the time, popping up now and then to look around
    const look = Math.pow(Math.max(Math.sin(t * 0.35 + s.seed), 0), 8);
    const graze = s.speed > 0 ? 0.1 : 0.75 * (1 - look) + Math.sin(t * 3 + s.seed) * 0.05;
    const step = Math.sin(s.phase);
    const bob = s.speed > 0 ? Math.abs(step) * 0.04 * Math.min(s.speed, 1.5) : 0;
    this.mesh.set(i, s.x, this.hf.heightAt(s.x, s.z) + bob, s.z, s.yaw, 0, s.speed > 0 ? step * 0.06 : 0, graze, s.scale);
  }
}
