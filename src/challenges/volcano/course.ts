/**
 * Volcano course layout: a winding ash trail along the coast at the foot of
 * the volcano, crossed by three lava rivers, with checkpoints and a green goal
 * meadow at the north end. The first river keeps its stone bridge; the eruptions
 * broke the other two, which leaves short stubs on each bank and a hop rock
 * standing in the lava between them.
 *
 * World units: x = east, z = south, y = up, sea level y = 0. Distances to the
 * trail and the rivers are stamped once into a grid so height and
 * walkability queries are cheap enough to run every frame.
 */

import * as THREE from "three";
import { Noise2D, clamp, smoothstep, lerp } from "../../core/noise";

export type P2 = [number, number];

/** Volcano centre (x, z), crater rim height and cone base radius. */
export const VOLCANO = { x: -78, z: -84, rim: 42, base: 72, crater: 11 } as const;

const TRAIL: P2[] = [[4, 62], [3, 48], [8, 34], [12, 20], [9, 6], [3, -8], [5, -22], [12, -36], [15, -50], [15, -62], [14, -74]];

/** Lava rivers from the crater rim down the cone, across the trail and into the sea. */
const RIVERS: P2[][] = [
  [[-74.3, -72.6], [-67.3, -50.7], [-58, -22], [-38, -8], [-16, 8], [4, 22], [22, 31], [44, 38]],
  [[-72.4, -73.4], [-66.3, -61.9], [-60, -50], [-38, -36], [-14, -18], [6, -6], [24, 3], [46, 8]],
  [[-67.1, -79.1], [-56, -74], [-34, -62], [-12, -46], [8, -34], [26, -27], [48, -24]],
];

export const RIVER_HALF = 2.1;
/** Arc length along the trail where the goal begins. */
export const GOAL_DIST = 8;
const BRIDGE_HALF_W = 1.55;
/** Rivers whose bridge the eruptions broke: the first river keeps its own to teach the course. */
const BROKEN_RIVERS = [1, 2];
/** Closer to a river's centre line than this, the ground is too hot to walk on. */
const BANK_DIST = RIVER_HALF + 0.9;
/**
 * Hop sizes for a seven-year-old. A running jump flies 0.65 s x 6.2 = 4.0 units and a jump from a standstill
 * about 3, so each gap is an easy jump from a stop, and each rock ends past 4.0 units so a running jump can't overshoot it.
 */
const HOP_GAP = 1.9;
const ROCK_R_MIN = 1.35;
const ROCK_R_MAX = 1.6;
/** A rock's top sits this far below the stubs' ends, so every hop lands a little downhill or barely up. */
const ROCK_BELOW_DECK = 0.3;
/** Half-width of the corridor an airborne Tadeo may fly through at a broken crossing. */
const LEAP_HALF_W = BRIDGE_HALF_W + 1.75;

export interface Polyline {
  pts: THREE.Vector2[];
  s: number[];
  length: number;
}

export interface Bridge {
  center: THREE.Vector2;
  /** Unit direction along the deck (trail direction). */
  dir: THREE.Vector2;
  halfLen: number;
  halfW: number;
  /** Deck height at the ends. */
  y: number;
  river: number;
  /** The stretch of deck the eruptions took, in metres from `center` along `dir` (null on a whole bridge). */
  gap: [from: number, to: number] | null;
}

/** A rock to jump onto at a broken crossing. */
export interface HopRock {
  x: number;
  z: number;
  /** Radius of the part Tadeo can stand on. */
  r: number;
  /** Height of its flat top. */
  y: number;
}

export interface Checkpoint {
  s: number;
  pos: THREE.Vector2;
  /** Trail direction (yaw for the respawn facing). */
  facing: number;
}

/** Catmull-Rom through the points, resampled every `step` metres with arc length. */
function polyline(points: P2[], step: number): Polyline {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const n = Math.ceil(curve.getLength() / step);
  const pts = curve.getSpacedPoints(n).map((p) => new THREE.Vector2(p.x, p.z));
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, s, length: s[s.length - 1] };
}

