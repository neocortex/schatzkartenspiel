/**
 * Small reusable props for the landmarks: crates, barrels, torches,
 * lantern posts, fences, benches, haystacks, flower boxes, fruit crates and
 * the like. Each builder returns a `Model` in local space (origin on the
 * ground, front facing +z) ready to be placed with `addModel`.
 */

import * as THREE from "three";
import { part } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import {
  Model, V3, PAL, emptyModel, addModel, placeAt, tint, withSway, sagPoints, triangles,
  rbox, box, cyl, ball, beam, pole, rope, rockBlob, stoneFn,
} from "./shapes";

/** Wooden crate with darker bands. */
export function crate(seed: number, s = 0.8): Model {
  const rand = mulberry32(seed);
  const m = emptyModel();
  m.solid.push(rbox(s, s, s, tint(PAL.woodLight, rand), { pos: [0, s / 2, 0] }, 0.05));
  for (const y of [0.18, 0.82]) m.solid.push(box(s + 0.04, s * 0.12, s + 0.04, PAL.woodDark, { pos: [0, s * y, 0] }));
  m.solid.push(beam([-s * 0.4, s * 0.2, s / 2 + 0.01], [s * 0.4, s * 0.8, s / 2 + 0.01], s * 0.1, PAL.woodDark, 0.04));
  return m;
}

