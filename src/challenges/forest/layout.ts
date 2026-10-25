/**
 * Forest layout: the enchanted glade as a handful of clearings joined by
 * winding paths, the brook with its bridge and stepping stones, the mossy
 * hill, and where the five magic berries, the thorn bushes and the fox are.
 * `ForestField` answers "can Tadeo stand here?" and "how high is the ground?"
 * from the same shapes the terrain mesh is built from, so what you see is
 * what you walk on.
 */

import { Noise2D, smoothstep } from "../../core/noise";

export interface Spot {
  x: number;
  z: number;
  r: number;
}

/** Terrain bounds (the walkable glade sits well inside, surrounded by forest). */
export const MIN_X = -34;
export const MAX_X = 34;
export const MIN_Z = -32;
export const MAX_Z = 30;

export const START: [number, number] = [0, 14.5];
export const FOX_START: [number, number] = [2.2, 11.4];

/** The five magic berries, each in its own little place. */
export const BERRIES = [
  { name: "brook", x: -15.4, z: 2.0 },
  { name: "fairy", x: -6.5, z: -13 },
  { name: "hedge", x: 9.5, z: -14.5 },
  { name: "tree", x: 17.4, z: -2.2 },
  { name: "hill", x: 1.5, z: -1 },
] as const;

export const HILL = { x: 1.5, z: -1, h: 1.25, r: 4.6 };
export const OLD_TREE = { x: 20.2, z: -4.6, r: 1.3 };
export const FAIRY_RING = { x: -6.5, z: -13, r: 2.3 };
export const WATER_LEVEL = -0.16;

const CLEARINGS: Spot[] = [
  { x: 0, z: 13.2, r: 5 },
  { x: 1, z: -0.5, r: 7.5 },
  { x: -13, z: 2, r: 6.5 },
  { x: -7.5, z: -13, r: 6 },
  { x: 9.5, z: -14.5, r: 6.3 },
  { x: 15.8, z: -1, r: 5.2 },
];

/** Paths between the clearings: [x1, z1, x2, z2, half width]. */
export const PATHS: [number, number, number, number, number][] = [
  [0, 10, 0.8, 4, 2.2],
  [-4, 0, -12, 1.8, 1.9],
  [-3, -4.5, -7.5, -11, 1.9],
  [4.5, -5, 7.5, -10.5, 1.9],
  [6.5, -0.5, 14, -1, 1.9],
  [-8, -3, -8.3, -9, 1.6],
  [13, -10, 15.5, -4, 1.6],
];

/** Centre line of the brook (it flows north to south along the west side). */
export const brookX = (z: number): number => -10.5 + 1.6 * Math.sin(z * 0.28 + 0.5);

export const BRIDGE = { x: brookX(1.6), z: 1.6, halfLength: 2.4, halfWidth: 0.95 };

/** Stepping stones across the brook, south of the bridge (you can walk on them). */
export const STONES: Spot[] = [-1.25, 0, 1.2].map((dx, i) => ({ x: brookX(6) + dx, z: 6 + (i === 1 ? 0.35 : 0), r: 0.45 }));

function ring(cx: number, cz: number, radius: number, r: number, degrees: number[]): Spot[] {
  return degrees.map((d) => ({ x: cx + Math.cos((d * Math.PI) / 180) * radius, z: cz + Math.sin((d * Math.PI) / 180) * radius, r }));
}

