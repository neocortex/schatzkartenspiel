/**
 * Humanoid — a chibi character (big head, small body) assembled from simple
 * shapes with a cartoon outline, animated procedurally: idle breathing,
 * blinking, walk cycle, jump, landing squash, cheering and talking.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildFace, buildHair, mat, toonMesh, Face, HairStyle } from "./parts";

export interface HumanoidLook {
  skin: THREE.ColorRepresentation;
  hair: THREE.ColorRepresentation;
  hairStyle: HairStyle;
  shirt: THREE.ColorRepresentation;
  pants: THREE.ColorRepresentation;
  shoes: THREE.ColorRepresentation;
  /** Uniform scale (1 = Tadeo, ~1.5 units tall). */
  scale?: number;
  /** Long robe instead of trousers (elders, wise people). */
  robe?: boolean;
  grumpy?: boolean;
}

export type Pose = "normal" | "cheer" | "talk" | "holdUp" | "sit";

export interface MotionState {
  /** Horizontal speed in units/s. */
  speed: number;
  grounded: boolean;
  /** Vertical velocity (for jump poses). */
  vy: number;
}

const HEAD_R = 0.36;

export class Humanoid {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  /** Attach held items here (palm of the right hand). */
  readonly handR = new THREE.Group();
  /** Attach carried items here (between the shoulder blades). */
  readonly back = new THREE.Group();
  readonly face: Face;
  pose: Pose = "normal";

  private phase = 0;
  private walkAmt = 0;
  private blinkTimer = 2;
  private squash = 0;
  private wasGrounded = true;
  private lookTimer = 3;
  private lookYaw = 0;
  private lookTarget = 0;
  private t = 0;

  constructor(look: HumanoidLook) {
    const skin = mat(look.skin, 0.6);
    const shirt = mat(look.shirt, 0.75);
    const pants = mat(look.pants, 0.8);
    const shoes = mat(look.shoes, 0.55);

    this.root.add(this.body);
    this.body.position.y = 0;

    // Legs (pivot at the hip)
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.position.set(side * 0.11, 0.42, 0);
      if (!look.robe) {
        const thigh = toonMesh(new THREE.CapsuleGeometry(0.095, 0.16, 4, 10), pants);
        thigh.position.y = -0.15;
        leg.add(thigh);
      }
      const boot = toonMesh(new RoundedBoxGeometry(0.19, 0.15, 0.27, 3, 0.06), shoes);
      boot.position.set(0, -0.35, 0.035);
      leg.add(boot);
      this.body.add(leg);
    }

    // Torso (pivot at the hip, grows upward)
    this.torso.position.y = 0.42;
    this.body.add(this.torso);
    if (look.robe) {
      const robe = toonMesh(new THREE.CylinderGeometry(0.2, 0.34, 0.75, 14), shirt);
      robe.position.y = -0.05;
      this.torso.add(robe);
    } else {
      const chest = toonMesh(new THREE.CapsuleGeometry(0.2, 0.14, 6, 14), shirt);
      chest.scale.set(1, 1, 0.82);
      chest.position.y = 0.21;
      this.torso.add(chest);
      const belt = toonMesh(new THREE.CylinderGeometry(0.205, 0.205, 0.06, 14), mat("#5a3a22", 0.6), false);
      belt.scale.z = 0.84;
      belt.position.y = 0.06;
      this.torso.add(belt);
    }

