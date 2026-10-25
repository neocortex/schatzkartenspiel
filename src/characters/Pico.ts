/**
 * Pico — Tadeo's scarlet macaw. Flies along beside him with flapping wings,
 * lands on his head when he stands still, tilts his head curiously and
 * opens his beak while talking.
 */

import * as THREE from "three";
import { Humanoid } from "./Humanoid";
import { mat, toonMesh } from "./parts";

const RED = "#e8343c";
const YELLOW = "#ffc83d";
const BLUE = "#2f6fde";
const TEAL = "#2fb8c9";

/** The parrot model: body, head with beak and eyes, two wings and a long tail. */
export class PicoModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly wingL = new THREE.Group();
  readonly wingR = new THREE.Group();
  readonly beakLower: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];

  constructor() {
    this.root.add(this.body);
    const torso = toonMesh(new THREE.SphereGeometry(0.15, 18, 14), mat(RED, 0.55));
    torso.scale.set(0.9, 1.15, 1);
    torso.position.y = 0.16;
    this.body.add(torso);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), mat("#ff6b5b", 0.6));
    belly.position.set(0, 0.13, 0.06);
    this.body.add(belly);

    // Head with white face patch, big eyes and a hooked beak
    this.head.position.set(0, 0.36, 0.03);
    this.body.add(this.head);
    this.head.add(toonMesh(new THREE.SphereGeometry(0.12, 18, 14), mat(RED, 0.55)));
    for (const side of [-1, 1]) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), mat("#fff4ea", 0.7));
      patch.scale.set(1, 1, 0.5);
      patch.position.set(side * 0.075, 0.0, 0.07);
      this.head.add(patch);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), mat("#1a1210", 0.2));
      eye.position.set(side * 0.085, 0.02, 0.088);
      this.head.add(eye);
      this.eyes.push(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), mat("#ffffff", 0.2, 1.2));
      glint.position.set(side * 0.08 + 0.008, 0.035, 0.115);
      this.head.add(glint);
    }
    const upper = toonMesh(new THREE.ConeGeometry(0.055, 0.13, 12), mat("#f3e7d3", 0.4));
    upper.rotation.x = Math.PI / 2 + 0.6;
    upper.position.set(0, -0.015, 0.13);
    this.head.add(upper);
    this.beakLower = toonMesh(new THREE.ConeGeometry(0.035, 0.07, 10), mat("#2a2420", 0.4));
    this.beakLower.rotation.x = Math.PI / 2 + 0.2;
    this.beakLower.position.set(0, -0.05, 0.1);
    this.head.add(this.beakLower);
    const crest = toonMesh(new THREE.ConeGeometry(0.04, 0.1, 8), mat(RED, 0.55));
    crest.rotation.x = -0.6;
    crest.position.set(0, 0.11, -0.04);
    this.head.add(crest);

    // Wings pivot at the shoulder; rotate around z to flap
    for (const [wing, side] of [[this.wingL, -1], [this.wingR, 1]] as const) {
      wing.position.set(side * 0.12, 0.24, -0.01);
      const feathers = [
        { color: RED, w: 0.13, y: 0, x: 0.06 },
        { color: YELLOW, w: 0.12, y: -0.04, x: 0.14 },
        { color: BLUE, w: 0.12, y: -0.08, x: 0.22 },
        { color: TEAL, w: 0.08, y: -0.11, x: 0.29 },
      ];
      for (const f of feathers) {
        const m = toonMesh(new THREE.SphereGeometry(f.w, 12, 8), mat(f.color, 0.55), f.color === RED);
        m.scale.set(0.9, 0.42, 0.28);
        m.position.set(side * f.x, f.y, 0);
        m.rotation.z = side * -0.5;
        wing.add(m);
      }
      this.body.add(wing);
    }

    // Long tail: red with a blue tip
    const tail = new THREE.Group();
    tail.position.set(0, 0.06, -0.1);
    tail.rotation.x = -0.9;
    for (const [color, len, z] of [[RED, 0.28, 0.0], [BLUE, 0.16, -0.2]] as const) {
      const f = toonMesh(new THREE.ConeGeometry(0.05, len, 8), mat(color, 0.55));
      f.scale.z = 0.4;
      f.rotation.x = -Math.PI / 2;
      f.position.z = z - len / 2;
      tail.add(f);
    }
    this.body.add(tail);

    // Little grey feet
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.05, 4, 6), mat("#7d7d86", 0.6));
      foot.rotation.x = Math.PI / 2;
      foot.position.set(side * 0.05, 0.01, 0.02);
      this.body.add(foot);
    }
  }

  /** Blink by squashing the eyes. */
  setEyesOpen(open: number): void {
    for (const e of this.eyes) e.scale.y = Math.max(open, 0.1);
  }
}

