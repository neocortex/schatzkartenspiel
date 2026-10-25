/**
 * HenModel — a chubby toon hen (or a fluffy chick, or the golden hen) built
 * from outlined primitives with separate parts for procedural animation:
 * strutting legs, head bob and pecks, flapping wings, sitting, panting and a
 * springy squash-and-stretch. The flock brain feeds it a `HenPose` each frame.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";
import { Disposable } from "./dispose";

export type HenKind = "hen" | "chick" | "golden";

export interface HenLook {
  kind: HenKind;
  body: THREE.ColorRepresentation;
  wing: THREE.ColorRepresentation;
  tail: THREE.ColorRepresentation;
  chest?: THREE.ColorRepresentation;
  /** Dark dots on the back (speckled hen). */
  speckle?: THREE.ColorRepresentation;
}

export interface HenPose {
  /** Ground speed in units/s (drives the walk cycle). */
  speed: number;
  /** 0..1 wing flapping. */
  flap: number;
  /** 0..1 head down to the ground. */
  peck: number;
  /** 0..1 sitting (legs tucked away). */
  sit: number;
  /** Tired: beak open, quick breaths. */
  pant: boolean;
  /** Head turn (radians). */
  look: number;
  /** In the air (stretches the body). */
  air: boolean;
}

const RED = "#e8262b";
const BEAK = "#ffb21e";
const LEGS = "#f2a516";

