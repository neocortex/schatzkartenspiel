/**
 * The climbing course: a helix of platforms winding up a conical mountain.
 * Gameplay is 2.5D — a position along the path `s` (metres) plus a height —
 * and this module maps it into the world: the path angle θ(s) shrinks as
 * `s` grows (so walking forward always moves right on screen for a camera
 * outside the mountain), and each platform sits at the radius where the cone
 * surface meets its top height, so higher platforms tuck in closer.
 *
 * The course is authored as a sequence (ledge, gap, step, ladder, ...) and
 * also answers collision queries: platform top under a point, walls ahead.
 */

import * as THREE from "three";

export type PieceKind = "ledge" | "boards" | "stone" | "bridge" | "stairs";

export interface Piece {
  kind: PieceKind;
  s0: number;
  s1: number;
  /** Top height at s0 and s1 (linear in between). */
  y0: number;
  y1: number;
  /** Downward dip in the middle (rope bridges). */
  sag: number;
}

/** A ladder at the wall where a higher piece starts (`s`), from `yb` up to `yt`. */
export interface Ladder {
  s: number;
  yb: number;
  yt: number;
}

export interface Checkpoint {
  s: number;
  name: string;
}

export interface Zone {
  s0: number;
  s1: number;
}

/** Summit plateau height and radius; the cone tapers from its base to this rim. */
export const SUMMIT_Y = 48;
export const SUMMIT_R = 7;
const CONE_SPAN = 26;
const CONE_POW = 1.2;
/** Platform centre line sits this far outside the cone surface at its top height. */
const OFFSET = 0.75;
/** Radial depth of the platforms. */
export const DEPTH = 2.8;
/** Path angle at s = 0 (south-east side, facing the morning sun). */
const THETA0 = Math.PI * 0.42;

/** Cone radius at height y. */
export function coneR(y: number): number {
  const k = THREE.MathUtils.clamp(1 - y / SUMMIT_Y, 0, 1);
  return SUMMIT_R + CONE_SPAN * Math.pow(k, CONE_POW);
}

/** Cone surface height at radius r (0 beyond the cone's foot). */
export function coneH(r: number): number {
  if (r <= SUMMIT_R) return SUMMIT_Y;
  const x = (r - SUMMIT_R) / CONE_SPAN;
  if (x >= 1) return 0;
  return SUMMIT_Y * (1 - Math.pow(x, 1 / CONE_POW));
}

/** Number of steps on a flight of stairs. */
export function stairCount(p: Piece): number {
  return Math.max(1, Math.round((p.s1 - p.s0) / 0.5));
}

/** Radius of a platform centre line whose top is at height y. */
export function pathR(y: number): number {
  return coneR(y) + OFFSET;
}

class CourseBuilder {
  s = 0;
  y: number;
  pieces: Piece[] = [];
  ladders: Ladder[] = [];
  checkpoints: Checkpoint[] = [];
  chutes: Zone[] = [];
  drops: Zone[] = [];

  constructor(y: number) {
    this.y = y;
  }

  piece(kind: PieceKind, len: number, rise = 0, sag = 0): this {
    this.pieces.push({ kind, s0: this.s, s1: this.s + len, y0: this.y, y1: this.y + rise, sag });
    this.s += len;
    this.y += rise;
    return this;
  }

  gap(len: number, rise = 0): this {
    this.s += len;
    this.y += rise;
    return this;
  }

  step(rise: number): this {
    this.y += rise;
    return this;
  }

  ladder(rise: number): this {
    this.ladders.push({ s: this.s, yb: this.y, yt: this.y + rise });
    this.y += rise;
    return this;
  }

  stones(n: number, len: number, gap: number, rise: number): this {
    for (let i = 0; i < n; i++) {
      if (i > 0) this.gap(gap, rise);
      this.piece("stone", len);
    }
    return this;
  }

  checkpoint(name: string, back = 2): this {
    this.checkpoints.push({ s: this.s - back, name });
    return this;
  }