/** Grid that stores, per cell, the distance to the nearest stamped line and the arc length there. */
class Field {
  static readonly X0 = -112;
  static readonly Z0 = -122;
  static readonly CELL = 0.5;
  static readonly NX = 330;
  static readonly NZ = 392;
  readonly dist = new Float32Array(Field.NX * Field.NZ).fill(99);
  readonly s = new Float32Array(Field.NX * Field.NZ);
  readonly id = new Int8Array(Field.NX * Field.NZ).fill(-1);

  stamp(line: Polyline, radius: number, id: number): void {
    const C = Field.CELL;
    const rc = Math.ceil(radius / C);
    line.pts.forEach((p, k) => {
      const ci = Math.round((p.x - Field.X0) / C);
      const cj = Math.round((p.y - Field.Z0) / C);
      for (let j = Math.max(0, cj - rc); j <= Math.min(Field.NZ - 1, cj + rc); j++) {
        for (let i = Math.max(0, ci - rc); i <= Math.min(Field.NX - 1, ci + rc); i++) {
          const d = Math.hypot(Field.X0 + i * C - p.x, Field.Z0 + j * C - p.y);
          const c = j * Field.NX + i;
          if (d < this.dist[c]) {
            this.dist[c] = d;
            this.s[c] = line.s[k];
            this.id[c] = id;
          }
        }
      }
    });
  }

  /** Bilinear distance (99 outside the grid). */
  distAt(x: number, z: number): number {
    const fx = (x - Field.X0) / Field.CELL;
    const fz = (z - Field.Z0) / Field.CELL;
    if (fx < 0 || fz < 0 || fx >= Field.NX - 1 || fz >= Field.NZ - 1) return 99;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const c = j * Field.NX + i;
    const d = this.dist;
    return lerp(lerp(d[c], d[c + 1], tx), lerp(d[c + Field.NX], d[c + Field.NX + 1], tx), tz);
  }

  /** Nearest-cell lookup of an integer/arc-length channel. */
  cell(x: number, z: number): number {
    const i = Math.round((x - Field.X0) / Field.CELL);
    const j = Math.round((z - Field.Z0) / Field.CELL);
    if (i < 0 || j < 0 || i >= Field.NX || j >= Field.NZ) return -1;
    return j * Field.NX + i;
  }
}

const noise = new Noise2D(4242);

export class Course {
  readonly trail = polyline(TRAIL, 0.35);
  readonly rivers = RIVERS.map((r) => polyline(r, 0.35));
  readonly bridges: Bridge[] = [];
  readonly rocks: HopRock[] = [];
  readonly checkpoints: Checkpoint[] = [];
  /** Arc length at which the goal meadow starts. */
  readonly goalS: number;
  private trailField = new Field();
  private riverField = new Field();
  private trailY: number[];
  private riverY: number[][];

  constructor() {
    this.trailField.stamp(this.trail, 16, 0);
    this.rivers.forEach((r, i) => this.riverField.stamp(r, 9, i));
    this.goalS = this.trail.length - GOAL_DIST - 6;

    // Reason: smoothed height profiles make the trail and the lava channels
    // run level across the bumpy ground instead of following every lump
    this.trailY = smoothProfile(this.trail.pts.map((p) => this.natural(p.x, p.y)), 22);
    this.riverY = this.rivers.map((r) => {
      const raw = smoothProfile(r.pts.map((p) => this.natural(p.x, p.y) - 0.7), 14);
      // Lava flows downhill: never rise again along the river
      for (let i = 1; i < raw.length; i++) raw[i] = Math.min(raw[i], raw[i - 1] - 0.002);
      return raw.map((y) => Math.max(y, 0.25));
    });

    this.rivers.forEach((r, i) => this.addBridge(r, i));
    for (const b of this.bridges) if (BROKEN_RIVERS.includes(b.river)) this.breakBridge(b);
    this.bridges.sort((a, b) => this.trailS(a.center.x, a.center.y) - this.trailS(b.center.x, b.center.y));
    // Checkpoints: the start, just past every bridge (bridges are listed south → north)
    const starts = [4, ...this.bridges.map((b) => this.trailS(b.center.x, b.center.y) + b.halfLen + 4)];
    for (const s of starts.sort((a, b) => a - b)) {
      const p = this.pointAt(s);
      const t = this.tangentAt(s);
      this.checkpoints.push({ s, pos: p, facing: Math.atan2(t.x, t.y) });
    }
  }

