/**
 * Forest ground: one heightfield mesh for the glade and the surrounding
 * forest floor, painted per vertex (soft moss in the clearings, worn dirt
 * trails, sandy brook banks, dark violet loam under the trees) with the
 * baked glow of mushrooms, flowers and light shafts added on top.
 */

import * as THREE from "three";
import { Noise2D } from "../../core/noise";
import { GlowField, rockMaterial } from "../cave/materials";
import { ForestField, HILL, MAX_X, MAX_Z, MIN_X, MIN_Z } from "./layout";

const RES = 0.5;

const C = {
  moss: new THREE.Color("#3f7d58"),
  mossLight: new THREE.Color("#6aa866"),
  mossTeal: new THREE.Color("#2f7a72"),
  loam: new THREE.Color("#2a3346"),
  loamViolet: new THREE.Color("#3b2f58"),
  dirt: new THREE.Color("#8a7158"),
  dirtDark: new THREE.Color("#6a5848"),
  sand: new THREE.Color("#a49270"),
  bed: new THREE.Color("#2a5252"),
  hilltop: new THREE.Color("#86c06e"),
};

export function createForestGround(field: ForestField, glow: GlowField): THREE.Mesh {
  const noise = new Noise2D(31);
  const nx = Math.round((MAX_X - MIN_X) / RES) + 1;
  const nz = Math.round((MAX_Z - MIN_Z) / RES) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = MIN_X + i * RES;
      const z = MIN_Z + j * RES;
      const y = field.terrainAt(x, z);
      pos.set([x, y, z], k * 3);
      paint(field, noise, x, z, y, c);
      col.set([c.r, c.g, c.b], k * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      index.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();

  // Bake the glow of every registered source into the vertices
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const glowData = new Float32Array(nx * nz * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let k = 0; k < nx * nz; k++) {
    glow.at(p.fromArray(pos, k * 3), n.fromBufferAttribute(nrm, k), c);
    glowData.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute("aGlow", new THREE.BufferAttribute(glowData, 3));

  const mesh = new THREE.Mesh(geo, rockMaterial({ roughness: 0.95 }));
  mesh.receiveShadow = true;
  return mesh;
}

function paint(field: ForestField, noise: Noise2D, x: number, z: number, y: number, out: THREE.Color): void {
  const open = field.openAt(x, z);
  const n1 = noise.noise(x * 0.22, z * 0.22);
  const n2 = noise.noise(x * 0.9 + 40, z * 0.9);
  // Glade moss: patches of lighter and teal moss
  out.copy(C.moss).lerp(C.mossLight, THREE.MathUtils.clamp(0.45 + n1 * 0.5, 0, 1));
  out.lerp(C.mossTeal, THREE.MathUtils.clamp(-n2 * 0.6, 0, 0.5));
  // Sunny hilltop
  const hill = THREE.MathUtils.smoothstep(HILL.r - Math.hypot(x - HILL.x, z - HILL.z), 1.5, 4);
  out.lerp(C.hilltop, hill * 0.55);
  // Forest floor outside the glade: dark loam with violet leaf litter
  const forest = THREE.MathUtils.smoothstep(-open, -0.2, 1.6);
  const loam = C.loam.clone().lerp(C.loamViolet, THREE.MathUtils.clamp(0.5 + n1 * 0.8, 0, 1));
  out.lerp(loam, forest);
  // Worn trails
  const trail = field.trailAt(x, z) * (1 - forest);
  out.lerp(C.dirt.clone().lerp(C.dirtDark, THREE.MathUtils.clamp(n2 * 0.5 + 0.5, 0, 1)), trail * 0.85);
  // Brook: sandy banks, dark teal bed
  const brook = field.brookAt(x, z);
  if (brook > 0) {
    out.lerp(C.sand, THREE.MathUtils.smoothstep(brook, 0, 0.35) * 0.8);
    out.lerp(C.bed, THREE.MathUtils.smoothstep(brook, 0.45, 0.95));
  }
  // Reason: tiny per-vertex jitter breaks up the smooth gradients like a hand-painted diorama
  out.multiplyScalar(0.92 + n2 * 0.08 + Math.min(y, 1) * 0.03);
}