  zone(list: Zone[], len: number): this {
    list.push({ s0: this.s, s1: this.s + len });
    return this;
  }
}

/** The authored climb: foothills → rock face → snow field → summit stairs. */
function author(): CourseBuilder {
  const b = new CourseBuilder(6.6);
  // 1 · Foothills: meadow start, first small gaps and a step-up
  b.piece("ledge", 11).checkpoint("Start", 8);
  b.piece("ledge", 8, 1.2).gap(1.3).piece("ledge", 6, 0.4);
  b.step(0.85).piece("ledge", 5);
  b.gap(1.3, 0.3).stones(3, 2.0, 1.3, 0.45).gap(1.3, 0.3);
  b.piece("ledge", 9, 2.2).piece("ledge", 6).checkpoint("Felswand", 3);
  // 2 · Rock face: boardwalk, ladder, rolling-rock ramp
  b.piece("boards", 12, 2.6).piece("ledge", 4.5);
  b.ladder(3.8).piece("ledge", 4.5);
  b.zone(b.chutes, 17).piece("ledge", 17, 4.6);
  b.piece("ledge", 6).checkpoint("Schneefeld", 3);
  // 3 · Snow: gaps, falling snowballs, rope bridge, ladder, icy stepping stones
  b.zone(b.drops, 34);
  b.piece("ledge", 7, 1.6).gap(1.5, 0.3).piece("ledge", 5);
  b.piece("bridge", 8, 0.5, 0.35).piece("ledge", 9, 2.3);
  b.piece("ledge", 3).ladder(3.6).piece("ledge", 4.5);
  b.gap(1.2, 0.2).stones(3, 1.9, 1.25, 0.4).gap(1.2, 0.2);
  b.piece("ledge", 7, 1.8).piece("ledge", 4).checkpoint("Gipfelweg", 2);
  // 4 · Summit stairs up to the plateau rim
  b.piece("stairs", 18, SUMMIT_Y - 1.5 - b.y).piece("stairs", 4, 1.5).piece("ledge", 2.5);
  return b;
}

export class Course {
  readonly pieces: Piece[];
  readonly ladders: Ladder[];
  readonly checkpoints: Checkpoint[];
  readonly chutes: Zone[];
  readonly drops: Zone[];
  readonly length: number;
  /** Where the summit sequence starts. */
  readonly end: number;
  private thetaTable: Float32Array;
  private static readonly STEP = 0.25;

  constructor() {
    const b = author();
    this.pieces = b.pieces;
    this.ladders = b.ladders;
    this.checkpoints = b.checkpoints;
    this.chutes = b.chutes;
    this.drops = b.drops;
    this.length = b.s;
    this.end = b.s - 1.6;
    this.thetaTable = this.integrateTheta();
  }

  /** θ(s) = θ0 − ∫ ds / r over a smoothed path height (one table, linear lookup). */
  private integrateTheta(): Float32Array {
    const n = Math.ceil(this.length / Course.STEP) + 2;
    const table = new Float32Array(n);
    let th = THETA0;
    for (let i = 0; i < n; i++) {
      table[i] = th;
      const s = i * Course.STEP;
      // Reason: average the nominal height over ±3 m so ladders don't kink the curve
      let y = 0;
      for (let k = -3; k <= 3; k++) y += this.nominalY(s + k);
      th -= Course.STEP / pathR(y / 7);
    }
    return table;
  }

  theta(s: number): number {
    const f = THREE.MathUtils.clamp(s / Course.STEP, 0, this.thetaTable.length - 1.001);
    const i = Math.floor(f);
    return this.thetaTable[i] + (this.thetaTable[i + 1] - this.thetaTable[i]) * (f - i);
  }