/** Bulging barrel with iron hoops. */
export function barrel(seed: number, h = 1.0): Model {
  const rand = mulberry32(seed + 3);
  const m = emptyModel();
  const g = new THREE.CylinderGeometry(0.36, 0.36, h, 12, 4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / h + 0.5;
    const k = 1 + Math.sin(t * Math.PI) * 0.16;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  m.solid.push(part(g, tint(PAL.wood, rand), { pos: [0, h / 2, 0] }));
  for (const y of [0.16, 0.84]) m.solid.push(cyl(0.385, 0.385, 0.07, PAL.iron, { pos: [0, h * y, 0] }, 12));
  m.solid.push(cyl(0.33, 0.33, 0.04, PAL.woodDark, { pos: [0, h + 0.005, 0] }, 12));
  return m;
}

/** Wall-mounted or free-standing torch: stick + iron cup; flame anchor at the top. */
export function torch(h = 1.5): Model {
  const m = emptyModel();
  m.solid.push(cyl(0.06, 0.05, h, PAL.woodDark, { pos: [0, h / 2, 0] }, 6));
  m.solid.push(cyl(0.16, 0.08, 0.2, PAL.iron, { pos: [0, h + 0.06, 0] }, 8));
  m.solid.push(cyl(0.13, 0.13, 0.06, "#2a1a10", { pos: [0, h + 0.15, 0] }, 8));
  m.flames.push(new THREE.Vector3(0, h + 0.14, 0));
  return m;
}

/** Village lantern post with a glowing lantern hanging from an arm. */
export function lanternPost(h = 3.0, glass: THREE.ColorRepresentation = new THREE.Color(2.4, 1.6, 0.65)): Model {
  const m = emptyModel();
  m.solid.push(cyl(0.09, 0.13, h, PAL.timber, { pos: [0, h / 2, 0] }, 7));
  m.solid.push(cyl(0.2, 0.24, 0.3, PAL.stoneDark, { pos: [0, 0.15, 0] }, 8));
  m.solid.push(beam([0, h - 0.15, 0], [0.62, h - 0.15, 0], 0.08, PAL.timber));
  m.solid.push(beam([0, h - 0.5, 0], [0.4, h - 0.17, 0], 0.06, PAL.timber));
  m.solid.push(ball(0.11, PAL.timber, [0, h + 0.05, 0]));
  addModel(m, hangingLantern(glass), placeAt(0.55, h - 0.2, 0));
  return m;
}

/** Small lantern hanging from its top at the origin. */
export function hangingLantern(glass: THREE.ColorRepresentation): Model {
  const m = emptyModel();
  m.solid.push(part(new THREE.ConeGeometry(0.2, 0.18, 4), PAL.iron, { pos: [0, -0.16, 0], rot: [0, Math.PI / 4, 0] }));
  m.solid.push(cyl(0.02, 0.02, 0.1, PAL.iron, { pos: [0, -0.04, 0] }, 4));
  m.solid.push(box(0.26, 0.04, 0.26, PAL.iron, { pos: [0, -0.62, 0] }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.solid.push(box(0.03, 0.36, 0.03, PAL.iron, { pos: [x * 0.11, -0.42, z * 0.11] }));
  m.glow.push(box(0.2, 0.34, 0.2, glass, { pos: [0, -0.42, 0] }));
  return m;
}

/** Rail fence along +x from 0 to `len` (posts and two rails). */
export function fence(len: number, seed: number, picket = false): Model {
  const rand = mulberry32(seed + 21);
  const m = emptyModel();
  const n = Math.max(1, Math.round(len / 1.5));
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * len;
    m.solid.push(rbox(0.16, 1.05, 0.16, tint(picket ? PAL.white : PAL.wood, rand), { pos: [x, 0.5, 0], rot: [0, rand() * 0.4, (rand() - 0.5) * 0.06] }, 0.04));
  }
  const rail = picket ? PAL.white : PAL.woodLight;
  for (const y of [0.42, 0.82]) m.solid.push(beam([0, y, 0.02], [len, y + (rand() - 0.5) * 0.05, 0.02], 0.08, rail, 0.06));
  if (picket) {
    const k = Math.round(len / 0.32);
    for (let i = 1; i < k; i++) {
      const x = (i / k) * len;
      m.solid.push(box(0.11, 0.8, 0.04, tint(PAL.white, rand, 0.05), { pos: [x, 0.42, 0.07] }));
      m.solid.push(part(new THREE.ConeGeometry(0.078, 0.12, 4), PAL.white, { pos: [x, 0.88, 0.07], rot: [0, Math.PI / 4, 0] }));
    }
  }
  return m;
}

/** Wooden posts at the given points joined by sagging ropes. Points are local [x, y, z] post bases. */
export function ropeFence(points: V3[], seed: number): Model {
  const rand = mulberry32(seed + 5);
  const m = emptyModel();
  const h = 1.0;
  for (const p of points) {
    m.solid.push(cyl(0.09, 0.11, h, tint(PAL.wood, rand), { pos: [p[0], p[1] + h / 2 - 0.05, p[2]] }, 6));
    m.solid.push(ball(0.1, PAL.woodDark, [p[0], p[1] + h - 0.02, p[2]]));
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    m.solid.push(rope([a[0], a[1] + h - 0.15, a[2]], [b[0], b[1] + h - 0.15, b[2]], 0.22, 0.035));
  }
  return m;
}

/** Simple plank bench. */
export function bench(seed: number, len = 1.8): Model {
  const rand = mulberry32(seed + 11);
  const m = emptyModel();
  m.solid.push(rbox(len, 0.1, 0.46, tint(PAL.woodLight, rand), { pos: [0, 0.48, 0] }, 0.03));
  m.solid.push(rbox(len, 0.3, 0.07, tint(PAL.wood, rand), { pos: [0, 0.82, -0.22], rot: [-0.12, 0, 0] }, 0.03));
  for (const sx of [-1, 1]) {
    m.solid.push(box(0.1, 0.48, 0.4, PAL.woodDark, { pos: [sx * (len / 2 - 0.2), 0.24, 0] }));
    m.solid.push(box(0.08, 0.5, 0.08, PAL.woodDark, { pos: [sx * (len / 2 - 0.2), 0.7, -0.22] }));
  }
  return m;
}

/** Round haystack with a few loose straw bales. */
export function haystack(seed: number): Model {
  const rand = mulberry32(seed + 13);
  const m = emptyModel();
  const straw = (p: THREE.Vector3) => new THREE.Color("#d9b04e").lerp(new THREE.Color("#f2d47c"), THREE.MathUtils.clamp(p.y / 2.2, 0, 1)).multiplyScalar(0.92 + 0.12 * Math.sin(p.y * 9 + p.x * 3));
  const dome = new THREE.SphereGeometry(1.3, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
  dome.scale(1, 1.25, 1);
  m.solid.push(part(dome, straw, { pos: [0, 0.35, 0] }));
  m.solid.push(cyl(1.18, 1.25, 0.5, straw, { pos: [0, 0.25, 0] }, 14));
  m.solid.push(cyl(0.05, 0.05, 1.0, PAL.woodDark, { pos: [0, 2.0, 0] }, 5));
  for (let i = 0; i < 2; i++) {
    const a = 0.6 + i * 1.1 + rand() * 0.3;
    m.solid.push(rbox(1.1, 0.55, 0.6, straw, { pos: [Math.cos(a) * 1.9, 0.28, Math.sin(a) * 1.9], rot: [0, a + 0.4, 0] }, 0.12, 2));
  }
  // A pitchfork leaning on the stack
  m.solid.push(pole([1.0, 0, 0.9], [1.25, 1.9, 0.6], 0.035, PAL.woodLight));
  return m;
}

const FLOWER_COLORS = ["#ff5f7e", "#ffd23f", "#ff8c3a", "#c86bff", "#ffffff", "#5fb7ff"];

/** Planter box with a row of bright flowers (for windows and gardens). */
export function flowerBox(w: number, seed: number): Model {
  const rand = mulberry32(seed + 17);
  const m = emptyModel();
  m.solid.push(rbox(w, 0.24, 0.3, "#8b5a32", { pos: [0, 0.12, 0] }, 0.04));
  m.solid.push(box(w - 0.08, 0.04, 0.24, "#4a3222", { pos: [0, 0.24, 0] }));
  const n = Math.max(3, Math.round(w / 0.17));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.1 + (i / (n - 1)) * (w - 0.2);
    const z = (rand() - 0.5) * 0.12;
    m.solid.push(ball(0.09, rand() < 0.5 ? "#3f8f35" : "#56a83f", [x, 0.3, z], 0));
    m.solid.push(ball(0.07, FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)], [x + (rand() - 0.5) * 0.05, 0.4 + rand() * 0.08, z], 1));
  }
  return m;
}

