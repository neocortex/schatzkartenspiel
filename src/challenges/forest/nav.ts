/**
 * Walkability grid of the glade (half-unit cells) with breadth-first path
 * finding. The fox uses it to lead Tadeo around thorn bushes and trees to
 * the next berry; cells next to thorns are blocked with some extra margin so
 * the fox never takes a path that would make Tadeo bump into one.
 */

import * as THREE from "three";
import { Colliders } from "../../world/Colliders";
import { ForestField, MAX_X, MAX_Z, MIN_X, MIN_Z, Spot } from "./layout";

const RES = 0.5;

export class NavGrid {
  readonly nx = Math.round((MAX_X - MIN_X) / RES);
  readonly nz = Math.round((MAX_Z - MIN_Z) / RES);
  readonly free: Uint8Array;

  constructor(field: ForestField, colliders: Colliders, thorns: Spot[]) {
    this.free = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.center(i, j);
        const ok =
          field.walkable(x, z) &&
          !colliders.hits(x, z, 0.45) &&
          !thorns.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 0.55);
        this.free[j * this.nx + i] = ok ? 1 : 0;
      }
    }
  }

  center(i: number, j: number): [number, number] {
    return [MIN_X + (i + 0.5) * RES, MIN_Z + (j + 0.5) * RES];
  }

  cell(x: number, z: number): [number, number] {
    return [Math.floor((x - MIN_X) / RES), Math.floor((z - MIN_Z) / RES)];
  }

  isFree(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.free[j * this.nx + i] === 1;
  }

  /** Nearest free cell to (i, j), searching outwards ring by ring. */
  private nearestFree(i: number, j: number): [number, number] | null {
    for (let r = 0; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) === r && this.isFree(i + di, j + dj)) return [i + di, j + dj];
        }
      }
    }
    return null;
  }

  /** Path of world points from `from` to `to` (empty if unreachable). */
  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const s = this.nearestFree(...this.cell(from.x, from.z));
    const g = this.nearestFree(...this.cell(to.x, to.z));
    if (!s || !g) return [];
    const start = s[1] * this.nx + s[0];
    const goal = g[1] * this.nx + g[0];
    const prev = new Int32Array(this.nx * this.nz).fill(-1);
    prev[start] = start;
    const queue = [start];
    for (let q = 0; q < queue.length && prev[goal] < 0; q++) {
      const c = queue[q];
      const ci = c % this.nx;
      const cj = Math.floor(c / this.nx);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          // Reason: diagonal steps only when both side cells are free, so paths never cut corners
          if (!this.isFree(ni, nj) || (di && dj && (!this.isFree(ci + di, cj) || !this.isFree(ci, cj + dj)))) continue;
          const n = nj * this.nx + ni;
          if (prev[n] >= 0) continue;
          prev[n] = c;
          queue.push(n);
        }
      }
    }
    if (prev[goal] < 0) return [];
    const cells: number[] = [];
    for (let c = goal; c !== start; c = prev[c]) cells.push(c);
    cells.reverse();
    return cells.map((c) => {
      const [x, z] = this.center(c % this.nx, Math.floor(c / this.nx));
      return new THREE.Vector3(x, 0, z);
    });
  }

  /** Rows of '1' (free) / '0' (blocked) for the E2E test's own path finding. */
  rows(): string[] {
    const out: string[] = [];
    for (let j = 0; j < this.nz; j++) out.push(Array.from(this.free.subarray(j * this.nx, (j + 1) * this.nx)).join(""));
    return out;
  }
}