type Mode = "fly" | "perch";

/** Pico's behaviour: follow Tadeo in the air, perch on his head when he rests. */
export class Pico {
  readonly model = new PicoModel();
  readonly position = new THREE.Vector3();
  /** True while a speech line is shown — the beak chatters. */
  talking = false;
  private velocity = new THREE.Vector3();
  private mode: Mode = "fly";
  private still = 0;
  private t = 0;
  private blink = 2;
  private tilt = 0;
  private tiltTarget = 0;
  private tiltTimer = 2;
  private perch = new THREE.Object3D();
  private target = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(private tadeo: Humanoid) {
    // Reason: a perch point on top of the head moves with every bob and squash of Tadeo's animation
    this.perch.position.set(0, 0.42, -0.02);
    tadeo.head.add(this.perch);
    this.model.root.scale.setScalar(1.35);
  }

  get root(): THREE.Group {
    return this.model.root;
  }

  /** Height of the perch above Tadeo's head centre (higher when he wears a hat). */
  setPerchHeight(y: number): void {
    this.perch.position.y = y;
  }

  /** Put Pico right next to Tadeo (after teleports). */
  snap(): void {
    this.perch.getWorldPosition(this.position);
    this.velocity.set(0, 0, 0);
    this.root.position.copy(this.position);
  }

  update(dt: number, playerSpeed: number, facing: number): void {
    this.t += dt;
    this.still = playerSpeed < 0.3 ? this.still + dt : 0;
    if (this.mode === "fly" && this.still > 1.4) this.mode = "perch";
    if (this.mode === "perch" && playerSpeed > 0.6) {
      this.mode = "fly";
      this.velocity.y = 3.5;
    }

    this.perch.getWorldPosition(this.tmp);
    if (this.mode === "fly") {
      // Hover beside and slightly behind Tadeo's left shoulder, drifting lazily
      const side = new THREE.Vector3(-1.05, 0, -0.55).applyAxisAngle(THREE.Object3D.DEFAULT_UP, facing);
      this.target.copy(this.tmp).add(side);
      this.target.y += 0.3 + Math.sin(this.t * 1.7) * 0.18;
      this.target.x += Math.sin(this.t * 0.9) * 0.25;
      const k = 26;
      const damping = 7.5;
      this.velocity.addScaledVector(this.tmp.copy(this.target).sub(this.position), k * dt);
      this.velocity.multiplyScalar(Math.exp(-damping * dt));
      this.position.addScaledVector(this.velocity, dt);
    } else {
      // Glide down onto the head, then sit tight
      this.position.lerp(this.tmp, 1 - Math.exp(-dt * 9));
      this.velocity.set(0, 0, 0);
    }
    this.root.position.copy(this.position);
    const sitting = this.mode === "perch" && this.position.distanceTo(this.tmp) < 0.12;
    this.animate(dt, facing, sitting);
  }

  private animate(dt: number, facing: number, sitting: boolean): void {
    const m = this.model;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const yaw = speed > 0.6 ? Math.atan2(this.velocity.x, this.velocity.z) : facing;
    let d = yaw - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(dt * 8, 1);

    if (sitting) {
      m.wingL.rotation.z = 0.25;
      m.wingR.rotation.z = -0.25;
      m.body.rotation.x = 0;
      m.body.position.y = Math.abs(Math.sin(this.t * 2.4)) * 0.01;
    } else {
      // Reason: flap faster when climbing or speeding, slower glides when hovering
      const rate = 11 + Math.min(speed, 6) * 1.2 + Math.max(this.velocity.y, 0) * 2;
      const flap = Math.sin(this.t * rate) * 0.95;
      m.wingL.rotation.z = 0.3 + flap;
      m.wingR.rotation.z = -0.3 - flap;
      m.body.rotation.x = Math.min(speed * 0.08, 0.45);
      m.body.position.y = Math.sin(this.t * rate) * 0.02;
    }

    // Curious head tilts, blinking and a chattering beak while talking
    this.tiltTimer -= dt;
    if (this.tiltTimer < 0) {
      this.tiltTarget = (Math.random() - 0.5) * 0.9;
      this.tiltTimer = 0.8 + Math.random() * 2.2;
    }
    this.tilt += (this.tiltTarget - this.tilt) * Math.min(dt * 10, 1);
    m.head.rotation.z = this.tilt;
    this.blink -= dt;
    m.setEyesOpen(this.blink < 0.1 ? 0.1 : 1);
    if (this.blink < 0) this.blink = 1.5 + Math.random() * 3;
    m.beakLower.rotation.x = Math.PI / 2 + 0.2 + (this.talking ? Math.abs(Math.sin(this.t * 16)) * 0.5 : 0);
  }
}
