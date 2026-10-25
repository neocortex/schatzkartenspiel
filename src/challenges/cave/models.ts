/**
 * Procedural geometry for the cave decor: crystal clusters, glowing mushroom
 * clusters, stalagmites, stalactites, boulders and pebbles. Each builder
 * returns one merged, vertex-coloured geometry (origin on the ground) ready
 * for instancing.
 */

import * as THREE from "three";
import { part, merge, displace, facet, gradient } from "../../core/geo";
import { mulberry32 } from "../../core/noise";

/** Colour pair (base, tip) per crystal kind. */
export const CRYSTAL_TINTS: Record<"teal" | "violet", [string, string]> = {
  teal: ["#0f8f86", "#a8fff2"],
  violet: ["#5a2fb8", "#ecc8ff"],
};

/** A cluster of hexagonal crystals fanning out from a rocky base. */
export function crystalCluster(seed: number, tint: [string, string]): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const r = main ? 0.2 : 0.09 + rand() * 0.09;
    const h = main ? 1.3 + rand() * 0.4 : 0.35 + rand() * 0.75;
    const prism = new THREE.CylinderGeometry(r, r * 1.08, h, 6, 1);
    prism.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 2.4, 6, 1);
    tip.translate(0, h + r * 1.2, 0);
    const a = rand() * Math.PI * 2;
    const tilt = main ? rand() * 0.15 : 0.35 + rand() * 0.55;
    const spread = main ? 0 : 0.12 + rand() * 0.22;
    const xf = {
      pos: [Math.cos(a) * spread, -0.05, Math.sin(a) * spread] as [number, number, number],
      rot: [Math.sin(a) * tilt, rand() * Math.PI, -Math.cos(a) * tilt] as [number, number, number],
    };
    const top = h + r * 2.4;
    parts.push(part(prism, gradient(tint[0], tint[1], 0, top), xf));
    parts.push(part(tip, gradient(tint[0], tint[1], 0, top * 0.8), xf));
  }
  return merge(parts);
}

/** Rocky socket the crystals grow out of (lit rock, not glowing). */
export function crystalBase(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.42, 1);
  g.scale(1.2, 0.45, 1.1);
  displace(g, 0.08, 2.2, seed);
  facet(g);
  return merge([part(g, (_p, n) => new THREE.Color(n.y > 0.4 ? "#6d6290" : "#463d5e"))]);
}

/** Glowing mushroom cluster: returns the lit stems and the glowing caps separately. */
export function mushroomCluster(seed: number, cap: THREE.Color): { stems: THREE.BufferGeometry; caps: THREE.BufferGeometry } {
  const rand = mulberry32(seed + 5);
  const stems: THREE.BufferGeometry[] = [];
  const caps: THREE.BufferGeometry[] = [];
  const n = 3 + Math.floor(rand() * 3);
  const spot = cap.clone().lerp(new THREE.Color(1.4, 1.4, 1.4), 0.6);
  for (let i = 0; i < n; i++) {
    const s = i === 0 ? 1 : 0.45 + rand() * 0.45;
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.18 + rand() * 0.2;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = 0.32 * s;
    const lean = (rand() - 0.5) * 0.3;
    stems.push(part(new THREE.CylinderGeometry(0.045 * s, 0.07 * s, h, 7), "#efe4cf", { pos: [x, h / 2, z], rot: [0, 0, lean] }));
    const c = new THREE.SphereGeometry(0.17 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    c.scale(1, 0.7, 1);
    caps.push(part(c, (p) => cap.clone().multiplyScalar(0.7 + p.y / (0.12 * s) * 0.5), { pos: [x - lean * h * 0.5, h, z], rot: [0, 0, lean] }));
    for (let k = 0; k < 3; k++) {
      const b = rand() * Math.PI * 2;
      const r = 0.08 * s;
      caps.push(part(new THREE.IcosahedronGeometry(0.022 * s + 0.008, 0), spot, { pos: [x - lean * h * 0.5 + Math.cos(b) * r, h + 0.09 * s, z + Math.sin(b) * r] }));
    }
  }
  return { stems: merge(stems), caps: merge(caps) };
}

/** Lumpy stalagmite rising from the floor (or, flipped, a stalactite). */
export function stalagmite(seed: number, height: number): THREE.BufferGeometry {
  const rand = mulberry32(seed + 9);
  const parts: THREE.BufferGeometry[] = [];
  const g = new THREE.ConeGeometry(0.42, height, 8, 6);
  g.translate(0, height / 2, 0);
  displace(g, 0.07, 3, seed);
  parts.push(part(g, gradient("#4a4062", "#a497c4", 0, height, 0.15)));
  // A second, smaller spike leaning against the first one
  const h2 = height * (0.35 + rand() * 0.25);
  const g2 = new THREE.ConeGeometry(0.22, h2, 7, 3);
  g2.translate(0, h2 / 2, 0);
  parts.push(part(g2, gradient("#4a4062", "#9a8dbb", 0, h2), { pos: [0.3, 0, 0.12], rot: [0.1, 0, -0.25] }));
  const geo = merge(parts);
  geo.computeVertexNormals();
  return geo;
}

/** Faceted boulder centred at the origin, sitting on its base. */
export function boulder(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed + 13);
  const g = new THREE.IcosahedronGeometry(0.7, 1);
  g.scale(1 + rand() * 0.4, 0.65 + rand() * 0.3, 1 + rand() * 0.3);
  displace(g, 0.16, 1.4, seed * 3.1);
  facet(g);
  const geo = part(g, (p, n) => {
    const c = new THREE.Color("#6f6590").lerp(new THREE.Color("#8d82ad"), THREE.MathUtils.clamp(p.y + 0.3, 0, 1));
    if (n.y < -0.2) c.multiplyScalar(0.6);
    if (n.y > 0.7 && rand() < 0.5) c.lerp(new THREE.Color("#5b8f7c"), 0.35);
    return c;
  });
  geo.translate(0, 0.2, 0);
  return merge([geo]);
}

/** Tiny pebble for floor scatter. */
export function pebble(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.09, 0);
  g.scale(1.3, 0.6, 1);
  displace(g, 0.02, 9, seed);
  facet(g);
  return merge([part(g, seed % 2 ? "#8f8098" : "#a18f86", { pos: [0, 0.03, 0] })]);
}
