/**
 * Small helpers shared by the critter simulations: picking a spawn spot near
 * the focus that satisfies a terrain rule, and steering angles.
 */

import * as THREE from "three";

/** Random float in [lo, hi). */
export const rnd = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/**
 * Rejection-sample a point in the ring [rMin, rMax] around (cx, cz) for which
 * `ok(x, z)` holds. Writes it to `out` (x, y = z) and returns true on success.
 */
export function findSpot(
  cx: number,
  cz: number,
  rMin: number,
  rMax: number,
  tries: number,
  ok: (x: number, z: number) => boolean,
  out: THREE.Vector2,
): boolean {
  for (let k = 0; k < tries; k++) {
    // Reason: sqrt of a uniform radius² keeps the density even across the ring
    const r = Math.sqrt(rnd(rMin * rMin, rMax * rMax));
    const a = Math.random() * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (ok(x, z)) {
      out.set(x, z);
      return true;
    }
  }
  return false;
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
}

/** Turn `from` towards `to` by at most `maxStep` radians (shortest way round). */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  return from + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}

/** Yaw (forward = +z) pointing from (x, z) towards (tx, tz). */
export const yawTo = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);
