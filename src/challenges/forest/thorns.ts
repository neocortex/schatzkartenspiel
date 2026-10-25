/**
 * Thorn bushes: dark plum mounds bristling with pale pink spikes, so they
 * clearly read as "don't touch". Touching one doesn't hurt for real —
 * the challenge bounces Tadeo back with an "Autsch!" and the bush shivers.
 * The trigger is a little smaller than the bush so near misses never count.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { displace, facet, gradient, merge, part } from "../../core/geo";
import { Colliders } from "../../world/Colliders";
import { ForestField, Spot, THORNS } from "./layout";

/** One thorn bush of unit radius: a plum-coloured leafy mound bristling with pink-tipped spikes. */
function brambleGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const mound = gradient("#2c1230", "#8a3a74", 0, 0.8, 0.12);
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + rand();
    const r = b === 0 ? 0.46 : 0.3 + rand() * 0.1;
    const off = b === 0 ? 0 : 0.36;
    const g = new THREE.IcosahedronGeometry(r, 1);
    displace(g, r * 0.14, 2.2, seed + b);
    facet(g);
    parts.push(part(g, mound, { pos: [Math.cos(a) * off, b === 0 ? 0.36 : 0.26 + rand() * 0.1, Math.sin(a) * off] }));
  }
  // Reason: spikes stick straight out of the mound on all sides, so the silhouette says "ouch" from any angle
  const centre = new THREE.Vector3(0, 0.3, 0);
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 34; k++) {
    const dir = new THREE.Vector3(rand() - 0.5, rand() * 0.9 - 0.05, rand() - 0.5).normalize();
    const base = centre.clone().add(new THREE.Vector3(dir.x * 0.62, dir.y * 0.5, dir.z * 0.62));
    const len = 0.2 + rand() * 0.12;
    const spike = new THREE.ConeGeometry(0.045, len, 5);
    spike.translate(0, len / 2, 0);
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    spike.translate(base.x, base.y, base.z);
    parts.push(part(spike, (q) => new THREE.Color("#ffe3ee").lerp(new THREE.Color("#ff3d82"), THREE.MathUtils.clamp((q.distanceTo(base) / len) * 1.4 - 0.3, 0, 1))));
  }
  return merge(parts);
}

export class Thorns {
  readonly group = new THREE.Group();
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  readonly spots: Spot[] = THORNS;
  private meshes: THREE.InstancedMesh[] = [];
  private slot: { mesh: number; index: number; pos: THREE.Vector3; rot: THREE.Quaternion; scale: THREE.Vector3; shake: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();

  constructor(field: ForestField, colliders: Colliders) {
    const variants = [3, 7, 11].map((s) => brambleGeometry(s));
    const rand = mulberry32(5);
    const lists: THREE.Matrix4[][] = variants.map(() => []);
    for (const t of this.spots) {
      const v = Math.floor(rand() * variants.length);
      const pos = new THREE.Vector3(t.x, field.terrainAt(t.x, t.z) - 0.05, t.z);
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      const scale = new THREE.Vector3(t.r, t.r * (0.95 + rand() * 0.3), t.r);
      this.slot.push({ mesh: v, index: lists[v].length, pos, rot, scale, shake: 0 });
      lists[v].push(new THREE.Matrix4().compose(pos, rot, scale));
      colliders.add(t.x, t.z, t.r * 0.8);
    }
    variants.forEach((geo, v) => {
      const mesh = new THREE.InstancedMesh(geo, this.material, Math.max(lists[v].length, 1));
      mesh.count = lists[v].length;
      lists[v].forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
  }

  /** Index of the thorn bush Tadeo is touching, or -1. */
  touching(x: number, z: number): number {
    return this.spots.findIndex((t) => Math.hypot(x - t.x, z - t.z) < t.r * 0.8 + 0.43);
  }

  /** Make a bush shiver (after Tadeo bumped into it). */
  shake(i: number): void {
    this.slot[i].shake = 1;
  }

  update(dt: number, time: number): void {
    for (const s of this.slot) {
      if (s.shake <= 0) continue;
      s.shake = Math.max(0, s.shake - dt * 1.8);
      const k = s.shake;
      // Reason: a fast wobble plus a squash-and-stretch reads as the bush shivering after the bump
      this.q.setFromEuler(this.e.set(Math.sin(time * 38) * 0.12 * k, 0, Math.cos(time * 31) * 0.12 * k)).premultiply(s.rot);
      this.s.set(1 + k * 0.12, 1 - k * 0.08, 1 + k * 0.12).multiply(s.scale);
      this.m.compose(s.pos, this.q, this.s);
      const mesh = this.meshes[s.mesh];
      mesh.setMatrixAt(s.index, this.m);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
