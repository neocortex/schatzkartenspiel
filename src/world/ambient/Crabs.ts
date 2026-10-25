/**
 * Little red crabs scuttling sideways along the beaches near the focus: short
 * sideways dashes with busy legs, pauses with waving claws, and an about-turn
 * whenever the next step would leave the sand. They dash away when the
 * player comes close. Far-away crabs are recycled to beach spots near the focus.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { Colliders } from "../Colliders";
import { LANDMARKS } from "../layout";
import { CritterMesh } from "./CritterMesh";
import { crabModel } from "./critterModels";
import { CRAB_ANIM } from "./critterAnims";
import { findSpot, rnd } from "./spawn";

const COUNT = 10;
const SPAWN_RADIUS = 30;
const DESPAWN_RADIUS = 42;
/** Crabs closer than this to the player run away. */
const FLEE_RADIUS = 2.6;

interface Crab {
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  dir: number;
  walking: boolean;
  timer: number;
  phase: number;
  scale: number;
}

export class Crabs {
  readonly object: THREE.Object3D;
  private mesh: CritterMesh;
  private crabs: Crab[] = [];
  private spot = new THREE.Vector2();

  constructor(
    private hf: Heightfield,
    private colliders: Colliders | null,
  ) {
    this.mesh = new CritterMesh({ name: "crabs", geometry: crabModel(), count: COUNT, animate: CRAB_ANIM, castShadow: true, selfLit: 0.15 });
    this.object = this.mesh.mesh;
    for (let i = 0; i < COUNT; i++) {
      this.crabs.push({ active: false, x: 0, z: 0, yaw: 0, dir: 1, walking: false, timer: 0, phase: 0, scale: 1 });
    }
  }

  private onSand = (x: number, z: number): boolean => {
    const h = this.hf.heightAt(x, z);
    return h > 0.05 && h < 1.3 && this.hf.slopeAt(x, z) < 0.5 && !this.colliders?.hits(x, z, 0.3);
  };

  private isBeach = (x: number, z: number): boolean => {
    const h = this.hf.heightAt(x, z);
    const seaside = Math.hypot(x - LANDMARKS.lake[0], z - LANDMARKS.lake[1]) > 24;
    return seaside && h > 0.15 && h < 1.05 && this.hf.slopeAt(x, z) < 0.45 && this.hf.maskAt(x, z, 0) < 0.3 && !this.colliders?.hits(x, z, 0.4);
  };

  update(dt: number, focus: THREE.Vector3): void {
    let spawns = 0;
    this.crabs.forEach((c, i) => {
      if (c.active && Math.hypot(c.x - focus.x, c.z - focus.z) > DESPAWN_RADIUS) c.active = false;
      if (!c.active) {
        if (spawns++ < 3 && findSpot(focus.x, focus.z, 3, SPAWN_RADIUS, 6, this.isBeach, this.spot)) {
          Object.assign(c, { active: true, x: this.spot.x, z: this.spot.y, yaw: rnd(-Math.PI, Math.PI), walking: false, timer: rnd(0.2, 2), scale: rnd(1.0, 1.35) });
        } else {
          this.mesh.hide(i);
          return;
        }
      }
      this.step(c, i, dt, focus);
    });
    this.mesh.commit();
  }

  private step(c: Crab, i: number, dt: number, focus: THREE.Vector3): void {
    c.timer -= dt;
    // Startled by the player: dash sideways in whichever direction leads away
    const ax = c.x - focus.x;
    const az = c.z - focus.z;
    const scared = ax * ax + az * az < FLEE_RADIUS * FLEE_RADIUS;
    if (scared) {
      c.dir = Math.cos(c.yaw) * ax - Math.sin(c.yaw) * az >= 0 ? 1 : -1;
      c.walking = true;
      c.timer = Math.max(c.timer, 0.5);
    }
    if (c.walking) {
      // Sideways: crabs walk along their local x axis
      const sx = Math.cos(c.yaw) * c.dir;
      const sz = -Math.sin(c.yaw) * c.dir;
      const speed = scared ? 3.4 : 1.6;
      const nx = c.x + sx * speed * dt;
      const nz = c.z + sz * speed * dt;
      if (this.onSand(nx, nz)) {
        c.x = nx;
        c.z = nz;
      } else c.dir = -c.dir;
      c.phase += dt * 22;
      if (c.timer <= 0) {
        c.walking = false;
        c.timer = rnd(0.8, 3.5);
      }
    } else {
      c.phase += dt * 5;
      if (c.timer <= 0) {
        c.walking = true;
        c.timer = rnd(0.4, 1.6);
        c.dir = Math.random() < 0.5 ? -1 : 1;
        if (Math.random() < 0.35) c.yaw += rnd(-0.9, 0.9);
      }
    }
    const bob = c.walking ? Math.abs(Math.sin(c.phase)) * 0.02 : 0;
    this.mesh.set(i, c.x, this.hf.heightAt(c.x, c.z) + bob, c.z, c.yaw, 0, 0, c.phase, c.scale);
  }
}
