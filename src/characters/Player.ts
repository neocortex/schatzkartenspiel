/**
 * Player — Tadeo's controller: camera-relative walking, wading, jumping,
 * terrain + prop collisions, and driving the avatar's animation.
 */

import * as THREE from "three";
import { Humanoid, blobShadow } from "./Humanoid";
import { createTadeo } from "./cast";
import { Input } from "../core/Input";
import { Colliders } from "../world/Colliders";

/** What the player needs to know about the world it walks in. */
export interface WalkableWorld {
  /** Height of the walking surface (terrain, bridge deck or pier). */
  groundHeight(x: number, z: number): number;
  /** Whether a character may stand here. */
  canStand(x: number, z: number): boolean;
  colliders: Colliders;
}

const WALK_SPEED = 6.2;
const WADE_SPEED = 3.4;
const JUMP_SPEED = 7.8;
const GRAVITY = 24;
const RADIUS = 0.35;

export class Player {
  readonly avatar: Humanoid;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  facing = 0;
  grounded = true;
  controlsEnabled = true;
  private vy = 0;
  private shadow = blobShadow(0.5);
  private dir = new THREE.Vector3();
  private prev = new THREE.Vector3();

  constructor(readonly world: WalkableWorld) {
    this.avatar = createTadeo();
  }

  /** Add the avatar and its contact shadow to a scene. */
  addTo(scene: THREE.Scene): void {
    scene.add(this.avatar.root, this.shadow);
  }

  teleport(x: number, z: number, facing = this.facing): void {
    this.position.set(x, this.world.groundHeight(x, z), z);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.vy = 0;
    this.grounded = true;
    this.syncAvatar();
  }

  /** True while standing in water (feet below sea level). */
  get wading(): boolean {
    return this.world.groundHeight(this.position.x, this.position.z) < -0.08;
  }

  update(dt: number, input: Input, cameraYaw: number): void {
    const axis = this.controlsEnabled ? input.axis() : { x: 0, y: 0 };
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    // Reason: arrows are relative to the camera — "up" walks away from the viewer
    // (right = (cos, 0, sin), forward = (sin, 0, -cos) for the rig's yaw convention)
    this.dir.set(axis.x * cos - axis.y * sin, 0, axis.x * sin + axis.y * cos);
    if (this.dir.lengthSq() > 1) this.dir.normalize();

    const speed = this.wading ? WADE_SPEED : WALK_SPEED;
    const accel = 1 - Math.exp(-dt * (this.grounded ? 12 : 4));
    this.velocity.x += (this.dir.x * speed - this.velocity.x) * accel;
    this.velocity.z += (this.dir.z * speed - this.velocity.z) * accel;

    this.move(dt);

    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontal > 0.3) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      let delta = target - this.facing;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.facing += delta * Math.min(dt * 12, 1);
    }

    this.applyGravity(dt);
    this.avatar.update(dt, { speed: horizontal, grounded: this.grounded, vy: this.vy });
    this.syncAvatar();
  }

  /** Make the player hop (used by the space bar when nothing is in reach). */
  jump(): void {
    if (!this.grounded || !this.controlsEnabled) return;
    this.vy = JUMP_SPEED;
    this.grounded = false;
  }

  private move(dt: number): void {
    const w = this.world;
    this.prev.copy(this.position);
    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    // Slide along blocked terrain by trying each axis separately
    if (w.canStand(nx, nz)) {
      this.position.x = nx;
      this.position.z = nz;
    } else if (w.canStand(nx, this.position.z)) {
      this.position.x = nx;
      this.velocity.z *= 0.5;
    } else if (w.canStand(this.position.x, nz)) {
      this.position.z = nz;
      this.velocity.x *= 0.5;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    w.colliders.resolve(this.position, RADIUS);
    if (!w.canStand(this.position.x, this.position.z)) {
      this.position.x = this.prev.x;
      this.position.z = this.prev.z;
    }
  }

  private applyGravity(dt: number): void {
    const ground = this.world.groundHeight(this.position.x, this.position.z);
    if (this.grounded) {
      this.position.y = ground;
      return;
    }
    this.vy -= GRAVITY * dt;
    this.position.y += this.vy * dt;
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.vy = 0;
      this.grounded = true;
    }
  }

  private syncAvatar(): void {
    this.avatar.root.position.copy(this.position);
    this.avatar.root.rotation.y = this.facing;
    const ground = this.world.groundHeight(this.position.x, this.position.z);
    this.shadow.position.set(this.position.x, Math.max(ground, 0) + 0.04, this.position.z);
    const lift = THREE.MathUtils.clamp(1 - (this.position.y - ground) / 3, 0.3, 1);
    this.shadow.scale.setScalar(lift);
    this.shadow.visible = ground > -0.3;
  }
}
