/**
 * Actor — a Humanoid on a challenge stage: walks to points (or is steered by
 * the arrow keys) with the stock walk cycle, turns smoothly, hops, carries a
 * soft contact shadow, and lets scripts layer extra limb animation (drumming,
 * digging, hammering) on top of the stock poses every frame.
 */

import * as THREE from "three";
import { Humanoid, blobShadow } from "../../characters/Humanoid";

const GRAVITY = 22;

interface Walk {
  x: number;
  z: number;
  speed: number;
  resolve: () => void;
}

export class Actor {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly shadow = blobShadow(0.5);
  /** Visual-only offset (leaning into a drum, recoiling) added to the drawn position. */
  readonly lean = new THREE.Vector3();
  facing = 0;
  /** Extra limb animation applied after the stock pose each frame. */
  overlay: ((h: Humanoid, dt: number) => void) | null = null;
  /** Height of the ground under the actor. */
  ground: (x: number, z: number) => number = () => 0;
  /** Whether the actor may stand at (x, z) while steered. */
  canStand: (x: number, z: number) => boolean = () => true;
  private targetFacing: number | null = null;
  private walk: Walk | null = null;
  private lift = 0;
  private vy = 0;

  constructor(
    readonly avatar: Humanoid,
    x: number,
    z: number,
    facing = 0,
  ) {
    this.position.set(x, 0, z);
    this.facing = facing;
  }

  addTo(parent: THREE.Object3D): this {
    parent.add(this.avatar.root, this.shadow);
    this.update(0);
    return this;
  }

  get airborne(): boolean {
    return this.lift > 0 || this.vy > 0;
  }

  /** Walk to (x, z) with the walk cycle; resolves on arrival. */
  walkTo(x: number, z: number, speed = 2.2): Promise<void> {
    this.walk?.resolve();
    return new Promise((resolve) => (this.walk = { x, z, speed, resolve }));
  }

  /** Teleport (cancels any walk). */
  place(x: number, z: number, facing = this.facing): void {
    this.walk?.resolve();
    this.walk = null;
    this.position.set(x, this.ground(x, z), z);
    this.facing = facing;
    this.targetFacing = null;
    this.velocity.set(0, 0, 0);
  }

  /** Turn smoothly towards a world point. */
  faceTo(x: number, z: number): void {
    this.targetFacing = Math.atan2(x - this.position.x, z - this.position.z);
  }

  /** Turn smoothly to an absolute heading (0 = facing +z). */
  face(angle: number): void {
    this.targetFacing = angle;
  }

  /** A little hop (cheering, landing on a drum). */
  jump(speed = 5): void {
    if (this.lift > 0.001) return;
    this.vy = speed;
  }

  update(dt: number): void {
    let speed = 0;
    const p = this.position;
    if (this.walk) {
      const dx = this.walk.x - p.x;
      const dz = this.walk.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.04) {
        p.x = this.walk.x;
        p.z = this.walk.z;
        const done = this.walk.resolve;
        this.walk = null;
        done();
      } else {
        const step = Math.min(d, this.walk.speed * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        speed = this.walk.speed;
        this.targetFacing = Math.atan2(dx, dz);
      }
    } else if (this.velocity.lengthSq() > 0.0004) {
      const nx = p.x + this.velocity.x * dt;
      const nz = p.z + this.velocity.z * dt;
      // Reason: try each axis separately so the actor slides along blocked edges
      if (this.canStand(nx, nz)) {
        p.x = nx;
        p.z = nz;
      } else if (this.canStand(nx, p.z)) p.x = nx;
      else if (this.canStand(p.x, nz)) p.z = nz;
      speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > 0.3) this.targetFacing = Math.atan2(this.velocity.x, this.velocity.z);
    }

    if (this.targetFacing !== null) {
      const delta = Math.atan2(Math.sin(this.targetFacing - this.facing), Math.cos(this.targetFacing - this.facing));
      this.facing += delta * Math.min(dt * 10, 1);
    }

    // Hop
    if (this.vy !== 0 || this.lift > 0) {
      this.vy -= GRAVITY * dt;
      this.lift += this.vy * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        this.vy = 0;
      }
    }

    p.y = this.ground(p.x, p.z);
    this.avatar.update(dt, { speed, grounded: this.lift <= 0, vy: this.vy });
    this.overlay?.(this.avatar, dt);
    this.avatar.root.position.set(p.x, p.y + this.lift, p.z).add(this.lean);
    this.avatar.root.rotation.y = this.facing;
    this.shadow.position.set(p.x, p.y + 0.03, p.z);
    this.shadow.scale.setScalar(THREE.MathUtils.clamp(1 - this.lift / 2.5, 0.4, 1));
  }
}
