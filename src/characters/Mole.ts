/**
 * The hungry mole from the cave: a round velvet fellow with big shovel paws, a
 * shiny pink nose and thick round glasses. While `hungry` he rubs his tummy and
 * looks sad; once fed he bounces happily. `dig()` plays a digging burst towards
 * his +z (turn that side to the rockfall) with dirt flying out behind him.
 *
 * He lives in dark caves, so his fur has a soft velvet rim light, and his belly,
 * paws and face are bright enough to read by torchlight alone.
 */

import * as THREE from "three";
import { blobShadow } from "./Humanoid";
import { mat, toonMesh } from "./parts";

const DIG_SECONDS = 2.4;
/** Seconds at the end of the dig for his happy hop. */
const HOP_SECONDS = 0.45;
const CLODS = 14;
const GRAVITY = 9;
const HEAD_Y = 0.9;

let furCache: THREE.MeshStandardMaterial | null = null;

/** Warm brown fur that catches a pale rim of light at its edges, like velvet. */
function furMaterial(): THREE.MeshStandardMaterial {
  if (furCache) return furCache;
  furCache = new THREE.MeshStandardMaterial({ color: "#96623f", roughness: 0.9 });
  furCache.emissive = new THREE.Color("#96623f");
  furCache.emissiveIntensity = 0.32;
  furCache.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
      // Reason: clamp the pow base; a slightly negative base is NaN on Metal
      totalEmissiveRadiance += vec3(0.62, 0.46, 0.36) * pow(max(1.0 - dot(normalize(vViewPosition), normal), 0.0), 2.4);`,
    );
  };
  return furCache;
}

let lensCache: THREE.MeshStandardMaterial | null = null;

function lensMaterial(): THREE.MeshStandardMaterial {
  lensCache ??= new THREE.MeshStandardMaterial({
    color: "#dff4ff",
    roughness: 0.1,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  return lensCache;
}

const sphere = (r: number, material: THREE.Material, outline = false) =>
  toonMesh(new THREE.SphereGeometry(r, 20, 14), material, outline);

interface Eye {
  group: THREE.Group;
  lid: THREE.Mesh;
}

interface Clod {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  /** Seconds until it is thrown (again). */
  wait: number;
}

export class Mole {
  readonly root = new THREE.Group();
  /** Sad and rubbing his tummy; `dig()` clears it (he only digs when fed). */
  hungry = true;
  private body = new THREE.Group();
  private head = new THREE.Group();
  private nose: THREE.Mesh;
  private arms: { group: THREE.Group; side: number }[] = [];
  private eyes: Eye[] = [];
  private brows: { mesh: THREE.Mesh; side: number }[] = [];
  private mouthArc: THREE.Mesh;
  private teeth = new THREE.Group();
  private clods: Clod[] = [];
  private t = 0;
  private blink = 2;
  private digAt = -1;
  private digging: Promise<void> | null = null;
  private digDone: (() => void) | null = null;

  constructor() {
    const fur = furMaterial();
    const shadow = blobShadow(0.72);
    shadow.position.y = 0.03;
    this.root.add(shadow, this.body);

    this.buildBody(fur);
    this.nose = this.buildHead(fur);
    this.mouthArc = this.buildMouth();
    this.buildArms(fur);
    this.buildClods();
    this.head.position.y = HEAD_Y;
    this.body.add(this.head);
  }

  /** Play the digging burst. Resolves when he is done; needs `update()` running. */
  dig(): Promise<void> {
    if (this.digging) return this.digging;
    this.hungry = false;
    this.digAt = 0;
    this.digging = new Promise((resolve) => (this.digDone = resolve));
    return this.digging;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.digAt >= 0) this.animateDig(dt);
    else if (this.hungry) this.animateHungry();
    else this.animateHappy();
    this.updateClods(dt);
    this.updateFace(dt);
  }

  private buildBody(fur: THREE.Material): void {
    const torso = sphere(0.47, fur, true);
    torso.scale.set(1, 1.02, 0.92);
    torso.position.y = 0.45;
    const belly = sphere(0.36, mat("#f4dcb4", 0.8, 0.34));
    belly.scale.set(1, 1.06, 0.62);
    belly.position.set(0, 0.42, 0.24);
    const tail = sphere(0.075, mat("#f5a99a", 0.6, 0.3), true);
    tail.scale.set(0.8, 0.8, 1.5);
    tail.position.set(0, 0.2, -0.46);
    this.body.add(torso, belly, tail);
    // Reason: feet belong to the root so they stay planted while the body leans into the dig
    for (const side of [-1, 1]) {
      const foot = sphere(0.14, mat("#f5a99a", 0.6, 0.3), true);
      foot.scale.set(1.15, 0.55, 1.5);
      foot.position.set(side * 0.24, 0.075, 0.26);
      foot.rotation.y = side * 0.25;
      this.root.add(foot);
    }
  }

  /** Skull, snout, glasses, eyes, ears, tuft and whiskers. Returns the nose (it twitches). */
  private buildHead(fur: THREE.Material): THREE.Mesh {
    const skull = sphere(0.35, fur, true);
    skull.scale.set(1.06, 0.97, 1);
    const snout = sphere(0.2, mat("#d2a077", 0.75, 0.34), true);
    snout.scale.set(1.25, 0.95, 1.1);
    snout.position.set(0, -0.12, 0.25);
    const nose = sphere(0.1, mat("#ff5c86", 0.3, 0.55), true);
    nose.scale.set(1.15, 0.92, 0.9);
    nose.position.set(0, -0.03, 0.46);
    const shine = sphere(0.026, mat("#ffffff", 0.2, 0.8));
    shine.position.set(-0.038, 0.036, 0.075);
    nose.add(shine);
    this.head.add(skull, snout, nose);

    for (const side of [-1, 1]) {
      const ear = sphere(0.08, fur, true);
      ear.scale.set(1, 1, 0.55);
      ear.position.set(side * 0.3, 0.24, 0.02);
      this.head.add(ear);
      this.buildEye(side);
      this.buildGlassesSide(side);
      for (const [y, spread] of [[-0.1, 0.1], [-0.16, -0.14]]) {
        const whisker = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.22, 2, 4), mat("#fff3da", 0.5, 0.5));
        whisker.position.set(side * 0.33, y, 0.32);
        whisker.rotation.z = Math.PI / 2 - side * spread;
        whisker.rotation.y = side * 0.45;
        this.head.add(whisker);
      }
    }
    const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.03, 3, 6), mat("#ffc83d", 0.3, 0.5));
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.125, 0.378);
    this.head.add(bridge);

    for (const [x, tilt, h] of [[-0.06, 0.32, 0.15], [0.01, -0.05, 0.19], [0.075, -0.4, 0.14]]) {
      const tuft = toonMesh(new THREE.ConeGeometry(0.048, h, 7), fur);
      tuft.position.set(x, 0.345 + h * 0.3, 0.02);
      tuft.rotation.z = tilt;
      this.head.add(tuft);
    }
    return nose;
  }

  /** A big round eye with a sliding eyelid (the lid is a half sphere turned about x). */
  private buildEye(side: number): void {
    const group = new THREE.Group();
    group.position.set(side * 0.135, 0.11, 0.288);
    group.rotation.y = side * 0.32;
    const white = sphere(0.1, mat("#ffffff", 0.3, 0.42));
    white.scale.set(1, 1.08, 0.62);
    const pupil = sphere(0.056, mat("#1d1410", 0.25));
    pupil.scale.set(0.95, 1.1, 0.55);
    pupil.position.set(-side * 0.008, -0.004, 0.044);
    const sparkle = sphere(0.019, mat("#ffffff", 0.2, 0.8));
    sparkle.position.set(-side * 0.008 - 0.018, 0.024, 0.074);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.106, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), furMaterial());
    lid.scale.set(1, 1.08, 0.72);
    group.add(white, pupil, sparkle, lid);
    this.head.add(group);
    this.eyes.push({ group, lid });

    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.09, 3, 6), mat("#4f2f1c", 0.8, 0.3));
    brow.position.set(side * 0.145, 0.27, 0.305);
    this.head.add(brow);
    this.brows.push({ mesh: brow, side });
  }

  /** One gold ring with its glass and a shine stripe. */
  private buildGlassesSide(side: number): void {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.017, 8, 32), mat("#ffc83d", 0.3, 0.5));
    ring.position.set(side * 0.135, 0.11, 0.345);
    ring.rotation.y = side * 0.32;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.122, 28), lensMaterial());
    const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.075, 2, 5), mat("#ffffff", 0.2, 0.8));
    stripe.position.set(-0.058, 0.04, 0.003);
    stripe.rotation.z = -0.75;
    ring.add(lens, stripe);
    this.head.add(ring);
  }

  /** Mouth arc and two big front teeth on the snout. Returns the arc (it flips between smile and frown). */
  private buildMouth(): THREE.Mesh {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.014, 6, 16, Math.PI * 0.8), mat("#6a2420", 0.6));
    for (const side of [-1, 1]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.06, 0.018), mat("#ffffff", 0.3, 0.5));
      tooth.position.x = side * 0.021;
      this.teeth.add(tooth);
    }
    const mouth = new THREE.Group();
    mouth.position.set(0, -0.18, 0.44);
    mouth.rotation.x = -0.35;
    mouth.add(arc, this.teeth);
    this.head.add(mouth);
    return arc;
  }

  /** Short arms pivoting at the shoulder, each with a broad pink shovel paw and four pale claws. */
  private buildArms(fur: THREE.Material): void {
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(side * 0.39, 0.62, 0.12);
      const arm = toonMesh(new THREE.CapsuleGeometry(0.105, 0.12, 4, 10), fur);
      arm.position.y = -0.1;
      const paw = sphere(0.175, mat("#f7b1a0", 0.6, 0.36), true);
      paw.scale.set(1.12, 0.8, 0.6);
      paw.position.y = -0.27;
      group.add(arm, paw);
      for (let i = 0; i < 4; i++) {
        const claw = toonMesh(new THREE.ConeGeometry(0.032, 0.12, 6), mat("#fff3da", 0.4, 0.5), false);
        claw.position.set((i - 1.5) * 0.08, -0.4 + Math.abs(i - 1.5) * 0.018, 0);
        claw.rotation.x = Math.PI;
        group.add(claw);
      }
      this.body.add(group);
      this.arms.push({ group, side });
    }
  }

  private buildClods(): void {
    const dirt = mat("#a06f47", 0.95, 0.34);
    const shape = new THREE.IcosahedronGeometry(0.06, 0);
    for (let i = 0; i < CLODS; i++) {
      const mesh = new THREE.Mesh(shape, dirt);
      mesh.visible = false;
      mesh.scale.setScalar(0.6 + (i % 4) * 0.3);
      this.root.add(mesh);
      this.clods.push({ mesh, velocity: new THREE.Vector3(), wait: (i / CLODS) * 0.75 });
    }
  }

  private setArm(side: number, forward: number, out: number): void {
    const arm = this.arms.find((a) => a.side === side)!;
    arm.group.rotation.x = -forward;
    arm.group.rotation.z = side * out;
  }

  /** Slumped, tummy rumbling, paws circling on his belly, nose sniffing for food. */
  private animateHungry(): void {
    const t = this.t;
    // Reason: every few seconds the tummy rumbles: a quick shudder through the body
    const rumble = Math.max(0, Math.sin(t * 1.7) - 0.86) * 7;
    const shake = Math.sin(t * 34) * 0.045 * rumble;
    const breathe = Math.sin(t * 2.1) * 0.012;
    this.body.position.set(shake * 0.4, 0, 0);
    this.body.rotation.set(0.04, 0, shake);
    this.body.scale.set(1 + breathe + 0.02 * rumble, 1 - breathe, 1 + breathe + 0.02 * rumble);
    this.head.rotation.set(0.1 + Math.sin(t * 0.8) * 0.03, Math.sin(t * 0.55) * 0.3, 0);
    for (const side of [-1, 1]) {
      this.setArm(side, 1.02 + Math.sin(t * 3 + side) * 0.09, -0.48 + Math.cos(t * 3 + side) * 0.07);
    }
    this.nose.scale.set(1.15 + Math.max(0, Math.sin(t * 6.5)) * 0.1, 0.92, 0.9);
  }

  /** Full and pleased with himself: a little bounce and a sway, paws swinging. */
  private animateHappy(): void {
    const t = this.t;
    this.body.position.set(0, Math.abs(Math.sin(t * 2.6)) * 0.035, 0);
    this.body.rotation.set(0, 0, Math.sin(t * 2.6) * 0.05);
    this.body.scale.setScalar(1);
    this.head.rotation.set(-0.06, Math.sin(t * 0.9) * 0.2, Math.sin(t * 2.6) * 0.04);
    for (const side of [-1, 1]) this.setArm(side, 0.25 + Math.sin(t * 2.6 + side) * 0.14, 0.42);
    this.nose.scale.set(1.15, 0.92, 0.9);
  }

  /** Crouch, lean in and paddle like mad (dirt flies), then hop up when it is done. */
  private animateDig(dt: number): void {
    this.digAt += dt;
    const at = this.digAt;
    const left = DIG_SECONDS - at;
    if (left <= 0) {
      this.digAt = -1;
      this.digging = null;
      const done = this.digDone;
      this.digDone = null;
      done?.();
      return;
    }
    if (left < HOP_SECONDS) {
      // Reason: the hop's parabola starts and ends on the ground, so it joins the happy pose without a jump
      const k = 1 - left / HOP_SECONDS;
      this.body.position.set(0, Math.sin(k * Math.PI) * 0.4, 0.08 * (1 - k));
      this.body.rotation.set(0.5 * (1 - k), 0, 0);
      this.body.scale.setScalar(1);
      this.head.rotation.set(-0.42 + 0.36 * k, 0, 0);
      for (const side of [-1, 1]) this.setArm(side, 0.25, 0.42 + Math.sin(k * Math.PI) * 1.8);
      return;
    }
    const lean = Math.min(at / 0.25, 1);
    const paddle = at * 24;
    this.body.position.set(Math.sin(at * 41) * 0.012, -0.05 * lean, 0.08 * lean);
    this.body.rotation.set(0.5 * lean, 0, Math.sin(at * 19) * 0.04);
    this.body.scale.setScalar(1);
    this.head.rotation.set(-0.42 * lean, 0, 0);
    this.setArm(-1, (1.25 + Math.sin(paddle) * 0.75) * lean, 0.24);
    this.setArm(1, (1.25 + Math.sin(paddle + Math.PI) * 0.75) * lean, 0.24);
    this.nose.scale.set(1.15, 0.92, 0.9);
  }

  /** Clods leap from his paws in arcs over his back while he digs, then land and vanish. */
  private updateClods(dt: number): void {
    const throwing = this.digAt > 0.2 && this.digAt < DIG_SECONDS - HOP_SECONDS;
    for (const c of this.clods) {
      const m = c.mesh;
      if (!m.visible) {
        if (!throwing) continue;
        c.wait -= dt;
        if (c.wait > 0) continue;
        m.visible = true;
        const side = Math.random() < 0.5 ? -1 : 1;
        m.position.set(side * (0.16 + Math.random() * 0.18), 0.14, 0.5);
        c.velocity.set(side * (0.3 + Math.random() * 1.1), 3 + Math.random() * 1.5, -2.2 - Math.random() * 1.7);
        continue;
      }
      c.velocity.y -= GRAVITY * dt;
      m.position.addScaledVector(c.velocity, dt);
      m.rotation.x += dt * 9;
      m.rotation.z += dt * 6;
      if (m.position.y < 0.03) {
        m.visible = false;
        c.wait = Math.random() * 0.12;
      }
    }
  }

  /** Eyelids, brows and mouth follow his mood; he blinks now and then. */
  private updateFace(dt: number): void {
    this.blink -= dt;
    const blinking = this.blink < 0.12;
    if (this.blink < 0) this.blink = 1.6 + Math.random() * 3.2;
    const sad = this.hungry;
    // Reason: lid angle 0 covers the top half of the eye; negative tips it back over the head, positive closes it
    const lidAngle = blinking ? 0.75 : sad ? -0.22 : -1.25;
    for (const e of this.eyes) e.lid.rotation.x = lidAngle;
    for (const b of this.brows) {
      // Reason: inner ends up reads as sad; the other way round would look angry
      b.mesh.rotation.z = Math.PI / 2 + b.side * (sad ? -0.42 : 0.12);
      b.mesh.position.y = sad ? 0.262 : 0.285;
    }
    // Reason: the same arc makes both faces: turned over it is a smile, upright a frown. The frown's
    // top sits on the fullest part of the snout, so it comes forward or the snout would swallow it
    this.mouthArc.rotation.set(sad ? 0.45 : 0, 0, sad ? 0.1 * Math.PI : 1.1 * Math.PI);
    this.mouthArc.position.set(0, sad ? -0.075 : 0.02, sad ? 0.025 : 0);
    this.teeth.position.y = sad ? -0.038 : -0.095;
  }
}

export function createMole(): Mole {
  return new Mole();
}
