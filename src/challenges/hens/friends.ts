/**
 * Tadeo's friends in the yard: Kleine Mia, who waits at the coop, turns to
 * watch Tadeo and jumps for joy whenever a hen comes home; and Pico, who
 * circles above Tadeo with flapping wings, swoops over to show where a hen
 * hides, and chatters his beak while he talks.
 */

import * as THREE from "three";
import { createVillager } from "../../characters/cast";
import { Humanoid, blobShadow } from "../../characters/Humanoid";
import { PicoModel } from "../../characters/Pico";
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

/** Pico's flight: lazy circles above Tadeo, or hovering over a hen he wants to show. */
export class PicoFlyer {
  readonly model = new PicoModel();
  readonly position = new THREE.Vector3();
  /** When set, Pico hovers above this point instead of circling Tadeo. */
  guide: THREE.Vector3 | null = null;
  talking = false;
  private velocity = new THREE.Vector3();
  private target = new THREE.Vector3();
  private t = Math.random() * 10;
  private blink = 2;

  constructor(scene: THREE.Scene) {
    this.model.root.scale.setScalar(1.35);
    scene.add(this.model.root);
  }

  snap(at: THREE.Vector3): void {
    this.position.copy(at).add(new THREE.Vector3(0, 2.6, 0));
    this.velocity.set(0, 0, 0);
  }

  update(dt: number, tadeo: THREE.Vector3): void {
    this.t += dt;
    const t = this.t;
    if (this.guide) {
      this.target.copy(this.guide).add(new THREE.Vector3(Math.sin(t * 2) * 0.5, 2.2 + Math.sin(t * 3) * 0.15, Math.cos(t * 2) * 0.4));
    } else {
      this.target.set(tadeo.x + Math.cos(t * 0.75) * 1.5, tadeo.y + 2.7 + Math.sin(t * 1.3) * 0.25, tadeo.z + Math.sin(t * 0.75) * 1.1);
    }
    const k = this.guide ? 9 : 14;
    this.velocity.addScaledVector(this.target.clone().sub(this.position), k * dt);
    this.velocity.multiplyScalar(Math.exp(-4.2 * dt));
    this.position.addScaledVector(this.velocity, dt);
    this.model.root.position.copy(this.position);
    this.animate(dt);
  }

  private animate(dt: number): void {
    const m = this.model;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.3) {
      const yaw = Math.atan2(this.velocity.x, this.velocity.z);
      let d = yaw - m.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.root.rotation.y += d * Math.min(dt * 6, 1);
    }
    // Reason: flap faster when climbing or speeding, slower glides when hovering
    const rate = 10 + Math.min(speed, 6) * 1.3 + Math.max(this.velocity.y, 0) * 2;
    const flap = Math.sin(this.t * rate) * 0.95;
    m.wingL.rotation.z = 0.3 + flap;
    m.wingR.rotation.z = -0.3 - flap;
    m.body.rotation.x = Math.min(speed * 0.08, 0.45);
    m.body.position.y = Math.sin(this.t * rate) * 0.02;
    m.head.rotation.z = Math.sin(this.t * 0.9) * 0.3;
    this.blink -= dt;
    m.setEyesOpen(this.blink < 0.1 ? 0.1 : 1);
    if (this.blink < 0) this.blink = 1.5 + Math.random() * 3;
    m.beakLower.rotation.x = Math.PI / 2 + 0.2 + (this.talking ? Math.abs(Math.sin(this.t * 16)) * 0.5 : 0);
  }
}
