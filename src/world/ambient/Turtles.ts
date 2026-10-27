/**
 * Sea turtles on the lagoon beaches near the focus: they plod slowly over the
 * sand with paddling flippers, rest a while, and now and then wander into the
 * shallows to swim. When the player comes close they pull their heads in and
 * then plod off the other way. Far-away turtles are recycled near the focus.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { Colliders } from "../Colliders";
import { REGION_INDEX } from "../regions";
import { CritterMesh } from "./CritterMesh";
import { turtleModel } from "./regionCritterModels";
import { TURTLE_ANIM } from "./critterAnims";
import { findSpot, rnd } from "./spawn";

const COUNT = 6;
const SPAWN_RADIUS = 28;
const DESPAWN_RADIUS = 40;
/** Turtles closer than this to the player hide in their shells. */
const SHY_RADIUS = 2.8;
const LAGOON = REGION_INDEX.lagoon;

interface Turtle {
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  walking: boolean;
  timer: number;
  phase: number;
  scale: number;
  /** Seconds left with the head pulled in; below zero it counts the calm time since. */
  hiding: number;
}

export class Turtles {
  readonly object: THREE.Object3D;
  private mesh: CritterMesh;
  private turtles: Turtle[] = [];
  private spot = new THREE.Vector2();

  constructor(
    private hf: Heightfield,
    private colliders: Colliders | null,
  ) {
    this.mesh = new CritterMesh({ name: "turtles", geometry: turtleModel(), count: COUNT, animate: TURTLE_ANIM, castShadow: true, selfLit: 0.1 });
    this.object = this.mesh.mesh;
    for (let i = 0; i < COUNT; i++) {
      this.turtles.push({ active: false, x: 0, z: 0, yaw: 0, walking: false, timer: 0, phase: 0, scale: 1, hiding: -10 });
    }
  }

  private isBeach = (x: number, z: number): boolean => {
    const h = this.hf.heightAt(x, z);
    return (
      h > 0.12 && h < 1.4 && this.hf.regionAt(x, z, LAGOON) > 0.5 && this.hf.slopeAt(x, z) < 0.4 &&
      this.hf.maskAt(x, z, 0) < 0.3 && !this.colliders?.hits(x, z, 0.5)
    );
  };

  /** Sand or shallow lagoon water. */
  private canGo = (x: number, z: number): boolean => {
    const h = this.hf.heightAt(x, z);
    return h > -0.5 && h < 1.6 && this.hf.regionAt(x, z, LAGOON) > 0.3 && this.hf.slopeAt(x, z) < 0.5 && !this.colliders?.hits(x, z, 0.45);
  };

  update(dt: number, focus: THREE.Vector3): void {
    let spawns = 0;
    this.turtles.forEach((t, i) => {
      if (t.active && Math.hypot(t.x - focus.x, t.z - focus.z) > DESPAWN_RADIUS) t.active = false;
      if (!t.active) {
        if (spawns++ < 2 && findSpot(focus.x, focus.z, 4, SPAWN_RADIUS, 6, this.isBeach, this.spot)) {
          Object.assign(t, { active: true, x: this.spot.x, z: this.spot.y, yaw: rnd(-Math.PI, Math.PI), walking: false, timer: rnd(0.5, 4), scale: rnd(1.0, 1.4), hiding: -10 });
        } else {
          this.mesh.hide(i);
          return;
        }
      }
      this.step(t, i, dt, focus);
    });
    this.mesh.commit();
  }

  private step(t: Turtle, i: number, dt: number, focus: THREE.Vector3): void {
    const wasHiding = t.hiding > 0;
    t.hiding -= dt;
    // Startled (at most every few seconds): head in, then plod off away from the player
    if (t.hiding < -3 && Math.hypot(t.x - focus.x, t.z - focus.z) < SHY_RADIUS) {
      t.hiding = 1.6;
      t.walking = false;
      t.yaw = Math.atan2(t.x - focus.x, t.z - focus.z);
    }
    if (t.hiding > 0) {
      // Keep still inside the shell
    } else if (wasHiding) {
      t.walking = true;
      t.timer = rnd(3, 5);
    } else if (t.walking) {
      const nx = t.x + Math.sin(t.yaw) * 0.38 * dt;
      const nz = t.z + Math.cos(t.yaw) * 0.38 * dt;
      if (this.canGo(nx, nz)) {
        t.x = nx;
        t.z = nz;
      } else t.yaw += Math.PI * rnd(0.6, 1.4);
      t.yaw += Math.sin(t.phase * 0.21) * 0.15 * dt;
      t.phase += dt * 4.5;
      t.timer -= dt;
      if (t.timer <= 0) {
        t.walking = false;
        t.timer = rnd(2, 6);
      }
    } else {
      t.timer -= dt;
      if (t.timer <= 0) {
        t.walking = true;
        t.timer = rnd(3, 8);
        t.yaw += rnd(-1.2, 1.2);
      }
    }
    // Reason: in the shallows the turtle swims at the surface instead of walking on the bottom
    const y = Math.max(this.hf.heightAt(t.x, t.z), -0.16);
    const anim = t.hiding > 0 ? -1 : t.phase % (Math.PI * 200);
    this.mesh.set(i, t.x, y, t.z, t.yaw, 0, 0, anim, t.scale);
  }
}
