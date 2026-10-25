/**
 * Cave terrain: one heightfield mesh for floor and walls, sampled from the
 * baked signed-distance field. Wall vertices are jittered so the rock looks
 * hand-sculpted instead of gridded, colours are painted per vertex (warm
 * floor, banded purple rock, near-black crests that melt into the darkness)
 * and the baked glow of every crystal and mushroom is added on top.
 */

import * as THREE from "three";
import { Noise2D } from "../../core/noise";
import { CaveField, MIN_X, MIN_Z, NX, NZ, RES } from "./layout";
import { GlowField, rockMaterial } from "./materials";

const C = {
  floor: new THREE.Color("#8a7672"),
  floorDark: new THREE.Color("#5b4a52"),
  sand: new THREE.Color("#a88a73"),
  moss: new THREE.Color("#4f8a76"),
  basin: new THREE.Color("#1f5262"),
  rock: new THREE.Color("#73689a"),
  rockLight: new THREE.Color("#9286b8"),
  rockDark: new THREE.Color("#4b4266"),
  crest: new THREE.Color("#1a1526"),
};

export function createCaveTerrain(field: CaveField, glow: GlowField): THREE.Mesh {
  const noise = new Noise2D(77);
  const count = NX * NZ;
  const pos = new Float32Array(count * 3);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      let x = MIN_X + i * RES;
      let z = MIN_Z + j * RES;
      const open = field.open[k];
      let y = field.height[k];
      // Reason: jitter only the wall faces so the walkable floor stays where the collision says it is
      const face = THREE.MathUtils.smoothstep(-open, 0.15, 0.6) * (1 - THREE.MathUtils.smoothstep(-open, 2.2, 3.2));
      if (face > 0) {
        x += noise.noise(x * 1.7, z * 1.7 + 3) * 0.28 * face;
        z += noise.noise(x * 1.7 + 9, z * 1.7) * 0.28 * face;
        y += noise.noise(x * 2.3, z * 2.3) * 0.18 * face;
      }
      pos.set([x, y, z], k * 3);
    }
  }

  const index: number[] = [];
  for (let j = 0; j < NZ - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i;
      const b = a + 1;
      const c = a + NX;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();

  const colors = new Float32Array(count * 3);
  const glows = new Float32Array(count * 3);
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const col = new THREE.Color();
  const g = new THREE.Color();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    p.fromArray(pos, k * 3);
    n.fromBufferAttribute(nrm, k);
    paint(field.open[k], field.water[k], p, n, noise, col);
    colors.set([col.r, col.g, col.b], k * 3);
    glow.at(p, n, g);
    glows.set([g.r, g.g, g.b], k * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aGlow", new THREE.BufferAttribute(glows, 3));
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, rockMaterial({ xray: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "cave-terrain";
  return mesh;
}

function paint(open: number, water: number, p: THREE.Vector3, n: THREE.Vector3, noise: Noise2D, out: THREE.Color): void {
  const grain = noise.noise(p.x * 0.6, p.z * 0.6) * 0.5 + 0.5;
  if (open > 0) {
    // Floor: warm stone with darker cracks, sandy drifts along the walls, moss and wet stone by the pool
    // Reason: keep the pattern several grid cells wide, finer noise aliases into diagonal streaks
    out.copy(C.floor).lerp(C.floorDark, THREE.MathUtils.smoothstep(noise.noise(p.x * 0.45, p.z * 0.45), -0.1, 0.8) * 0.8);
    out.lerp(C.sand, (1 - THREE.MathUtils.smoothstep(open, 0.2, 1.2)) * 0.45 * grain);
    const pool = THREE.MathUtils.smoothstep(water, -2.2, -0.4);
    out.lerp(C.moss, pool * 0.6 * (0.6 + 0.4 * grain));
    out.lerp(C.basin, THREE.MathUtils.smoothstep(water, -0.4, 0.5));
    return;
  }
  // Rock: strata bands across the face, darker towards the crest so the cave fades into the night
  const band = Math.sin(p.y * 4.2 + noise.noise(p.x * 0.4, p.z * 0.4) * 2.5);
  out.copy(C.rock).lerp(band > 0.3 ? C.rockLight : C.rockDark, Math.abs(band) * 0.55);
  out.multiplyScalar(0.85 + grain * 0.3);
  const high = THREE.MathUtils.smoothstep(p.y, 1.2, 2.5) * 0.8 + THREE.MathUtils.smoothstep(-open, 1.4, 3.0) * 0.2;
  out.lerp(C.crest, Math.min(high * (n.y > 0.5 ? 1 : 0.85), 1));
}