export class HenModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly look: HenLook;
  private wings: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private eyes: THREE.Group[] = [];
  private beakLower: THREE.Group;
  private headBase = new THREE.Vector3();
  private bodyY = 0;
  private t = Math.random() * 10;
  private phase = Math.random() * 6;
  private blink = 1 + Math.random() * 3;
  private sq = 0;
  private sqV = 0;
  /** Seconds left of an open-beaked "Gack!". */
  private gack = 0;

  /**
   * @param look Colours and kind.
   * @param owned Materials created here are pushed so the scene can dispose them.
   */
  constructor(look: HenLook, owned: Disposable[]) {
    this.look = look;
    this.root.add(this.body);
    const m = this.materials(owned);
    if (look.kind === "chick") this.buildChick(m);
    else this.buildHen(m, look);
    this.beakLower = this.head.getObjectByName("beakLower") as THREE.Group;
    this.headBase.copy(this.head.position);
    this.bodyY = this.body.position.y;
  }

  private materials(owned: Disposable[]): Record<"body" | "wing" | "tail" | "chest", THREE.Material> {
    const l = this.look;
    if (l.kind !== "golden") {
      return { body: mat(l.body, 0.7), wing: mat(l.wing, 0.7), tail: mat(l.tail, 0.65), chest: mat(l.chest ?? l.body, 0.75) };
    }
    // Reason: the golden hen gets her own shiny, softly glowing materials so bloom makes her shimmer
    const gold = (color: string, glow: string, rough: number) => {
      const g = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.35, emissive: glow, emissiveIntensity: 0.42 });
      owned.push(g);
      return g;
    };
    return {
      body: gold(String(l.body), "#ff9d14", 0.3),
      wing: gold(String(l.wing), "#ffb733", 0.28),
      tail: gold(String(l.tail), "#ff8a00", 0.3),
      chest: gold(String(l.chest ?? l.body), "#ffb02a", 0.35),
    };
  }

  private buildHen(m: Record<string, THREE.Material>, look: HenLook): void {
    const b = this.body;
    b.position.y = 0;
    const torso = toonMesh(new THREE.SphereGeometry(0.3, 22, 16), m.body);
    torso.scale.set(0.86, 0.8, 1.02);
    torso.position.set(0, 0.45, -0.02);
    torso.rotation.x = -0.18;
    b.add(torso);
    const chest = toonMesh(new THREE.SphereGeometry(0.21, 18, 14), m.chest);
    chest.scale.set(1, 0.95, 0.8);
    chest.position.set(0, 0.43, 0.15);
    b.add(chest);
    if (look.speckle) this.addSpeckles(torso, look.speckle);

    // Tail: a perky fan of three feathers pointing up and back
    const tail = new THREE.Group();
    tail.position.set(0, 0.56, -0.25);
    tail.rotation.x = -0.55;
    for (const [x, rz, h] of [[0, 0, 0.36], [-0.07, 0.38, 0.3], [0.07, -0.38, 0.3]] as const) {
      const f = toonMesh(new THREE.ConeGeometry(0.085, h, 10), m.tail);
      f.scale.z = 0.55;
      f.position.set(x, h * 0.42, 0);
      f.rotation.z = rz;
      tail.add(f);
    }
    b.add(tail);

    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.235, 0.54, 0.0);
      const w = toonMesh(new THREE.SphereGeometry(0.19, 14, 10), m.wing);
      w.scale.set(0.32, 0.62, 1.05);
      w.position.set(side * 0.02, -0.07, -0.05);
      w.rotation.x = -0.25;
      wing.add(w);
      b.add(wing);
      this.wings.push(wing);

      const leg = new THREE.Group();
      leg.position.set(side * 0.085, 0.22, 0.02);
      this.addLeg(leg, 0.22, 0.022);
      this.root.add(leg);
      this.legs.push(leg);
    }

    this.head.position.set(0, 0.75, 0.2);
    b.add(this.head);
    const skull = toonMesh(new THREE.SphereGeometry(0.165, 20, 16), m.body);
    this.head.add(skull);
    this.addFace(0.165, 1);
    const comb = [[0.05, 0.16, 0.05], [0.058, 0.178, -0.01], [0.046, 0.158, -0.07]] as const;
    for (const [r, y, z] of comb) {
      const c = toonMesh(new THREE.SphereGeometry(r, 10, 8), mat(RED, 0.5));
      c.scale.set(0.6, 1, 1);
      c.position.set(0, y, z);
      this.head.add(c);
    }
    const wattle = toonMesh(new THREE.SphereGeometry(0.036, 10, 8), mat(RED, 0.5), false);
    wattle.scale.set(0.7, 1.35, 0.7);
    wattle.position.set(0, -0.09, 0.14);
    this.head.add(wattle);
  }

  private buildChick(m: Record<string, THREE.Material>): void {
    const b = this.body;
    const fluff = toonMesh(new THREE.SphereGeometry(0.26, 20, 16), m.body);
    fluff.position.set(0, 0.32, 0);
    fluff.scale.set(1, 0.95, 1.02);
    b.add(fluff);
    const tail = toonMesh(new THREE.ConeGeometry(0.07, 0.16, 8), m.tail);
    tail.position.set(0, 0.38, -0.25);
    tail.rotation.x = -1.0;
    b.add(tail);
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.24, 0.36, 0.0);
      const w = toonMesh(new THREE.SphereGeometry(0.11, 12, 8), m.wing);
      w.scale.set(0.35, 0.7, 1);
      w.position.set(side * 0.02, -0.04, -0.02);
      wing.add(w);
      b.add(wing);
      this.wings.push(wing);
      const leg = new THREE.Group();
      leg.position.set(side * 0.08, 0.1, 0.02);
      this.addLeg(leg, 0.1, 0.02);
      this.root.add(leg);
      this.legs.push(leg);
    }
    this.head.position.set(0, 0.64, 0.06);
    b.add(this.head);
    this.head.add(toonMesh(new THREE.SphereGeometry(0.2, 20, 16), m.body));
    this.addFace(0.2, 1.25);
    // A tiny tuft of fluff on top
    for (const [x, rz] of [[-0.03, 0.35], [0.03, -0.35]] as const) {
      const tuft = toonMesh(new THREE.ConeGeometry(0.035, 0.12, 6), m.wing);
      tuft.position.set(x, 0.22, -0.01);
      tuft.rotation.z = rz;
      this.head.add(tuft);
    }
  }

  /** Big glossy toon eyes, beak (upper + hinged lower) and rosy cheeks on a head of radius r. */
  private addFace(r: number, eyeScale: number): void {
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      const x = side * r * 0.52;
      const y = r * 0.2;
      eye.position.set(x, y, Math.sqrt(Math.max(r * r - x * x - y * y, 0)) - r * 0.08);
      eye.lookAt(eye.position.clone().multiplyScalar(2));
      eye.scale.setScalar(eyeScale);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), mat("#ffffff", 0.3, 0.35));
      white.scale.set(0.85, 1.1, 0.45);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), mat("#1d1410", 0.25));
      pupil.scale.set(0.85, 1.12, 0.55);
      pupil.position.z = 0.016;
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), mat("#ffffff", 0.2, 0.8));
      glint.position.set(-0.01, 0.016, 0.034);
      eye.add(white, pupil, glint);
      this.head.add(eye);
      this.eyes.push(eye);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 10, 8), mat("#ff8f9a", 0.7, 0.3));
      cheek.scale.set(1, 0.6, 0.3);
      const cx = side * r * 0.68;
      const cy = -r * 0.22;
      cheek.position.set(cx, cy, Math.sqrt(Math.max(r * r - cx * cx - cy * cy, 0)) - r * 0.05);
      cheek.lookAt(cheek.position.clone().multiplyScalar(2));
      this.head.add(cheek);
    }
    const upper = toonMesh(new THREE.ConeGeometry(r * 0.27, r * 0.62, 10), mat(BEAK, 0.45));
    upper.rotation.x = Math.PI / 2;
    upper.position.set(0, -r * 0.02, r * 1.07);
    this.head.add(upper);
    const lower = new THREE.Group();
    lower.name = "beakLower";
    lower.position.set(0, -r * 0.16, r * 0.86);
    const lowerMesh = new THREE.Mesh(new THREE.ConeGeometry(r * 0.17, r * 0.4, 8), mat("#e8901a", 0.45));
    lowerMesh.rotation.x = Math.PI / 2;
    lowerMesh.position.z = r * 0.18;
    lower.add(lowerMesh);
    this.head.add(lower);
  }

  private addLeg(leg: THREE.Group, len: number, r: number): void {
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat(LEGS, 0.5));
    shin.position.y = -len / 2;
    shin.castShadow = true;
    leg.add(shin);
    for (const a of [-0.55, 0, 0.55]) {
      const toe = new THREE.Mesh(new THREE.BoxGeometry(r * 1.05, r * 0.7, len * 0.5), mat(LEGS, 0.5));
      toe.position.set(Math.sin(a) * len * 0.18, -len + r * 0.35, Math.cos(a) * len * 0.18 + 0.01);
      toe.rotation.y = a;
      leg.add(toe);
    }
  }

  /** Sprinkle dark dots over the upper half of a body sphere (in its local space). */
  private addSpeckles(torso: THREE.Mesh, color: THREE.ColorRepresentation): void {
    const dot = new THREE.SphereGeometry(0.03, 6, 5);
    for (let i = 0; i < 18; i++) {
      // Reason: golden-angle spiral gives an even, natural-looking spread without randomness
      const a = i * 2.39996;
      const yN = 0.15 + (i / 18) * 0.75;
      const rr = Math.sqrt(1 - yN * yN);
      const p = new THREE.Vector3(Math.cos(a) * rr, yN, Math.sin(a) * rr).multiplyScalar(0.298);
      if (p.z > 0.2) continue;
      const s = new THREE.Mesh(dot, mat(color, 0.8));
      s.position.copy(p);
      s.scale.set(1, 1, 0.35);
      s.lookAt(p.clone().multiplyScalar(2));
      torso.add(s);
    }
  }

  /** Springy squash (positive) or stretch (negative) impulse. */
  kick(amount: number): void {
    this.sqV += amount * 14;
  }

  /** Open the beak for a moment (clucking). */
  cluck(seconds = 0.35): void {
    this.gack = seconds;
  }

  update(dt: number, p: HenPose): void {
    this.t += dt;
    const walk = Math.min(p.speed / 2.2, 1) * (1 - p.sit);
    this.phase += dt * (4 + p.speed * 6.5);
    const s = Math.sin(this.phase);

    // Legs: quick little steps; tucked away when sitting
    this.legs[0].rotation.x = s * 0.85 * walk;
    this.legs[1].rotation.x = -s * 0.85 * walk;
    const legLen = 1 - p.sit * 0.8;
    for (const leg of this.legs) leg.scale.y = legLen;

    // Body: bob with each step, lean into a run, sink down when sitting
    const breathe = p.pant ? Math.sin(this.t * 15) * 0.045 : Math.sin(this.t * 2.6) * 0.012;
    this.body.position.y = this.bodyY + Math.abs(s) * 0.05 * walk - p.sit * 0.17;
    this.body.rotation.x = 0.28 * walk + (p.air ? -0.2 : 0);

    // Squash-and-stretch spring (stretched while airborne)
    this.sqV += (-170 * this.sq - 9 * this.sqV) * dt;
    this.sq += this.sqV * dt;
    const stretch = p.air ? -0.12 : 0;
    const k = THREE.MathUtils.clamp(this.sq + stretch, -0.45, 0.5);
    this.body.scale.set(1 + k * 0.32, 1 - k * 0.4 + breathe, 1 + k * 0.32);

    // Head: the chicken strut (jerks forward and back), pecks and looking around
    const strut = Math.sin(this.phase * 2) * 0.035 * walk;
    this.head.position.set(this.headBase.x, this.headBase.y - p.peck * 0.2, this.headBase.z + strut + p.peck * 0.1);
    this.head.rotation.x = p.peck * 1.05 - walk * 0.15;
    this.head.rotation.y = p.look;
    this.head.rotation.z = p.pant ? Math.sin(this.t * 3) * 0.12 : 0;

    // Wings: resting flutter, or wild flapping when scared or flying
    const rest = 0.06 + Math.sin(this.t * 2.1) * 0.03;
    const flap = p.flap > 0 ? 0.2 + p.flap * (0.75 + 0.6 * Math.sin(this.t * 34)) : rest;
    this.wings[0].rotation.z = -flap;
    this.wings[1].rotation.z = flap;

    // Beak: open while clucking or panting
    this.gack = Math.max(0, this.gack - dt);
    const open = this.gack > 0 ? 0.55 : p.pant ? 0.3 + Math.sin(this.t * 15) * 0.2 : 0.02;
    this.beakLower.rotation.x = open;

    // Blink now and then (eyes squeezed shut while panting)
    this.blink -= dt;
    let eyeOpen = this.blink < 0.12 ? Math.abs(this.blink - 0.06) / 0.06 : 1;
    if (this.blink < 0) this.blink = 1.5 + Math.random() * 3;
    if (p.pant) eyeOpen = 0.35;
    for (const e of this.eyes) e.scale.y = Math.max(eyeOpen, 0.1) * e.scale.x;
  }
}