  /** Path height ignoring gaps (interpolates across them) — for layout, not collision. */
  nominalY(s: number): number {
    const ps = this.pieces;
    if (s <= ps[0].s0) return ps[0].y0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (s <= p.s1) {
        if (s >= p.s0) return this.top(p, s);
        const prev = ps[i - 1];
        return THREE.MathUtils.lerp(prev.y1, p.y0, (s - prev.s1) / (p.s0 - prev.s1));
      }
    }
    return ps[ps.length - 1].y1;
  }

  /** World point at path position s, radius r, height y. */
  point(s: number, r: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
    const th = this.theta(s);
    return out.set(Math.cos(th) * r, y, Math.sin(th) * r);
  }

  /** Outward (radial) unit vector at s. */
  normal(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const th = this.theta(s);
    return out.set(Math.cos(th), 0, Math.sin(th));
  }

  /** Unit vector pointing towards +s (walking forward). */
  tangent(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const th = this.theta(s);
    return out.set(Math.sin(th), 0, -Math.cos(th));
  }

  top(p: Piece, s: number): number {
    let t = THREE.MathUtils.clamp((s - p.s0) / (p.s1 - p.s0), 0, 1);
    if (p.kind === "stairs") {
      // Reason: stairs collide as real steps (each lower than the walk-up limit)
      const n = stairCount(p);
      t = Math.min(Math.floor(t * n) + 1, n) / n;
    }
    return p.y0 + (p.y1 - p.y0) * t - p.sag * 4 * t * (1 - t);
  }

  pieceAt(s: number): Piece | null {
    for (const p of this.pieces) if (s >= p.s0 && s <= p.s1) return p;
    return null;
  }

  /** Highest platform top under a foot span [s − hw, s + hw]; −Infinity over a gap. */
  support(s: number, hw: number): number {
    let best = -Infinity;
    for (const p of this.pieces) {
      if (p.s1 < s - hw || p.s0 > s + hw) continue;
      best = Math.max(best, this.top(p, THREE.MathUtils.clamp(s, p.s0, p.s1)));
    }
    return best;
  }

  /**
   * First platform edge between `from` and `to` (moving in `dir`) whose top
   * is higher than `maxY`; returns the s where the body must stop, or null.
   */
  wall(from: number, to: number, dir: number, maxY: number): number | null {
    let hit: number | null = null;
    for (const p of this.pieces) {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      if (p.s1 < lo || p.s0 > hi) continue;
      const edge = dir > 0 ? Math.max(p.s0, lo) : Math.min(p.s1, hi);
      if (this.top(p, edge) <= maxY) continue;
      if (hit === null || (dir > 0 ? edge < hit : edge > hit)) hit = edge;
    }
    return hit;
  }

  /** Platform radius for a top height (higher platforms sit closer to the axis). */
  radius(y: number): number {
    return pathR(y);
  }

  ladderNear(s: number, y: number): Ladder | null {
    for (const l of this.ladders) if (s > l.s - 1.4 && s < l.s + 0.2 && Math.abs(y - l.yb) < 0.6) return l;
    return null;
  }

  inZone(list: Zone[], s: number, margin = 0): boolean {
    return list.some((z) => s >= z.s0 - margin && s <= z.s1 + margin);
  }

  /** Gaps (start, end, landing height) — used by the autopilot in the E2E test. */
  gaps(): { s0: number; s1: number; y: number }[] {
    const out: { s0: number; s1: number; y: number }[] = [];
    for (let i = 1; i < this.pieces.length; i++) {
      const a = this.pieces[i - 1];
      const b = this.pieces[i];
      if (b.s0 - a.s1 > 0.05) out.push({ s0: a.s1, s1: b.s0, y: b.y0 });
    }
    return out;
  }

  /** Step-ups that need a jump (higher than the walk-up limit), excluding ladders. */
  steps(limit: number): { s: number; rise: number }[] {
    const out: { s: number; rise: number }[] = [];
    for (let i = 1; i < this.pieces.length; i++) {
      const a = this.pieces[i - 1];
      const b = this.pieces[i];
      const rise = b.y0 - a.y1;
      if (rise > limit && !this.ladders.some((l) => Math.abs(l.s - b.s0) < 0.1)) out.push({ s: b.s0, rise });
    }
    return out;
  }
}
