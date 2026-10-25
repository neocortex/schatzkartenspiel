/**
 * Island life: little red crabs scuttling sideways along the beach (they
 * dash away from Tadeo and dance with waving claws at the party) and a few
 * seagulls lazily circling overhead.
 */

import * as THREE from "three";
import { CritterMesh } from "../../world/ambient/CritterMesh";
import { crabModel, gullModel } from "../../world/ambient/critterModels";
import { CRAB_ANIM, GULL_ANIM } from "../../world/ambient/critterAnims";
import { Ground, X_AT } from "./terrain";
import { BLOCKERS } from "./scenery";

const CRAB_SPOTS: [number, number][] = [[-3.5, 4.6], [1.2, 6.0], [6.2, 5.0], [-7.4, 2.6], [8.8, -1.2], [-9.2, -1.0]];
const GULLS = 7;

interface Crab {
  x: number;
  z: number;
  yaw: number;
  dir: number;
  walking: boolean;
  timer: number;
  phase: number;
  scale: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Critters {
  readonly group = new THREE.Group();
  /** Party mode for the finale: crabs dance on the spot, waving their claws. */
  party = false;
  private crabMesh: CritterMesh;
  private gullMesh: CritterMesh;
  private crabs: Crab[];
  private gulls: { radius: number; omega: number; phase: number; y: number; seed: number }[] = [];

  constructor(private ground: Ground) {
    this.crabMesh = new CritterMesh({ name: "treasure-crabs", geometry: crabModel(), count: CRAB_SPOTS.length, animate: CRAB_ANIM, castShadow: true, selfLit: 0.18 });
    this.gullMesh = new CritterMesh({ name: "treasure-gulls", geometry: gullModel(), count: GULLS, animate: GULL_ANIM, doubleSided: true, selfLit: 0.35 });
    this.group.add(this.crabMesh.mesh, this.gullMesh.mesh);
    this.crabs = CRAB_SPOTS.map(([x, z]) => ({ x, z, yaw: rnd(-3, 3), dir: 1, walking: false, timer: rnd(0.3, 2), phase: rnd(0, 6), scale: rnd(1.1, 1.45) }));
    for (let i = 0; i < GULLS; i++) {
      const radius = rnd(7, 16);
      this.gulls.push({ radius, omega: (i % 3 === 0 ? -1 : 1) * rnd(4, 5.5) / radius, phase: rnd(0, 6.28), y: rnd(9, 15), seed: rnd(0, 100) });
    }
  }

  private onSand = (x: number, z: number): boolean => {
    const h = this.ground.heightAt(x, z);
    return h > 0.04 && h < 0.5 && Math.hypot(x - X_AT.x, z - X_AT.y) > 2.6 && BLOCKERS.every(([bx, bz, r]) => Math.hypot(x - bx, z - bz) > r + 0.2);
  };

  update(dt: number, time: number, tadeo: THREE.Vector3): void {
    this.crabs.forEach((c, i) => this.stepCrab(c, i, dt, tadeo));
    this.crabMesh.commit();
    this.gulls.forEach((g, i) => {
      const th = g.phase + g.omega * time;
      const x = Math.cos(th) * g.radius;
      const z = -3 + Math.sin(th) * g.radius;
      const dir = Math.sign(g.omega);
      const yaw = Math.atan2(-Math.sin(th) * dir, Math.cos(th) * dir);
      const burst = THREE.MathUtils.smoothstep(0.5 + 0.5 * Math.sin(time * 0.45 + g.seed * 7), 0.72, 0.9);
      const wing = 0.1 + burst * 0.6 * Math.sin(time * 7 + g.seed * 3) + (1 - burst) * 0.05 * Math.sin(time * 1.3 + g.seed);
      this.gullMesh.set(i, x, g.y + Math.sin(time * 0.4 + g.seed) * 1.2, z, yaw, 0.05, dir * 0.38, wing, 0.7);
    });
    this.gullMesh.commit();
  }

  private stepCrab(c: Crab, i: number, dt: number, tadeo: THREE.Vector3): void {
    c.timer -= dt;
    const ax = c.x - tadeo.x;
    const az = c.z - tadeo.z;
    const scared = !this.party && ax * ax + az * az < 2.6 * 2.6;
    if (scared) {
      // Dash sideways in whichever direction leads away from Tadeo
      c.dir = Math.cos(c.yaw) * ax - Math.sin(c.yaw) * az >= 0 ? 1 : -1;
      c.walking = true;
      c.timer = Math.max(c.timer, 0.5);
    }
    if (this.party) {
      // Reason: dancing = tiny quick side-steps back and forth while the claws keep waving
      c.phase += dt * 16;
      c.dir = Math.sin(c.phase * 0.25) > 0 ? 1 : -1;
      const nx = c.x + Math.cos(c.yaw) * c.dir * 0.4 * dt;
      const nz = c.z - Math.sin(c.yaw) * c.dir * 0.4 * dt;
      if (this.onSand(nx, nz)) {
        c.x = nx;
        c.z = nz;
      }
    } else if (c.walking) {
      const speed = scared ? 3.4 : 1.5;
      const nx = c.x + Math.cos(c.yaw) * c.dir * speed * dt;
      const nz = c.z - Math.sin(c.yaw) * c.dir * speed * dt;
      if (this.onSand(nx, nz)) {
        c.x = nx;
        c.z = nz;
      } else c.dir = -c.dir;
      c.phase += dt * 22;
      if (c.timer <= 0) {
        c.walking = false;
        c.timer = rnd(0.8, 3.2);
      }
    } else {
      c.phase += dt * 5;
      if (c.timer <= 0) {
        c.walking = true;
        c.timer = rnd(0.4, 1.5);
        c.dir = Math.random() < 0.5 ? -1 : 1;
        if (Math.random() < 0.35) c.yaw += rnd(-0.9, 0.9);
      }
    }
    const hop = this.party ? Math.abs(Math.sin(c.phase * 0.5)) * 0.06 : c.walking ? Math.abs(Math.sin(c.phase)) * 0.02 : 0;
    this.crabMesh.set(i, c.x, this.ground.heightAt(c.x, c.z) + hop, c.z, c.yaw, 0, 0, c.phase, c.scale);
  }
}
