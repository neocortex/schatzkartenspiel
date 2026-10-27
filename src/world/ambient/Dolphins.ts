/**
 * A small pod of dolphins off the lagoon: they swim a lazy loop in the open
 * sea beyond the lagoon mouth, just under the surface with their fins
 * breaking it now and then, and take turns leaping out in high arcs.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { SPOTS } from "../layout";
import { CritterMesh } from "./CritterMesh";
import { dolphinModel } from "./regionCritterModels";
import { DOLPHIN_ANIM } from "./critterAnims";
import { rnd } from "./spawn";

const COUNT = 3;
const LOOP_RADIUS = 12;
/** Angular speed around the loop (rad/s): about 3.5 units per second. */
const OMEGA = 0.3;
const LEAP_TIME = 1.25;
/** Cruising depth of the body centre. */
const DEPTH = -0.38;

interface Dolphin {
  /** Angle offset on the loop and extra radius, so the pod swims side by side. */
  offset: number;
  lane: number;
  leapStart: number;
  nextLeap: number;
  height: number;
}

export class Dolphins {
  readonly object: THREE.Object3D;
  private mesh: CritterMesh;
  private pod: Dolphin[] = [];
  private cx: number;
  private cz: number;

  constructor(hf: Heightfield) {
    this.mesh = new CritterMesh({ name: "dolphins", geometry: dolphinModel(), count: COUNT, animate: DOLPHIN_ANIM, doubleSided: true, selfLit: 0.15 });
    this.object = this.mesh.mesh;
    // Reason: head out through the lagoon mouth until the whole loop stays over deep sea
    const [lx, lz] = SPOTS.lagoonWater;
    const dir = new THREE.Vector2(SPOTS.lagoonMouth[0] - lx, SPOTS.lagoonMouth[1] - lz).normalize();
    let d = 20;
    while (d < 120 && !Dolphins.deepLoop(hf, lx + dir.x * d, lz + dir.y * d)) d += 2;
    this.cx = lx + dir.x * d;
    this.cz = lz + dir.y * d;
    for (let i = 0; i < COUNT; i++) {
      this.pod.push({ offset: i * 0.22, lane: (i % 2) * 1.6, leapStart: -10, nextLeap: rnd(0.5, 4), height: 1.5 });
    }
  }

  /** True when the sea is deep everywhere along the loop around (cx, cz). */
  private static deepLoop(hf: Heightfield, cx: number, cz: number): boolean {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (hf.heightAt(cx + Math.cos(a) * (LOOP_RADIUS + 4), cz + Math.sin(a) * (LOOP_RADIUS * 0.7 + 4)) > -2.5) return false;
    }
    return true;
  }

  update(time: number): void {
    const speed = OMEGA * LOOP_RADIUS;
    this.pod.forEach((d, i) => {
      const th = time * OMEGA + d.offset;
      const r = LOOP_RADIUS + d.lane;
      const x = this.cx + Math.cos(th) * r;
      const z = this.cz + Math.sin(th) * r * 0.7;
      const yaw = Math.atan2(-Math.sin(th), Math.cos(th) * 0.7);
      if (time >= d.nextLeap) {
        d.leapStart = time;
        d.nextLeap = time + rnd(3, 7);
        d.height = rnd(1.2, 2.0);
      }
      const u = (time - d.leapStart) / LEAP_TIME;
      let y = DEPTH + Math.sin(time * 1.3 + d.offset * 9) * 0.12;
      let pitch = 0;
      if (u < 1) {
        // Parabolic leap from the cruising depth, nose following the arc
        const rise = d.height - DEPTH;
        y = DEPTH + 4 * rise * u * (1 - u);
        pitch = Math.atan2(4 * rise * (1 - 2 * u), speed * LEAP_TIME);
      }
      this.mesh.set(i, x, y, z, yaw, pitch, 0, time * 6 + d.offset * 5, 1);
    });
    this.mesh.commit();
  }
}