  /** Bridge where the trail crosses river `i` (closest approach of the two lines). */
  private addBridge(river: Polyline, i: number): void {
    let best = { d: 1e9, k: 0 };
    river.pts.forEach((p, k) => {
      const d = this.trailField.distAt(p.x, p.y);
      if (d < best.d) best = { d, k };
    });
    const rp = river.pts[best.k];
    const s = this.trailS(rp.x, rp.y);
    const center = this.pointAt(s);
    const dir = this.tangentAt(s);
    const ry = this.riverY[i][best.k];
    // Reason: a slanted crossing cuts a longer stretch of the trail, so the deck must reach further
    const k = Math.min(best.k + 3, river.pts.length - 1);
    const rdir = river.pts[k].clone().sub(river.pts[Math.max(best.k - 3, 0)]).normalize();
    const sin = Math.abs(dir.x * rdir.y - dir.y * rdir.x);
    const halfLen = clamp((RIVER_HALF + 1.7) / Math.max(sin, 0.3) + 0.6, 4.6, 8);
    this.bridges.push({ center, dir, halfLen, halfW: BRIDGE_HALF_W, y: Math.max(this.trailHeight(s), ry + 0.9), river: i, gap: null });
  }

  /** Takes the middle out of a bridge's deck and stands a hop rock where it was. */
  private breakBridge(b: Bridge): void {
    const point = (m: number) => new THREE.Vector2(b.center.x + b.dir.x * m, b.center.y + b.dir.y * m);
    // Walk in along the deck from either end until the bank stops
    let near = -b.halfLen;
    while (near < 0 && this.riverDist(point(near).x, point(near).y) > BANK_DIST) near += 0.05;
    let far = b.halfLen;
    while (far > 0 && this.riverDist(point(far).x, point(far).y) > BANK_DIST) far -= 0.05;
    const mid = (near + far) / 2;
    const r = clamp((far - near) / 2 - HOP_GAP, ROCK_R_MIN, ROCK_R_MAX);
    // Reason: a slanted crossing is too wide for one hop from the bank, so its stubs reach further out over the lava
    b.gap = [Math.max(near, mid - r - HOP_GAP), Math.min(far, mid + r + HOP_GAP)];
    const top = Math.min(deckHeight(b, b.gap[0] / b.halfLen), deckHeight(b, b.gap[1] / b.halfLen)) - ROCK_BELOW_DECK;
    const at = point(mid);
    this.rocks.push({ x: at.x, z: at.y, r, y: top });
  }

  // ── Trail queries ──────────────────────────────────────────

  /** Arc length of the nearest trail point (0 when off the grid). */
  trailS(x: number, z: number): number {
    const c = this.trailField.cell(x, z);
    return c < 0 ? 0 : this.trailField.s[c];
  }

  trailDist(x: number, z: number): number {
    return this.trailField.distAt(x, z);
  }

  pointAt(s: number): THREE.Vector2 {
    const k = this.index(s);
    return this.trail.pts[k].clone();
  }

  /** Unit trail direction at arc length s (averaged over a few metres). */
  tangentAt(s: number, span = 3): THREE.Vector2 {
    const a = this.trail.pts[this.index(s - span)];
    const b = this.trail.pts[this.index(s + span)];
    return b.clone().sub(a).normalize();
  }