/** Crate filled with round fruit of one colour. */
export function fruitCrate(seed: number, fruit: THREE.ColorRepresentation, s = 0.62): Model {
  const rand = mulberry32(seed + 23);
  const m = emptyModel();
  m.solid.push(rbox(s, s * 0.55, s * 0.8, tint(PAL.woodLight, rand), { pos: [0, s * 0.275, 0] }, 0.03));
  for (let i = 0; i < 7; i++) {
    const x = (rand() - 0.5) * s * 0.7;
    const z = (rand() - 0.5) * s * 0.55;
    m.solid.push(ball(0.1 + rand() * 0.02, tint(fruit, rand, 0.08), [x, s * 0.55 + 0.02 + rand() * 0.05, z], 1));
  }
  return m;
}

/** Wooden bucket with an iron band and a handle. */
export function bucket(): Model {
  const m = emptyModel();
  m.solid.push(cyl(0.22, 0.17, 0.34, PAL.wood, { pos: [0, 0.17, 0] }, 10));
  m.solid.push(cyl(0.225, 0.225, 0.05, PAL.iron, { pos: [0, 0.27, 0] }, 10));
  m.solid.push(cyl(0.19, 0.19, 0.02, "#2f78b8", { pos: [0, 0.31, 0] }, 10));
  m.solid.push(part(new THREE.TorusGeometry(0.21, 0.015, 4, 10, Math.PI), PAL.iron, { pos: [0, 0.34, 0] }));
  return m;
}

/** Ring of dark jagged rocks around a glowing ember vent. */
export function ventRing(seed: number, r = 1.4): Model {
  const rand = mulberry32(seed + 31);
  const m = emptyModel();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.3;
    const s = 0.35 + rand() * 0.3;
    const g = rockBlob(seed * 10 + i, [s, s * (1.4 + rand() * 1.0), s], stoneFn("#4a4044", 0, rand), 0);
    g.translate(Math.cos(a) * r, s * 0.6, Math.sin(a) * r);
    m.solid.push(g);
  }
  // Reason: the dark collar extends well below ground so the vent sits flush on sloping terrain
  m.solid.push(cyl(r * 0.85, r * 1.1, 1.2, "#2b2427", { pos: [0, -0.4, 0] }, 12));
  // Reason: a squashed glowing dome sits just above the dark disc so it reads as bubbling lava in the vent
  m.pulse.push(ball(r * 0.68, new THREE.Color(3.4, 1.0, 0.14), [0, 0.22, 0], 2, [1, 0.38, 1]));
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    m.glow.push(ball(0.08 + rand() * 0.06, new THREE.Color(4.5, 2.2, 0.4), [Math.cos(a) * r * 0.35, 0.25, Math.sin(a) * r * 0.35], 0));
  }
  return m;
}

const BUNTING_COLORS = ["#e2432f", "#ffd23f", "#3f8fe0", "#4fbf4a", "#ff8c3a", "#ff6fb0", "#ffffff"];

/** String of triangular pennants hanging between two points (world or local). */
export function bunting(a: V3, b: V3, sag: number, seed: number): Model {
  const m = emptyModel();
  const pts = sagPoints(a, b, sag, 24);
  const curve = new THREE.CatmullRomCurve3(pts);
  m.solid.push(part(new THREE.TubeGeometry(curve, 24, 0.025, 3, false), PAL.rope));
  const len = curve.getLength();
  const n = Math.floor(len / 0.5);
  for (let i = 1; i < n; i++) {
    const p0 = curve.getPointAt((i - 0.4) / n);
    const p1 = curve.getPointAt((i + 0.4) / n);
    const tip = p0.clone().lerp(p1, 0.5);
    tip.y -= 0.45;
    const g = triangles([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, tip.x, tip.y, tip.z], BUNTING_COLORS[(i + seed) % BUNTING_COLORS.length]);
    const top = Math.min(p0.y, p1.y);
    m.cloth.push(withSway(g, (p) => Math.max(0, top - p.y) * 0.3));
  }
  return m;
}

/** Clay flower pot with a bushy flower. */
export function flowerPot(seed: number): Model {
  const rand = mulberry32(seed + 37);
  const m = emptyModel();
  m.solid.push(cyl(0.26, 0.19, 0.4, "#c9653d", { pos: [0, 0.2, 0] }, 9));
  m.solid.push(cyl(0.28, 0.28, 0.08, "#b35632", { pos: [0, 0.4, 0] }, 9));
  m.solid.push(ball(0.27, "#4c9a3c", [0, 0.6, 0], 1, [1, 0.8, 1]));
  const c = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)];
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    m.solid.push(ball(0.08, c, [Math.cos(a) * 0.18, 0.7 + rand() * 0.1, Math.sin(a) * 0.18], 1));
  }
  return m;
}
