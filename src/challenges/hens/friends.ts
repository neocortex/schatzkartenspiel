/**
 * Kleine Mia, who waits at the coop, turns to watch Tadeo and jumps for joy
 * whenever a hen comes home. (Chuleta, Tadeo's own hen, comes along as on the
 * island: see characters/Chuleta.ts.)
 */

import * as THREE from "three";
import { createVillager } from "../../characters/cast";
import { Humanoid, blobShadow } from "../../characters/Humanoid";
import { MIA_SPOT } from "./layout";

export class Mia {
  readonly avatar: Humanoid = createVillager(2);
  readonly position = new THREE.Vector3(MIA_SPOT[0], 0, MIA_SPOT[1]);
  private shadow = blobShadow(0.45);
  private cheerT = 0;
  private facing = 0.4;
  /** True while her speech bubble shows (she gestures). */
  talking = false;

  constructor(scene: THREE.Scene) {
    this.avatar.root.position.copy(this.position);
    this.shadow.position.set(this.position.x, 0.03, this.position.z);
    scene.add(this.avatar.root, this.shadow);
  }

  /** Jump for joy for a moment. */
  cheer(seconds = 1.8): void {
    this.cheerT = seconds;
  }

  /** Face a point (cutscenes). */
  faceTowards(x: number, z: number): void {
    this.facing = Math.atan2(x - this.position.x, z - this.position.z);
  }

  update(dt: number, tadeo: THREE.Vector3, watch = true): void {
    this.cheerT = Math.max(0, this.cheerT - dt);
    if (watch) {
      const target = Math.atan2(tadeo.x - this.position.x, tadeo.z - this.position.z);
      let d = target - this.avatar.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.avatar.root.rotation.y += d * Math.min(dt * 4, 1);
    } else {
      this.avatar.root.rotation.y = this.facing;
    }
    this.avatar.pose = this.cheerT > 0 ? "cheer" : this.talking ? "talk" : "normal";
    this.avatar.update(dt, { speed: 0, grounded: true, vy: 0 });
  }
}
