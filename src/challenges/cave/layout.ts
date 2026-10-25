/**
 * Cave layout: the hand-drawn tile map of the crystal cave, the positions of
 * levers, gates and the altar, and a signed-distance field baked from the map
 * that gives the rock walls their organic shape. The same field answers the
 * player's "can I stand here?" and "how high is the floor?" questions, so the
 * walls you see are exactly the walls you bump into.
 */

import * as THREE from "three";
import { Noise2D } from "../../core/noise";

/** Size of one map cell in world units (corridors are one cell wide). */
export const CELL = 3;

// Reason: '#' rock, '.' floor, 'w' underground pool, 'E' the daylight exit behind the start (visible, not walkable)
const MAP = [
  "#################", // 0
  "######.....######", // 1  hidden chamber
  "######.....######", // 2  altar
  "######.....######", // 3
  "########.########", // 4  secret wall (gate 3)
  "###...........###", // 5  rune hall
  "###...........###", // 6  three coloured levers
  "###...........###", // 7
  "########.########", // 8  gate 2
  "#...###...###...#", // 9  alcoves with the gate-2 levers
  "#...#.......#...#", // 10
  "#...#..www..#...#", // 11 pool grotto
  "#......www......#", // 12
  "####...ww...#####", // 13
  "#####.......#####", // 14
  "########.########", // 15 gate 1
  "#######...#######", // 16 entrance tunnel
  "######.....######", // 17 first lever + mine cart
  "#######...#######", // 18
  "########.########", // 19 start
  "########E########", // 20 cave mouth
];

export const COLS = MAP[0].length;
export const ROWS = MAP.length;

/** World position (x, z) of a cell centre; fractional cells are allowed. */
export function cellPos(c: number, r: number): [number, number] {
  return [(c - (COLS - 1) / 2) * CELL, (r - (ROWS - 1) / 2) * CELL];
}

export function tileAt(c: number, r: number): string {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return "#";
  return MAP[r][c];
}

/** The raw map rows (exposed for the E2E path finder). */
export const TILE_ROWS = MAP;

export type GateId = 0 | 1 | 2;

export interface LeverSpec {
  cell: [number, number];
  gate: GateId;
  color: string;
  /** Rune trail from the lever to its gate, in (fractional) cell coordinates. */
  trail: [number, number][];
}

export const GATE_CELLS: [number, number][] = [
  [8, 15],
  [8, 8],
  [8, 4],
];

export const COLORS = {
  gold: "#ffc94a",
  teal: "#3ff2d8",
  violet: "#b77bff",
  blue: "#4fb6ff",
  pink: "#ff6fc4",
  green: "#6cf27c",
};

export const LEVERS: LeverSpec[] = [
  { cell: [6.15, 17], gate: 0, color: COLORS.gold, trail: [[6.45, 17.05], [7.2, 16.7], [7.85, 16], [7.9, 15.25]] },
  {
    cell: [2, 9.2],
    gate: 1,
    color: COLORS.teal,
    trail: [[2, 9.5], [2.1, 11.4], [3.2, 12.1], [4.6, 12.0], [5.35, 11.0], [5.7, 10.2], [7.0, 9.7], [7.75, 9.1], [7.85, 8.3]],
  },
  {
    cell: [14, 9.2],
    gate: 1,
    color: COLORS.violet,
    trail: [[14, 9.5], [13.9, 11.4], [12.8, 12.1], [11.4, 12.0], [10.65, 11.0], [10.3, 10.2], [9.0, 9.7], [8.25, 9.1], [8.15, 8.3]],
  },
  { cell: [5, 6.2], gate: 2, color: COLORS.blue, trail: [[5.25, 6.0], [6.2, 5.3], [7.6, 4.4]] },
  { cell: [8, 6.4], gate: 2, color: COLORS.pink, trail: [[8, 6.1], [8, 4.4]] },
  { cell: [11, 6.2], gate: 2, color: COLORS.green, trail: [[10.75, 6.0], [9.8, 5.3], [8.4, 4.4]] },
];

export const START_CELL: [number, number] = [8, 19];
export const ALTAR_CELL: [number, number] = [8, 1.75];

/** Rooms the story reacts to when Tadeo first walks in (cell rectangles, inclusive). */
export const ROOMS = {
  grotto: { c0: 4, c1: 12, r0: 10, r1: 14 },
  runeHall: { c0: 3, c1: 13, r0: 5, r1: 7 },
  chamber: { c0: 6, c1: 10, r0: 1, r1: 3 },
};

