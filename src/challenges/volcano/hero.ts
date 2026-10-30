/**
 * Hero — Tadeo's controller on the lava field: camera-relative walking for
 * any camera yaw, jumping, sliding along blocked ground and props, a smooth
 * step onto bridge decks, the "Autsch!" knock-back hop after a hit, and a
 * scripted walk for cutscenes.
 */

import * as THREE from "three";
import { Humanoid, blobShadow } from "../../characters/Humanoid";
import { createTadeo } from "../../characters/cast";
import { Input } from "../../core/Input";
import { Colliders } from "../../world/Colliders";

export interface HeroWorld {
  ground(x: number, z: number): number;
  canStand(x: number, z: number): boolean;
  /** May an airborne Tadeo fly over (x, z)? Checked only while he is off the ground. */
  canLeap(x: number, z: number): boolean;
  colliders: Colliders;
}

const WALK_SPEED = 6.2;
const JUMP_SPEED = 7.8;
const GRAVITY = 24;
const RADIUS = 0.35;
const AIR_CONTROL = 6;

export class Hero {
  readonly avatar: Humanoid = createTadeo();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly shadow = blobShadow(0.5);
  facing = 0;
  grounded = true;
  controls = false;
  /** Spin speed while tumbling after a hit (rad/s). */
  private tumble = 0;
  private vy = 0;
  private dir = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private scripted: { x: number; z: number; resolve: () => void } | null = null;

  constructor(private world: HeroWorld) {}

  addTo(scene: THREE.Scene): void {
    scene.add(this.avatar.root, this.shadow);
  }

  teleport(x: number, z: number, facing = this.facing): void {
    this.position.set(x, this.world.ground(x, z), z);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.vy = 0;
    this.tumble = 0;
    this.grounded = true;
    this.sync();
  }

  jump(): void {
    if (!this.grounded || !this.controls) return;
    this.vy = JUMP_SPEED;
    this.grounded = false;
  }

  /** Runs to (x, z) on his own (controls off); resolves on arrival. */
  walkTo(x: number, z: number): Promise<void> {
    return new Promise((resolve) => (this.scripted = { x, z, resolve }));
  }

  /** Hop backwards away from `from` with a little spin (the "Autsch!" bounce). */
  knock(from: THREE.Vector3): void {
    const away = this.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 0.01) away.set(Math.sin(this.facing), 0, Math.cos(this.facing)).negate();
    away.normalize().multiplyScalar(3.2);
    this.velocity.set(away.x, 0, away.z);
    this.vy = 9;
    this.grounded = false;
    this.tumble = 14;
  }

  /**
   * Move with the arrow keys relative to a camera whose yaw is `yaw`
   * (0 = looking north / −z): "up" walks away from the viewer.
   */
  update(dt: number, input: Input | null, yaw: number): void {
    const axis = this.controls && input ? input.axis() : { x: 0, y: 0 };
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    // Reason: screen-right = (cos, sin), screen-up (axis.y = −1) = (sin, −cos) in world xz
    this.dir.set(axis.x * c - axis.y * s, 0, axis.x * s + axis.y * c);
    if (this.dir.lengthSq() > 1) this.dir.normalize();
    this.followScript();
    const walking = this.controls || this.scripted !== null;
    const steer = walking ? 1 : 0;
    // Reason: a firm hand in the air lets a child still steer onto a rock or brake before it
    const accel = 1 - Math.exp(-dt * (this.grounded ? 12 : AIR_CONTROL));
    this.velocity.x += (this.dir.x * WALK_SPEED * steer - this.velocity.x) * (walking || this.grounded ? accel : 0);
    this.velocity.z += (this.dir.z * WALK_SPEED * steer - this.velocity.z) * (walking || this.grounded ? accel : 0);
    this.move(dt);

    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.tumble > 0) {
      this.facing += this.tumble * dt;
      this.tumble = Math.max(0, this.tumble - dt * 18);
    } else if (horizontal > 0.3 && walking) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      const delta = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += delta * Math.min(dt * 12, 1);
    }

    const ground = this.world.ground(this.position.x, this.position.z);
    if (this.grounded) {
      // Reason: ease onto bridge decks and small bumps instead of popping up
      this.position.y += (ground - this.position.y) * Math.min(1, dt * 20);
    } else {
      this.vy -= GRAVITY * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= ground) {
        this.position.y = ground;
        this.vy = 0;
        this.grounded = true;
      }
    }
    this.avatar.update(dt, { speed: walking ? horizontal : 0, grounded: this.grounded, vy: this.vy });
    this.sync();
  }

  /** Points `dir` at the scripted goal, and ends the walk on arrival. */
  private followScript(): void {
    if (!this.scripted) return;
    const dx = this.scripted.x - this.position.x;
    const dz = this.scripted.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      const done = this.scripted.resolve;
      this.scripted = null;
      done();
      return;
    }
    this.dir.set(dx / d, 0, dz / d);
  }

  /** On the ground the bank and a rock's edge stop him, so only a jump can carry him over the lava. */
  private free(x: number, z: number): boolean {
    return this.world.canStand(x, z) || (!this.grounded && this.world.canLeap(x, z));
  }

  private move(dt: number): void {
    const w = this.world;
    this.prev.copy(this.position);
    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    if (this.free(nx, nz)) {
      this.position.x = nx;
      this.position.z = nz;
    } else if (this.free(nx, this.position.z)) {
      this.position.x = nx;
      this.velocity.z *= 0.5;
    } else if (this.free(this.position.x, nz)) {
      this.position.z = nz;
      this.velocity.x *= 0.5;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    w.colliders.resolve(this.position, RADIUS);
    if (!this.free(this.position.x, this.position.z)) {
      this.position.x = this.prev.x;
      this.position.z = this.prev.z;
    }
  }

  private sync(): void {
    this.avatar.root.position.copy(this.position);
    this.avatar.root.rotation.y = this.facing;
    const ground = this.world.ground(this.position.x, this.position.z);
    this.shadow.position.set(this.position.x, ground + 0.05, this.position.z);
    this.shadow.scale.setScalar(THREE.MathUtils.clamp(1 - (this.position.y - ground) / 3, 0.3, 1));
  }
}
