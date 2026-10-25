/**
 * Director — the challenge camera. Glides between framed shots with eased
 * damping, can cut instantly, adds a gentle hand-held drift so still shots
 * feel alive, and supports camera shake and FOV punches for big hits.
 */

import * as THREE from "three";

export class Director {
  /** Current (smoothed) camera position and look-at point. */
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  private toPos = new THREE.Vector3();
  private toLook = new THREE.Vector3();
  private rate = 3;
  private shakeAmt = 0;
  private fovKick = 0;
  private t = 0;
  private tmp = new THREE.Vector3();
  /** Amount of slow hand-held drift (world units). */
  drift = 0.08;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private baseFov = camera.fov,
  ) {}

  /** Jump straight to a shot. */
  cut(pos: THREE.Vector3, look: THREE.Vector3): void {
    this.pos.copy(pos);
    this.toPos.copy(pos);
    this.look.copy(look);
    this.toLook.copy(look);
    this.apply();
  }

  /** Glide to a shot; `seconds` is roughly how long the move takes to settle. */
  move(pos: THREE.Vector3, look: THREE.Vector3, seconds = 1): void {
    this.toPos.copy(pos);
    this.toLook.copy(look);
    this.rate = 4 / Math.max(seconds, 0.05);
  }

  /** Retarget only the look-at point (keeps the move speed). */
  aim(look: THREE.Vector3): void {
    this.toLook.copy(look);
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(this.shakeAmt + amount, 1.4);
  }

  /** Briefly widen (positive) or narrow (negative) the field of view. */
  punch(degrees: number): void {
    this.fovKick += degrees;
  }

  setFov(fov: number): void {
    this.baseFov = fov;
  }

  update(dt: number): void {
    this.t += dt;
    const k = 1 - Math.exp(-dt * this.rate);
    this.pos.lerp(this.toPos, k);
    this.look.lerp(this.toLook, k);
    this.fovKick *= Math.exp(-dt * 6);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    this.apply();
  }

  private apply(): void {
    const cam = this.camera;
    cam.position.copy(this.pos);
    // Reason: slow incommensurate sines read as a calm hand-held camera, never a loop
    const d = this.drift;
    cam.position.x += Math.sin(this.t * 0.37) * d;
    cam.position.y += Math.sin(this.t * 0.51 + 1.3) * d * 0.6;
    if (this.shakeAmt > 0) {
      const s = this.shakeAmt * this.shakeAmt * 0.45;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s * 0.5;
    }
    this.tmp.copy(this.look);
    cam.lookAt(this.tmp);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