  /** Walkable half-width of the trail at arc length s. */
  halfWidth(s: number): number {
    let w = 4.4 + noise.noise(s * 0.08, 3.3) * 0.8;
    for (const c of this.checkpoints) w += 1.6 * Math.exp(-(((s - c.s) / 4) ** 2));
    w += 4.5 * smoothstep(this.goalS - 4, this.goalS + 6, s);
    w += 1.5 * smoothstep(6, 0, s);
    return w;
  }

  trailHeight(s: number): number {
    return this.trailY[this.index(s)];
  }

  private index(s: number): number {
    const n = this.trail.pts.length - 1;
    return clamp(Math.round((s / this.trail.length) * n), 0, n);
  }

  // ── Rivers ─────────────────────────────────────────────────

  /** Distance to the nearest lava river centre line. */
  riverDist(x: number, z: number): number {
    return this.riverField.distAt(x, z);
  }

  /** Lava surface height of the nearest river at (x, z). */
  lavaHeight(x: number, z: number): number {
    const c = this.riverField.cell(x, z);
    if (c < 0 || this.riverField.id[c] < 0) return -9;
    const i = this.riverField.id[c];
    const r = this.rivers[i];
    const k = clamp(Math.round((this.riverField.s[c] / r.length) * (r.pts.length - 1)), 0, r.pts.length - 1);
    return this.riverY[i][k];
  }

  riverProfile(i: number): number[] {
    return this.riverY[i];
  }

  // ── Heights and walkability ────────────────────────────────

  /** Untouched landscape: coast, rolling ash fields and the volcano cone. */
  natural(x: number, z: number): number {
    let land = 2.5 + noise.fbm(x * 0.028, z * 0.028, 3) * 1.4 + Math.max(0, -x - 4) * 0.07;
    const coast = 35 + 4 * Math.sin(z * 0.05) + 3 * Math.sin(z * 0.11 + 2);
    land = lerp(land, -3.5, smoothstep(coast - 7, coast + 7, x));
    return land + volcanoCone(x, z);
  }

  /** Terrain height including the flattened trail and the carved lava channels. */
  terrain(x: number, z: number): number {
    let h = this.natural(x, z);
    const d = this.trailField.distAt(x, z);
    if (d < 16) {
      const s = this.trailS(x, z);
      const w = this.halfWidth(s);
      // Rocky shoulders rise along the trail edges and frame the walkable strip
      const shoulder = smoothstep(w + 1.5, w + 6, d) * (1 - smoothstep(w + 8, w + 15, d));
      h += shoulder * (0.6 + Math.max(0, noise.noise(x * 0.18, z * 0.18)) * 1.8);
      const flat = 1 - smoothstep(w + 0.5, w + 5, d);
      h = lerp(h, this.trailHeight(s) + noise.noise(x * 0.4, z * 0.4) * 0.06, flat);
    }
    const rd = this.riverField.distAt(x, z);
    if (rd < 9) {
      const bed = this.lavaHeight(x, z) - 0.35;
      const k = 1 - smoothstep(RIVER_HALF - 0.2, RIVER_HALF + 2.6, rd);
      h = lerp(h, Math.min(h, bed), k);
    }
    return h;
  }

  /** The bridge whose deck covers (x, z), if any. */
  bridgeAt(x: number, z: number): Bridge | null {
    for (const b of this.bridges) {
      const dx = x - b.center.x;
      const dz = z - b.center.y;
      const along = dx * b.dir.x + dz * b.dir.y;
      const across = -dx * b.dir.y + dz * b.dir.x;
      if (Math.abs(along) > b.halfLen || Math.abs(across) > b.halfW) continue;
      if (b.gap && along > b.gap[0] && along < b.gap[1]) continue;
      return b;
    }
    return null;
  }

