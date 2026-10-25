/**
 * SpiralCamera — the climb camera. It hovers outside the mountain, level with
 * Tadeo and a little above him, looking in at the slope, and orbits the peak
 * as he climbs (so "forward" always runs to the right of the screen). It
 * leads slightly in the walking direction, never dips into the terrain, can
 * shake, and blends to and from scripted cinematic shots.
 */

import * as THREE from "three";
import { Course } from "./course";
import { Climber } from "./climber";

export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

const DIST = 10;
const HEIGHT = 3.0;
const LEAD = 1.6;

const ease = (t: number) => t * t * (3 - 2 * t);

export class SpiralCamera {
  private s = 0;
  private y = 0;
  private r = 0;
  private lead = 0;
  private shake = 0;
  private shot: ((t: number) => Shot) | null = null;
  private shotTime = 0;
  private blend = 0;
  private blendSpeed = 1;
  private releasing = false;
  private follow: Shot = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private look = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private course: Course,
    private ground: (x: number, z: number) => number,
  ) {}

  /** Jump straight to the follow position (scene start, respawn). */
  snap(c: Climber): void {
    this.s = c.s;
    this.y = c.y;
    this.r = c.radius;
    this.lead = c.dir * LEAD;
  }

  /** Blend to a scripted shot (a function of seconds since it started), or back with null. */
  setShot(fn: ((t: number) => Shot) | null, seconds = 1.2): void {
    this.blendSpeed = 1 / Math.max(seconds, 0.001);
    if (fn) {
      this.shot = fn;
      this.shotTime = 0;
      this.releasing = false;
      if (seconds <= 0.001) this.blend = 1;
    } else {
      this.releasing = true;
    }
  }

  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, 1);
  }

  /** The point the camera is centred on (for shadows and snow). */
  get focus(): THREE.Vector3 {
    return this.look;
  }

  update(dt: number, c: Climber): void {
    // Follow: ease along the spiral, a little ahead of Tadeo
    this.lead += (c.dir * LEAD - this.lead) * (1 - Math.exp(-dt * 2));
    this.s += (c.s + this.lead - this.s) * (1 - Math.exp(-dt * 4));
    const yRate = c.grounded || c.mode === "climb" ? 4 : 1.6;
    // Reason: don't dive after Tadeo when he falls into a crevice — he pops back up on safe ground
    const ty = c.mode === "auto" ? Math.max(c.y, c.safeY - 1) : c.y;
    this.y += (ty - this.y) * (1 - Math.exp(-dt * yRate));
    this.r += (c.radius - this.r) * (1 - Math.exp(-dt * 4));
    const f = this.follow;
    this.course.point(this.s, this.r + DIST, this.y + HEIGHT, f.pos);
    this.course.point(this.s, this.r, this.y + 1.05, f.look);
    f.pos.y = Math.max(f.pos.y, this.ground(f.pos.x, f.pos.z) + 1.8);

    // Scripted shot blending
    if (this.shot) {
      this.shotTime += dt;
      this.blend = this.releasing ? Math.max(0, this.blend - dt * this.blendSpeed) : Math.min(1, this.blend + dt * this.blendSpeed);
      if (this.releasing && this.blend === 0) {
        this.shot = null;
        this.releasing = false;
      }
    }
    const cam = this.camera;
    if (this.shot && this.blend > 0) {
      const s = this.shot(this.shotTime);
      const e = ease(this.blend);
      cam.position.lerpVectors(f.pos, s.pos, e);
      this.look.lerpVectors(f.look, s.look, e);
    } else {
      cam.position.copy(f.pos);
      this.look.copy(f.look);
    }
    if (this.shake > 0) {
      const k = this.shake * this.shake * 0.4;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
      cam.position.z += (Math.random() - 0.5) * k;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.look);
  }

  /** The follow-camera framing for path position s (used to end the intro flight there). */
  followShot(s: number, y: number, r: number): Shot {
    return {
      pos: this.course.point(s + LEAD, r + DIST, y + HEIGHT),
      look: this.course.point(s + LEAD, r, y + 1.05),
    };
  }
}