export function inRoom(x: number, z: number, room: { c0: number; c1: number; r0: number; r1: number }): boolean {
  const c = x / CELL + (COLS - 1) / 2;
  const r = z / CELL + (ROWS - 1) / 2;
  return c > room.c0 - 0.5 && c < room.c1 + 0.5 && r > room.r0 - 0.5 && r < room.r1 + 0.5;
}

// ── Signed distance field ─────────────────────────────────────

/** Fine sampling step of the baked fields (also the terrain mesh resolution). */
export const RES = 0.25;
export const MIN_X = -(COLS / 2) * CELL;
export const MIN_Z = -(ROWS / 2) * CELL;
export const NX = Math.round((COLS * CELL) / RES) + 1;
export const NZ = Math.round((ROWS * CELL) / RES) + 1;

const WALL_H = 2.5;

/** Distance from p to an axis-aligned cell box (negative inside). */
function boxDist(px: number, pz: number, cx: number, cz: number, half: number): number {
  const qx = Math.abs(px - cx) - half;
  const qz = Math.abs(pz - cz) - half;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

/** Exact distance to the boundary between cells matching `inside` and the rest (positive inside). */
function regionDist(x: number, z: number, inside: (t: string) => boolean): number {
  const c0 = Math.round(x / CELL + (COLS - 1) / 2);
  const r0 = Math.round(z / CELL + (ROWS - 1) / 2);
  const here = inside(tileAt(c0, r0));
  let best = Infinity;
  for (let dr = -3; dr <= 3; dr++) {
    for (let dc = -3; dc <= 3; dc++) {
      const t = tileAt(c0 + dc, r0 + dr);
      if (inside(t) === here) continue;
      const [cx, cz] = cellPos(c0 + dc, r0 + dr);
      best = Math.min(best, boxDist(x, z, cx, cz, CELL / 2));
    }
  }
  if (best === Infinity) best = CELL * 3;
  return here ? best : -best;
}

const isOpen = (t: string) => t !== "#";
const isWater = (t: string) => t === "w";

/**
 * Baked fields on the fine grid: `open` (distance into open cave space, rock
 * is negative), `water` (distance into the pool) and the final `height`.
 */
export class CaveField {
  readonly open = new Float32Array(NX * NZ);
  readonly water = new Float32Array(NX * NZ);
  readonly height = new Float32Array(NX * NZ);
  private noise = new Noise2D(404);

  constructor() {
    const n = this.noise;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const x = MIN_X + i * RES;
        const z = MIN_Z + j * RES;
        const k = j * NX + i;
        // Reason: two octaves of noise bend the straight cell edges into lumpy rock
        const wobble = n.noise(x * 0.33, z * 0.33) * 0.42 + n.noise(x * 1.1 + 7, z * 1.1) * 0.14;
        const open = regionDist(x, z, isOpen) + wobble;
        const water = regionDist(x, z, isWater) + n.noise(x * 0.42 + 3, z * 0.42) * 0.8 + n.noise(x * 1.3, z * 1.3 + 8) * 0.2 - 0.1;
        this.open[k] = open;
        this.water[k] = water;
        this.height[k] = this.heightFrom(x, z, open, water);
      }
    }
  }

  private heightFrom(x: number, z: number, open: number, water: number): number {
    const n = this.noise;
    if (open >= 0) {
      const bumps = n.noise(x * 0.7, z * 0.7) * 0.05;
      const basin = -0.95 * THREE.MathUtils.smoothstep(water, -0.35, 1.3);
      return bumps + basin;
    }
    // Reason: an S-curve gives a rounded foot, a steep face and a rounded lip on top
    const t = THREE.MathUtils.clamp(-open / 1.5, 0, 1);
    const s = t * t * (3 - 2 * t);
    const top = WALL_H + n.noise(x * 0.21 + 11, z * 0.21) * 0.5 + n.noise(x * 0.8, z * 0.8 + 5) * 0.18;
    const crest = THREE.MathUtils.smoothstep(-open, 1.6, 4.5) * 0.5;
    return s * top + crest;
  }

  /** Bilinear sample of one of the baked fields. */
  sample(field: Float32Array, x: number, z: number): number {
    const fx = THREE.MathUtils.clamp((x - MIN_X) / RES, 0, NX - 1.001);
    const fz = THREE.MathUtils.clamp((z - MIN_Z) / RES, 0, NZ - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const k = j * NX + i;
    const a = field[k] + (field[k + 1] - field[k]) * tx;
    const b = field[k + NX] + (field[k + NX + 1] - field[k + NX]) * tx;
    return a + (b - a) * tz;
  }

  openAt(x: number, z: number): number {
    return this.sample(this.open, x, z);
  }

  waterAt(x: number, z: number): number {
    return this.sample(this.water, x, z);
  }

  heightAt(x: number, z: number): number {
    return this.sample(this.height, x, z);
  }
}