/** Thorn bushes. Angles are measured from east (+x) towards the camera (+z). */
export const THORNS: Spot[] = [
  // Two on the first path, to learn what thorns do
  { x: -1.7, z: 8.4, r: 0.7 },
  { x: 2.4, z: 6.4, r: 0.65 },
  // A loose ring around the hill, open towards the east
  ...ring(HILL.x, HILL.z, 3.25, 0.72, [40, 85, 130, 175, 220, 265, 310]),
  // A tight hedge around the north-east berry, open only at the back
  ...ring(9.5, -14.5, 2.5, 0.8, [-30, 0, 30, 60, 90, 120, 150, 180, 210]),
  // Slalom on the way to the old tree
  { x: 9.3, z: 0.9, r: 0.7 },
  { x: 11.4, z: -1.6, r: 0.7 },
  { x: 13.4, z: 0.4, r: 0.65 },
  // Near the fairy ring
  { x: -4.2, z: -9.4, r: 0.7 },
  { x: -9.9, z: -8.6, r: 0.7 },
  { x: -3.9, z: -15.6, r: 0.65 },
  // Brook meadow
  { x: -14.6, z: 5.6, r: 0.7 },
  { x: -17.2, z: -0.6, r: 0.7 },
  { x: -12.9, z: -1.6, r: 0.6 },
];

/** Distance from (x, z) to the segment a–b. */
export function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/** Polynomial smooth maximum: like Math.max, but blends the two within `k` of each other. */
function smoothMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

export class ForestField {
  private noise = new Noise2D(1505);

  /** Positive inside the glade (clearings and paths), negative in the forest. */
  openAt(x: number, z: number): number {
    let o = -99;
    // Reason: a soft union rounds the corners where paths meet clearings and fills thin slivers of
    // "forest" between neighbouring shapes, which would otherwise be invisible walls in the grass
    for (const c of CLEARINGS) o = smoothMax(o, c.r - Math.hypot(x - c.x, z - c.z), 3);
    for (const [ax, az, bx, bz, w] of PATHS) o = smoothMax(o, w - segmentDistance(x, z, ax, az, bx, bz), 3);
    // Reason: wobble the edges so the clearings don't read as perfect circles
    return o + this.noise.noise(x * 0.18, z * 0.18) * 0.6;
  }

  /** 1 in the middle of the brook, fading to 0 on its banks. */
  brookAt(x: number, z: number): number {
    return smoothstep(1.65, 0.55, Math.abs(x - brookX(z)));
  }

  /** How strongly (0..1) a point lies on a worn dirt path. */
  trailAt(x: number, z: number): number {
    let d = 99;
    for (const [ax, az, bx, bz] of PATHS) d = Math.min(d, segmentDistance(x, z, ax, az, bx, bz));
    d += this.noise.noise(x * 0.5 + 7, z * 0.5) * 0.35;
    return smoothstep(1.05, 0.45, d);
  }

  /** Terrain height (the mesh); the forest floor rises a little around the glade. */
  terrainAt(x: number, z: number): number {
    // Reason: keep dry land above 0 — the player counts as wading below -0.08
    let h = 0.22 + this.noise.fbm(x * 0.06, z * 0.06, 3) * 0.2;
    h += HILL.h * smoothstep(HILL.r, 0.6, Math.hypot(x - HILL.x, z - HILL.z));
    h += smoothstep(0.3, -3.5, this.openAt(x, z)) * 1.4;
    h += 0.35 * smoothstep(3.2, 1.4, Math.hypot(x - OLD_TREE.x, z - OLD_TREE.z));
    const b = this.brookAt(x, z);
    return h + (-0.48 - h) * b;
  }

  /** Walking height: terrain, the arched bridge deck or a stepping stone. */
  groundAt(x: number, z: number): number {
    let h = this.terrainAt(x, z);
    const deck = this.bridgeDeck(x, z);
    if (deck !== null) h = Math.max(h, deck);
    for (const s of STONES) if (Math.hypot(x - s.x, z - s.z) < s.r) h = Math.max(h, 0.06);
    return h;
  }

  bridgeDeck(x: number, z: number): number | null {
    const u = (x - BRIDGE.x) / BRIDGE.halfLength;
    if (Math.abs(u) > 1 || Math.abs(z - BRIDGE.z) > BRIDGE.halfWidth) return null;
    return 0.16 + 0.34 * Math.cos((u * Math.PI) / 2);
  }

  walkable(x: number, z: number): boolean {
    return this.openAt(x, z) > 0.35 || this.bridgeDeck(x, z) !== null;
  }
}
