/**
 * Director — the challenge camera. Cuts or glides (eased) between framed
 * shots, can smoothly track a moving shot (following Tadeo, orbiting the
 * treasure), adds a faint hand-held drift so still shots feel alive, and
 * shakes on impacts.
 */

import * as THREE from "three";

export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

export const shot = (px: number, py: number, pz: number, lx: number, ly: number, lz: number): Shot => ({
  pos: new THREE.Vector3(px, py, pz),
  look: new THREE.Vector3(lx, ly, lz),
});

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class Director {
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  /** Amplitude of the idle hand-held drift (world units). */
  drift = 0.05;
  private from: Shot = shot(0, 0, 0, 0, 0, -1);
  private to: Shot = shot(0, 0, 0, 0, 0, -1);
  private t = 1;
  private duration = 1;
  private tracker: (() => Shot) | null = null;
  private sharpness = 3;
  private shakeAmt = 0;
  private time = 0;
  private done: (() => void) | null = null;
  private tmp = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Jump straight to a shot. */
  cut(s: Shot): void {
    this.settle();
    this.tracker = null;
    this.pos.copy(s.pos);
    this.look.copy(s.look);
    this.to = { pos: s.pos.clone(), look: s.look.clone() };
    this.t = 1;
  }

  /** Glide from the current view to a shot over `seconds` (smootherstep easing). */
  move(s: Shot, seconds = 1.2): Promise<void> {
    this.settle();
    this.tracker = null;
    this.from = { pos: this.pos.clone(), look: this.look.clone() };
    this.to = { pos: s.pos.clone(), look: s.look.clone() };
    this.t = 0;
    this.duration = Math.max(seconds, 0.01);
    return new Promise((resolve) => (this.done = resolve));
  }

  /** Follow a shot computed every frame (exponential smoothing; higher sharpness = tighter). */
  track(fn: () => Shot, sharpness = 3): void {
    this.settle();
    this.tracker = fn;
    this.sharpness = sharpness;
  }

  /** Resolve a pending glide (it was interrupted or has finished). */
  private settle(): void {
    const d = this.done;
    this.done = null;
    d?.();
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(this.shakeAmt + amount, 1.2);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.tracker) {
      const s = this.tracker();
      const k = 1 - Math.exp(-dt * this.sharpness);
      this.pos.lerp(s.pos, k);
      this.look.lerp(s.look, k);
    } else if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.duration);
      const e = smoother(this.t);
      this.pos.lerpVectors(this.from.pos, this.to.pos, e);
      this.look.lerpVectors(this.from.look, this.to.look, e);
      if (this.t >= 1) this.settle();
    }

    const cam = this.camera;
    cam.position.copy(this.pos);
    // Reason: two slow incommensurate sines read as a gentle hand-held float, never as a loop
    const d = this.drift;
    cam.position.x += Math.sin(this.time * 0.37) * d + Math.sin(this.time * 0.91) * d * 0.4;
    cam.position.y += Math.sin(this.time * 0.53 + 1.3) * d * 0.6;
    if (this.shakeAmt > 0) {
      const s = this.shakeAmt * this.shakeAmt * 0.3;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.8);
    }
    this.tmp.copy(this.look);
    cam.lookAt(this.tmp);
  }
}