    // Arms (pivot at the shoulder)
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(side * 0.25, 0.4, 0);
      const sleeve = toonMesh(new THREE.CapsuleGeometry(0.085, 0.08, 4, 10), shirt);
      sleeve.position.y = -0.06;
      arm.add(sleeve);
      const fore = toonMesh(new THREE.CapsuleGeometry(0.065, 0.14, 4, 8), skin);
      fore.position.y = -0.2;
      arm.add(fore);
      const hand = toonMesh(new THREE.SphereGeometry(0.085, 12, 10), skin);
      hand.position.y = -0.32;
      arm.add(hand);
      if (side === 1) {
        this.handR.position.y = -0.34;
        arm.add(this.handR);
      }
      arm.rotation.z = side * 0.12;
      this.torso.add(arm);
    }

    this.back.position.set(0, 0.25, -0.2);
    this.torso.add(this.back);

    // Head
    this.head.position.y = 0.48 + HEAD_R * 0.92;
    this.torso.add(this.head);
    const skull = toonMesh(new THREE.SphereGeometry(HEAD_R, 28, 20), skin);
    skull.scale.set(1.04, 0.96, 0.96);
    this.head.add(skull);
    for (const side of [-1, 1]) {
      const ear = toonMesh(new THREE.SphereGeometry(0.08, 10, 8), skin);
      ear.scale.set(0.6, 1, 0.8);
      ear.position.set(side * HEAD_R * 1.0, -0.02, 0);
      this.head.add(ear);
    }
    this.face = buildFace(HEAD_R, { brow: look.hair, skin: look.skin, grumpy: look.grumpy });
    this.head.add(this.face.group);
    this.head.add(buildHair(look.hairStyle, HEAD_R, look.hair));

    this.root.scale.setScalar(look.scale ?? 1);
  }

  /** Height of the top of the head above the feet (for speech bubbles, markers). */
  get height(): number {
    return 1.75 * this.root.scale.y;
  }

  update(dt: number, m: MotionState): void {
    this.t += dt;
    const walkTarget = m.grounded ? Math.min(m.speed / 5, 1) : 0;
    this.walkAmt += (walkTarget - this.walkAmt) * Math.min(dt * 10, 1);
    this.phase += dt * (4 + m.speed * 1.6);
    const s = Math.sin(this.phase);
    const a = this.walkAmt;

    // Landing squash
    if (m.grounded && !this.wasGrounded) this.squash = 1;
    this.wasGrounded = m.grounded;
    this.squash = Math.max(0, this.squash - dt * 5);
    const sq = Math.sin(this.squash * Math.PI) * 0.18;
    this.body.scale.set(1 + sq, 1 - sq, 1 + sq);

    // Walk cycle + idle breathing
    const breathe = Math.sin(this.t * 2.2) * 0.012;
    this.body.position.y = Math.abs(s) * 0.07 * a;
    this.torso.scale.y = 1 + breathe * (1 - a);
    this.torso.rotation.x = 0.1 * a;
    this.torso.rotation.y = s * 0.12 * a;
    this.legL.rotation.x = s * 0.75 * a;
    this.legR.rotation.x = -s * 0.75 * a;
    this.armL.rotation.x = -s * 0.85 * a;
    this.armR.rotation.x = s * 0.85 * a;
    this.armL.rotation.z = -0.12 - Math.sin(this.t * 1.7) * 0.03 * (1 - a);
    this.armR.rotation.z = 0.12 + Math.sin(this.t * 1.7) * 0.03 * (1 - a);
    this.head.rotation.x = -0.06 * a + Math.sin(this.phase * 2) * 0.03 * a;

    if (!m.grounded) {
      const rising = m.vy > 0 ? 1 : 0.5;
      this.legL.rotation.x = 0.5 * rising;
      this.legR.rotation.x = -0.25;
      this.armL.rotation.z = -1.1 * rising;
      this.armR.rotation.z = 1.1 * rising;
    }

    this.applyPose();
    this.updateEyes(dt, a);
  }

  private applyPose(): void {
    const t = this.t;
    switch (this.pose) {
      case "cheer":
        this.armL.rotation.set(0, 0, -2.6 + Math.sin(t * 10) * 0.15);
        this.armR.rotation.set(0, 0, 2.6 - Math.sin(t * 10) * 0.15);
        this.body.position.y = Math.abs(Math.sin(t * 7)) * 0.25;
        break;
      case "holdUp":
        this.armR.rotation.set(0, 0, 2.9);
        this.armL.rotation.set(0, 0, -2.9);
        this.head.rotation.x = -0.25;
        break;
      case "talk":
        this.head.rotation.x = Math.sin(t * 9) * 0.06;
        this.armR.rotation.x = -0.4 + Math.sin(t * 4) * 0.25;
        break;
      case "sit":
        this.legL.rotation.x = -1.4;
        this.legR.rotation.x = -1.4;
        this.body.position.y = -0.3;
        break;
      default:
        break;
    }
  }

  private updateEyes(dt: number, walking: number): void {
    this.blinkTimer -= dt;
    let open = 1;
    if (this.blinkTimer < 0.12) open = Math.abs(this.blinkTimer - 0.06) / 0.06;
    if (this.blinkTimer < 0) this.blinkTimer = 1.8 + Math.random() * 3.5;
    for (const e of this.face.eyes) e.scale.y = Math.max(open, 0.08);

    // Idle: glance around now and then
    this.lookTimer -= dt;
    if (this.lookTimer < 0) {
      this.lookTarget = walking > 0.2 ? 0 : (Math.random() - 0.5) * 1.1;
      this.lookTimer = 1.5 + Math.random() * 3;
    }
    this.lookYaw += (this.lookTarget * (1 - walking) - this.lookYaw) * Math.min(dt * 4, 1);
    this.head.rotation.y = this.lookYaw;
  }
}

/** Soft round contact shadow drawn under characters (grounds them on any surface). */
export function blobShadow(radius = 0.55): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.6, "rgba(0,0,0,0.25)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  m.renderOrder = 2;
  return m;
}
