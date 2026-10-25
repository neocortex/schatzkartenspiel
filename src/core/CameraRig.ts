/**
 * CameraRig — smooth third-person follow camera with look-ahead, dialogue
 * zoom, terrain avoidance and scripted cinematic shots with eased blending.
 */

import * as THREE from "three";

export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

export class CameraRig {
  /** Point the camera currently looks at. */
  readonly look = new THREE.Vector3();
  /** Default offset from the target (behind and above). */
  readonly offset = new THREE.Vector3(0, 8.2, 12.5);
  zoom = 1;
  private targetZoom = 1;
  private desired = new THREE.Vector3();
  private followPos = new THREE.Vector3();
  private shot: Shot | null = null;
  private shotBlend = 0;
  private shotSpeed = 1;
  private releasing = false;
  private shake = 0;
  private tmp = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private groundHeight: (x: number, z: number) => number,
  ) {}

  /** Yaw of the camera around the Y axis (0 = looking north / -z). */
  get yaw(): number {
    return Math.atan2(-this.offset.x, this.offset.z);
  }

  /** Follow a target, leading slightly in the direction it moves. */
  follow(target: THREE.Vector3, velocity: THREE.Vector3): void {
    this.desired.set(target.x + velocity.x * 0.35, target.y + 0.9, target.z + velocity.z * 0.25);
  }

  /** Snap instantly to the current follow target (after teleports / scene start). */
  snap(): void {
    this.look.copy(this.desired);
    this.zoom = this.targetZoom;
  }

  setZoom(z: number): void {
    this.targetZoom = z;
  }

  /** Blend to a fixed cinematic shot over `seconds`. Pass null to return to following. */
  setShot(shot: Shot | null, seconds = 1.2): void {
    this.shotSpeed = 1 / Math.max(seconds, 0.01);
    this.releasing = !shot;
    if (shot) this.shot = { pos: shot.pos.clone(), look: shot.look.clone() };
  }

  /** Cut straight to a shot (cinematics drive this every frame); release with `setShot(null)`. */
  jumpToShot(shot: Shot): void {
    this.shot = { pos: shot.pos.clone(), look: shot.look.clone() };
    this.shotBlend = 1;
    this.releasing = false;
  }

  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, 1.2);
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 5);
    this.look.lerp(this.desired, k);
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-dt * 3));

    this.followPos.copy(this.look).addScaledVector(this.offset, this.zoom);
    // Reason: never let the camera dip into a hill behind the player
    const floor = this.groundHeight(this.followPos.x, this.followPos.z) + 2.5;
    if (this.followPos.y < floor) this.followPos.y = floor;

    if (this.releasing) {
      this.shotBlend = Math.max(0, this.shotBlend - dt * this.shotSpeed);
      if (this.shotBlend === 0) {
        this.shot = null;
        this.releasing = false;
      }
    } else if (this.shot) {
      this.shotBlend = Math.min(1, this.shotBlend + dt * this.shotSpeed);
    }

    const e = this.shotBlend * this.shotBlend * (3 - 2 * this.shotBlend);
    if (this.shot && e > 0) {
      this.camera.position.lerpVectors(this.followPos, this.shot.pos, e);
      this.tmp.lerpVectors(this.look, this.shot.look, e);
    } else {
      this.camera.position.copy(this.followPos);
      this.tmp.copy(this.look);
    }

    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(this.tmp);
  }

  /** The point the view is centred on (for shadows, grass, ambient life). */
  get focus(): THREE.Vector3 {
    return this.tmp;
  }
}
