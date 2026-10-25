/**
 * Simple circle colliders in the XZ plane, stored in a spatial hash.
 * Characters are pushed out of any circle they overlap.
 */

import * as THREE from "three";

export interface Circle {
  x: number;
  z: number;
  r: number;
}

const CELL = 4;

export class Colliders {
  private cells = new Map<string, Circle[]>();

  /** Add a circle; the returned handle can `remove` it again. */
  add(x: number, z: number, r: number): Circle {
    const c = { x, z, r };
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = `${cx},${cz}`;
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(c);
      }
    }
    return c;
  }

  remove(c: Circle): void {
    for (const [key, list] of this.cells) {
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.cells.delete(key);
    }
  }

  /** Whether a circle of `radius` at (x, z) overlaps any collider. */
  hits(x: number, z: number, radius: number): boolean {
    const list = this.cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!list) return false;
    return list.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + radius) ** 2);
  }

  /** Push `pos` out of all overlapping colliders (sliding along them). */
  resolve(pos: THREE.Vector3, radius: number): void {
    const list = this.cells.get(`${Math.floor(pos.x / CELL)},${Math.floor(pos.z / CELL)}`);
    if (!list) return;
    for (const c of list) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }
}