  /** The hop rock whose top covers (x, z), if any. */
  rockAt(x: number, z: number): HopRock | null {
    for (const r of this.rocks) if (Math.hypot(x - r.x, z - r.z) <= r.r) return r;
    return null;
  }

  /** Walk surface height (hop rock, bridge deck or terrain; the lava's surface where he came down in it). */
  ground(x: number, z: number): number {
    const rock = this.rockAt(x, z);
    if (rock) return rock.y;
    const b = this.bridgeAt(x, z);
    if (b) {
      const u = ((x - b.center.x) * b.dir.x + (z - b.center.y) * b.dir.y) / b.halfLen;
      return deckHeight(b, u);
    }
    const h = this.terrain(x, z);
    return this.lavaAt(x, z) ? Math.max(h, this.lavaHeight(x, z)) : h;
  }

  /** Inside the trail, out of the lava (bridges and hop rocks excepted). */
  canStand(x: number, z: number): boolean {
    if (this.rockAt(x, z)) return true;
    const d = this.trailField.distAt(x, z);
    if (d > this.halfWidth(this.trailS(x, z))) return false;
    if (this.bridgeAt(x, z)) return true;
    return this.riverField.distAt(x, z) > BANK_DIST;
  }

  /** True inside the corridor of a broken crossing, where an airborne Tadeo may fly over lava. */
  canLeap(x: number, z: number): boolean {
    for (const b of this.bridges) {
      if (!b.gap) continue;
      const dx = x - b.center.x;
      const dz = z - b.center.y;
      if (Math.abs(dx * b.dir.x + dz * b.dir.y) > b.halfLen || Math.abs(-dx * b.dir.y + dz * b.dir.x) > LEAP_HALF_W) continue;
      // Reason: staying on the trail means everything in the corridor is ground to stand on or lava, never a dead end
      return this.trailField.distAt(x, z) <= this.halfWidth(this.trailS(x, z));
    }
    return false;
  }

  /** True on lava inside a broken crossing, off the rocks and bridge stubs. */
  lavaAt(x: number, z: number): boolean {
    return this.canLeap(x, z) && !this.canStand(x, z);
  }

  /** 0 at the start, 1 at the goal. */
  progress(s: number): number {
    return clamp(s / this.goalS, 0, 1);
  }
}

/** Deck height along a bridge, u in [-1, 1] from one end to the other (gently arched). */
export function deckHeight(b: Bridge, u: number): number {
  return b.y + 0.25 + 0.55 * (1 - u * u);
}

/** Volcano cone with a crater and a few gullies running down its flanks. */
export function volcanoCone(x: number, z: number): number {
  const dx = x - VOLCANO.x;
  const dz = z - VOLCANO.z;
  const r = Math.hypot(dx, dz);
  if (r > VOLCANO.base + 2) return 0;
  if (r < VOLCANO.crater) {
    // Bowl: rim lip falling to a flat lava floor
    const k = smoothstep(4, VOLCANO.crater, r);
    return lerp(VOLCANO.rim - 9, VOLCANO.rim + 1.2, k * k);
  }
  const u = clamp((r - VOLCANO.crater) / (VOLCANO.base - VOLCANO.crater), 0, 1);
  const a = Math.atan2(dz, dx);
  const gully = 1 - Math.abs(noise.noise(Math.cos(a) * 3.2 + 40, Math.sin(a) * 3.2 + r * 0.03));
  const rim = 1.2 * Math.exp(-(((r - VOLCANO.crater) / 2.5) ** 2));
  return VOLCANO.rim * Math.pow(1 - u, 1.75) * (0.94 + gully * 0.1) + rim;
}

/** Moving-average smoothing over a window of `half` samples each side. */
function smoothProfile(v: number[], half: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < v.length; i++) {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(v.length - 1, i + half); k++) {
      sum += v[k];
      n++;
    }
    out.push(sum / n);
  }
  return out;
}
