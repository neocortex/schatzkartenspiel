/**
 * Instanced scatter for the volcano course: basalt boulders lining the trail
 * and dotting the ash fields, pebbles, charred dead trees, plus the trees,
 * bushes and flowers of the green goal meadow. One draw call per variant.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { part } from "../../core/geo";
import { rockBlob, stoneFn } from "../../world/models/shapes";
import { deadTree, roundTree, bush } from "../../world/models/flora";
import { Colliders } from "../../world/Colliders";
import { Course, RIVER_HALF } from "./course";

interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number | [number, number, number];
  color?: THREE.Color;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

function instanced(geo: THREE.BufferGeometry, material: THREE.Material, list: Placement[], shadows = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(list.length, 1));
  const m = new THREE.Matrix4();
  list.forEach((p, i) => {
    tmpQ.setFromEuler(tmpE.set(0, p.rot, 0));
    const s = typeof p.scale === "number" ? new THREE.Vector3(p.scale, p.scale, p.scale) : new THREE.Vector3(...p.scale);
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, p.z), tmpQ, s));
    if (p.color) mesh.setColorAt(i, p.color);
  });
  mesh.count = list.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export class Scatter {
  readonly group = new THREE.Group();
  private rand = mulberry32(2024);

  constructor(private course: Course, private solid: THREE.Material, private colliders: Colliders) {
    this.rocks();
    this.pebbles();
    this.trees();
    this.meadow();
  }

  /** Off the walkable strip and away from lava and bridges. */
  private free(x: number, z: number, margin: number): boolean {
    const c = this.course;
    const d = c.trailDist(x, z);
    if (d < c.halfWidth(c.trailS(x, z)) + margin) return false;
    if (c.riverDist(x, z) < RIVER_HALF + 1.6) return false;
    return c.natural(x, z) > 0.6;
  }

  private rocks(): void {
    const c = this.course;
    const r = this.rand;
    const variants = [0, 1, 2, 3].map((k) => {
      const g = rockBlob(31 + k * 7, [1, 0.62 + k * 0.08, 0.9], stoneFn(["#4d4249", "#5a4d55", "#463b42", "#625159"][k], 0, r), 1);
      g.translate(0, 0.25, 0);
      return g;
    });
    const lists: Placement[][] = variants.map(() => []);
    const add = (x: number, z: number, s: number, flat = 1) => {
      lists[Math.floor(r() * 4)].push({ x, y: c.terrain(x, z) - s * 0.15, z, rot: r() * 6.28, scale: [s * (0.8 + r() * 0.5), s * flat, s * (0.8 + r() * 0.5)] });
    };
    // Boulders lining both trail edges: small near the path, bigger further out
    const L = c.trail.length;
    for (let s = 0; s < L; s += 1.4) {
      const p = c.pointAt(s);
      const t = c.tangentAt(s);
      for (const side of [-1, 1]) {
        if (r() < 0.25) continue;
        const off = c.halfWidth(s) + 0.7 + r() * r() * 7;
        const x = p.x - t.y * side * off;
        const z = p.y + t.x * side * off;
        if (!this.free(x, z, 0.5) || c.bridgeAt(x, z)) continue;
        add(x, z, 0.35 + (off - c.halfWidth(s)) * 0.16 + r() * 0.5);
      }
    }
    // Ash-field boulders
    for (let i = 0; i < 420; i++) {
      const x = -95 + r() * 130;
      const z = -110 + r() * 180;
      if (!this.free(x, z, 3)) continue;
      add(x, z, 0.6 + r() * r() * 2.6, 0.8);
    }
    // A few boulders on the trail itself to weave around (never near bridges or checkpoints)
    for (const s of [16, 27, 44, 58, 71, 86, 97]) {
      if (s > c.goalS - 8) continue;
      if (c.bridges.some((b) => Math.abs(c.trailS(b.center.x, b.center.y) - s) < 10)) continue;
      if (c.checkpoints.some((cp) => Math.abs(cp.s - s) < 6)) continue;
      const p = c.pointAt(s);
      const t = c.tangentAt(s);
      const side = r() < 0.5 ? -1 : 1;
      const off = c.halfWidth(s) * (0.35 + r() * 0.25) * side;
      const x = p.x - t.y * off;
      const z = p.y + t.x * off;
      const size = 0.8 + r() * 0.35;
      add(x, z, size, 0.9);
      this.colliders.add(x, z, size * 0.95);
    }
    variants.forEach((g, k) => this.group.add(instanced(g, this.solid, lists[k])));
  }

  private pebbles(): void {
    const c = this.course;
    const r = this.rand;
    const geo = part(new THREE.IcosahedronGeometry(0.11, 0), "#ffffff");
    const list: Placement[] = [];
    const tints = ["#5b4e55", "#7d6f75", "#3e3439", "#9b8c86", "#b49a7c"].map((h) => new THREE.Color(h));
    for (let i = 0; list.length < 1600 && i < 9000; i++) {
      const s = r() * c.trail.length;
      const p = c.pointAt(s);
      const t = c.tangentAt(s);
      const off = (r() * 2 - 1) * (c.halfWidth(s) + 4);
      const x = p.x - t.y * off + (r() - 0.5) * 2;
      const z = p.y + t.x * off + (r() - 0.5) * 2;
      if (c.riverDist(x, z) < RIVER_HALF + 0.6 || c.bridgeAt(x, z)) continue;
      const sc = 0.5 + r() * r() * 1.8;
      list.push({ x, y: c.terrain(x, z) + 0.02, z, rot: r() * 6.28, scale: [sc, sc * 0.6, sc], color: tints[Math.floor(r() * tints.length)] });
    }
    this.group.add(instanced(geo, this.solid, list, false));
  }

  private trees(): void {
    const c = this.course;
    const r = this.rand;
    const variants = [deadTree(3), deadTree(8), deadTree(15)];
    const lists: Placement[][] = variants.map(() => []);
    for (let i = 0; i < 400 && lists.flat().length < 30; i++) {
      const x = -60 + r() * 92;
      const z = -70 + r() * 135;
      if (!this.free(x, z, 2.5) || c.trailDist(x, z) > 26) continue;
      if (c.trailS(x, z) > c.goalS - 6) continue;
      lists[i % 3].push({ x, y: c.terrain(x, z) - 0.1, z, rot: r() * 6.28, scale: 0.9 + r() * 0.7 });
    }
    variants.forEach((v, k) => this.group.add(instanced(v.geometry, this.solid, lists[k])));
  }

  private meadow(): void {
    const c = this.course;
    const r = this.rand;
    const trees = [roundTree(1), roundTree(2), roundTree(4)];
    const treeLists: Placement[][] = trees.map(() => []);
    const bushes = [bush(5, "#ff4d6d"), bush(9, null)];
    const bushLists: Placement[][] = bushes.map(() => []);
    const isMeadow = (x: number, z: number) => c.trailS(x, z) > c.goalS - 2 || z < -80;
    for (let i = 0; i < 900; i++) {
      const x = -30 + r() * 70;
      const z = -125 + r() * 70;
      if (!isMeadow(x, z) || c.natural(x, z) < 1 || c.riverDist(x, z) < RIVER_HALF + 3) continue;
      const d = c.trailDist(x, z);
      const w = c.halfWidth(c.trailS(x, z));
      if (d < w + 1.2) continue;
      const k = Math.floor(r() * 3);
      if (r() < 0.6 && treeLists.flat().length < 55) treeLists[k].push({ x, y: c.terrain(x, z) - 0.1, z, rot: r() * 6.28, scale: 0.9 + r() * 0.6 });
      else if (bushLists.flat().length < 30) bushLists[k % 2].push({ x, y: c.terrain(x, z), z, rot: r() * 6.28, scale: 0.9 + r() * 0.5 });
    }
    trees.forEach((t, k) => this.group.add(instanced(t.geometry, this.solid, treeLists[k])));
    bushes.forEach((b, k) => this.group.add(instanced(b.geometry, this.solid, bushLists[k])));

    // Flowers: green stem + white blossom tinted per instance
    // Reason: stems are a separate untinted mesh — a tint would turn them black-ish
    const stem = part(new THREE.CylinderGeometry(0.02, 0.025, 0.32, 4), "#4f8a2e", { pos: [0, 0.16, 0] });
    const head = part(new THREE.IcosahedronGeometry(0.09, 0), "#ffffff", { pos: [0, 0.34, 0], scale: [1, 0.55, 1] });
    const colors = ["#ff5d8f", "#ffd23f", "#ffffff", "#b06cff", "#ff8a3d"].map((h) => new THREE.Color(h));
    const list: Placement[] = [];
    for (let i = 0; i < 4000 && list.length < 420; i++) {
      const s = c.goalS - 3 + r() * (c.trail.length - c.goalS + 3);
      const p = c.pointAt(s);
      const a = r() * 6.28;
      const rr = Math.sqrt(r()) * 13;
      const x = p.x + Math.cos(a) * rr;
      const z = p.y + Math.sin(a) * rr;
      if (!isMeadow(x, z) || c.natural(x, z) < 0.9) continue;
      // Keep the walking strip in the middle mostly clear
      if (c.trailDist(x, z) < 1.4 && r() < 0.8) continue;
      list.push({ x, y: c.terrain(x, z), z, rot: r() * 6.28, scale: 0.8 + r() * 0.7, color: colors[Math.floor(r() * colors.length)] });
    }
    this.group.add(instanced(head, this.solid, list, false));
    this.group.add(instanced(stem, this.solid, list.map((p) => ({ ...p, color: undefined })), false));
  }
}
