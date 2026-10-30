/**
 * The fishing camera: glides smoothly between fixed shots (overlooking the
 * water while playing, facing the crew for talks, close on a fresh catch)
 * with a gentle hand-held sway and a little shake for splashes.
 */

import * as THREE from "three";

export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const SHOTS = {
  /** Over Tadeo's shoulder across the lagoon, horizon at the top. */
  play: { pos: v(0.9, 6.0, 4.4), look: v(-0.15, -1.0, -7.0) },
  /** From the water, facing Jonas, Tadeo and Chuleta. */
  talk: { pos: v(0.9, 1.85, -4.6), look: v(-0.2, 1.25, 0.1) },
  /** Close on a fresh catch held up in front of Tadeo (HOLD_AT in crew.ts), from the water side. */
  show: { pos: v(-0.18, 2.35, -3.7), look: v(-0.13, 1.75, -0.4) },
  /** Establishing shot from the beach over the jetty out to sea: sun glitter, islands, sails. */
  opening: { pos: v(2.8, 4.0, 9.5), look: v(1.0, 1.0, -10) },
} satisfies Record<string, Shot>;

export class ShotCamera {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private goal: Shot = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private speed = 2;
  private shake = 0;
  private flight: { from: Shot; t: number; dur: number; lift: number } | null = null;
  private tmp = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Glide towards a shot; `speed` ~0.5 (slow drift) … 4 (quick cut-like move). */
  set(shot: Shot, speed = 2): void {
    this.goal.pos.copy(shot.pos);
    this.goal.look.copy(shot.look);
    this.speed = speed;
  }

  /** Jump straight to a shot. */
  cut(shot: Shot): void {
    this.set(shot);
    this.flight = null;
    this.pos.copy(shot.pos);
    this.look.copy(shot.look);
  }

  /**
   * Crane over to a shot in `seconds`, rising `lift` metres in the middle so the
   * camera passes above the crew and their rods instead of through them.
   * A `set` during the flight just moves its destination.
   */
  fly(shot: Shot, seconds: number, lift = 0): void {
    this.set(shot);
    this.flight = { from: { pos: this.pos.clone(), look: this.look.clone() }, t: 0, dur: seconds, lift };
  }

  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, 1);
  }

  update(dt: number, time: number): void {
    const f = this.flight;
    if (f) {
      f.t = Math.min(f.t + dt, f.dur);
      const s = THREE.MathUtils.smootherstep(f.t / f.dur, 0, 1);
      this.pos.lerpVectors(f.from.pos, this.goal.pos, s);
      this.pos.y += f.lift * 4 * s * (1 - s);
      this.look.lerpVectors(f.from.look, this.goal.look, s);
      if (f.t >= f.dur) this.flight = null;
    } else {
      const k = 1 - Math.exp(-dt * this.speed);
      this.pos.lerp(this.goal.pos, k);
      this.look.lerp(this.goal.look, k);
    }
    // Reason: a slow hand-held drift keeps the fixed shots feeling alive
    this.camera.position.copy(this.pos).add(this.tmp.set(Math.sin(time * 0.31) * 0.06, Math.sin(time * 0.47) * 0.04, 0));
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(this.look);
  }
}
