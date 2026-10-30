/**
 * BombDirector — decides when and where the volcano throws its bombs. Fair
 * for a seven-year-old: every dangerous bomb lands inside the trail with a
 * long warning ring, never right on top of another one, never two at once
 * on the same spot, and the pace only picks up gently towards the goal.
 * Harmless "show" bombs splash into the sea or thud onto the ash fields.
 */

import * as THREE from "three";
import { Course, RIVER_HALF } from "./course";
import { Bombs } from "./bombs";
import { Peak } from "./peak";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** No bomb lands closer than this to a hop rock. */
const ROCK_CLEARANCE = 3;

export class BombDirector {
  /** False = only harmless show bombs (intro, after winning). */
  dangerous = false;
  /** Seconds without dangerous bombs (after a respawn). */
  grace = 0;
  /** Bombs ever launched at a spot near a hop rock; the rules below keep it at zero. */
  bombsNearRocks = 0;
  private timer = 1.4;
  private showTimer = 0.4;

  constructor(
    private course: Course,
    private bombs: Bombs,
    private peak: Peak,
    private interval: [start: number, end: number],
  ) {}

  /** Seconds between dangerous bombs at course progress `p` (0 at the start, 1 at the goal). */
  intervalAt(p: number): number {
    return THREE.MathUtils.lerp(this.interval[0], this.interval[1], p);
  }

  update(dt: number, player: THREE.Vector3, playerS: number, velocity: THREE.Vector3): void {
    const c = this.course;
    this.grace = Math.max(0, this.grace - dt);
    this.showTimer -= dt;
    if (this.showTimer <= 0) {
      this.showTimer = rnd(0.7, 1.4);
      this.show(playerS);
    }
    if (!this.dangerous || this.grace > 0) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const p = c.progress(playerS);
    this.timer = this.intervalAt(p) * rnd(0.85, 1.15);
    const dur = rnd(2.45, 2.85);
    const target = this.pickTarget(player, playerS, velocity, dur);
    if (target && this.launch(target, true, dur)) this.peak.erupt(0.8);
  }

  private nearRock(x: number, z: number): boolean {
    return this.course.rocks.some((r) => Math.hypot(x - r.x, z - r.z) < ROCK_CLEARANCE);
  }

  private launch(target: THREE.Vector3, dangerous: boolean, dur: number, sea = false): boolean {
    if (this.nearRock(target.x, target.z)) this.bombsNearRocks++;
    return this.bombs.launch(target, dangerous, dur, sea);
  }

  /** A walkable landing spot ahead of / around Tadeo that keeps every ring readable. */
  private pickTarget(player: THREE.Vector3, playerS: number, velocity: THREE.Vector3, dur: number): THREE.Vector3 | null {
    const c = this.course;
    for (let attempt = 0; attempt < 8; attempt++) {
      let x: number;
      let z: number;
      const kind = Math.random();
      if (kind < 0.45) {
        // Reason: 25 % lead Tadeo (where he'd be if he just kept walking) so running straight
        // through doesn't work; 20 % land where he stands so waiting forever doesn't either.
        // Either way the ring shows ~2.5 s ahead: plenty of time to stop or step aside.
        const lead = kind < 0.25 ? dur * rnd(0.9, 1) : 0;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * (lead ? 0.9 : 1.2);
        x = player.x + velocity.x * lead + Math.cos(a) * r;
        z = player.z + velocity.z * lead + Math.sin(a) * r;
      } else {
        const s = playerS + rnd(2, 17);
        const pt = c.pointAt(s);
        const t = c.tangentAt(s);
        const off = rnd(-1, 1) * Math.max(0.5, c.halfWidth(s) - 0.7);
        x = pt.x - t.y * off;
        z = pt.y + t.x * off;
      }
      if (!c.canStand(x, z)) continue;
      // Reason: a ring on the stub while he lines up a jump would be unfair, so the whole crossing stays clear
      if (c.canLeap(x, z) || this.nearRock(x, z)) continue;
      if (c.trailS(x, z) > c.goalS - 3 || c.trailS(x, z) < 6) continue;
      const pos = new THREE.Vector3(x, c.ground(x, z), z);
      const crowded = this.bombs.flying.some((b) => b.dangerous && b.to.distanceTo(pos) < 2.6);
      if (crowded) continue;
      return pos;
    }
    return null;
  }

  /** Harmless spectacle: a bomb into the sea or onto the ash fields within view. */
  private show(playerS: number): void {
    const c = this.course;
    const s = Math.min(playerS + rnd(-6, 40), c.trail.length);
    const pt = c.pointAt(s);
    const t = c.tangentAt(s);
    const side = Math.random() < 0.55 ? 1 : -1;
    const off = c.halfWidth(s) + rnd(9, 32);
    const x = pt.x - t.y * off * side;
    const z = pt.y + t.x * off * side;
    if (c.riverDist(x, z) < RIVER_HALF + 1 || this.nearRock(x, z)) return;
    const sea = c.natural(x, z) < -0.2;
    const y = sea ? 0 : c.terrain(x, z);
    if (this.launch(new THREE.Vector3(x, y, z), false, rnd(2.4, 3.2), sea)) this.peak.erupt(0.6);
  }
}
