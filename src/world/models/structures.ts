/**
 * Walkable wooden structures and tall landmarks: piers (with rope railings
 * and a wide mooring head), the arched river bridge with stone abutments,
 * and the striped lighthouse. Builders work in local space and take height
 * callbacks so posts and abutments reach the real terrain.
 */

import * as THREE from "three";
import { part } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Model, PAL, emptyModel, addModel, placeAt, tint, rbox, box, cyl, ball, beam, rope, rockBlob, stoneFn } from "./shapes";
import { hangingLantern } from "./props";

export interface PierSpec {
  /** Deck length along +x. */
  length: number;
  width: number;
  /** Length of the wider mooring head at the far end (0 = none). */
  headLength: number;
  headWidth: number;
  /** Local ground height (deck top = 0) at along-distance s and side offset z. */
  ground: (s: number, z: number) => number;
  seed: number;
}

/** Wooden pier along +x with the deck top at y = 0. */
export function pier(spec: PierSpec): Model {
  const rand = mulberry32(spec.seed + 61);
  const m = emptyModel();
  const { length: L, width: W, headLength: HL, headWidth: HW } = spec;
  const widthAt = (s: number) => (s > L - HL ? HW : W);
  // Planks across the deck
  const pw = 0.38;
  for (let s = pw / 2; s < L; s += pw + 0.035) {
    const w = widthAt(s);
    m.solid.push(box(pw, 0.14, w + (rand() - 0.5) * 0.12, tint(PAL.plank, rand, 0.14), { pos: [s, -0.07, (rand() - 0.5) * 0.06], rot: [0, (rand() - 0.5) * 0.02, 0] }));
  }
  // Stringers and posts down to the seabed
  for (const side of [-1, 1]) {
    m.solid.push(box(L - HL, 0.24, 0.2, PAL.woodDark, { pos: [(L - HL) / 2, -0.24, side * (W / 2 - 0.12)] }));
    m.solid.push(box(HL, 0.24, 0.2, PAL.woodDark, { pos: [L - HL / 2, -0.24, side * (HW / 2 - 0.12)] }));
  }
  m.solid.push(box(0.2, 0.24, HW, PAL.woodDark, { pos: [L - HL, -0.24, 0] }));
  m.solid.push(box(0.2, 0.24, HW, PAL.woodDark, { pos: [L - 0.1, -0.24, 0] }));
  const postStep = 2.4;
  const railPosts: [number, number, number][] = [];
  for (let s = 0.2; s <= L + 0.01; s += postStep) {
    const ss = Math.min(s, L - 0.2);
    for (const side of [-1, 1]) {
      const z = side * (widthAt(ss) / 2 - 0.05);
      const g = Math.max(spec.ground(ss, z), -4.5);
      const tall = ss > 1.5 && ss < L - HL - 0.5;
      const top = tall ? 1.05 : 0.25;
      if (top - g < 0.2) continue;
      m.solid.push(cyl(0.15, 0.17, top - g, tint(PAL.woodDark, rand, 0.1), { pos: [ss, (top + g) / 2, z] }, 8));
      if (tall) {
        m.solid.push(ball(0.15, PAL.woodDark, [ss, top, z], 1, [1, 0.6, 1]));
        railPosts.push([ss, top - 0.12, z]);
      }
      // Reason: a pale band just above the waterline sells the wet, weathered look of the posts
      if (g < -0.2) m.solid.push(cyl(0.175, 0.175, 0.25, "#b9b096", { pos: [ss, 0.05 - 0.75, z] }, 8));
    }
  }
  for (let i = 0; i < railPosts.length - 2; i++) {
    const a = railPosts[i];
    const b = railPosts[i + 2];
    if (Math.sign(a[2]) === Math.sign(b[2])) m.solid.push(rope(a, b, 0.2, 0.04));
  }
  // Mooring head: bollards and corner posts
  for (const side of [-1, 1]) {
    for (const s of [L - HL + 0.6, L - 0.6]) {
      m.solid.push(cyl(0.2, 0.24, 0.55, PAL.woodDark, { pos: [s, 0.27, side * (HW / 2 - 0.35)] }, 9));
      m.solid.push(cyl(0.26, 0.26, 0.08, PAL.iron, { pos: [s, 0.52, side * (HW / 2 - 0.35)] }, 9));
    }
  }
  return m;
}

export interface BridgeSpec {
  /** Span along x, centred on the origin (origin y = water level). */
  span: number;
  width: number;
  /** Deck-top height at local x. */
  deckAt: (x: number) => number;
  /** Ground height at local (x, z). */
  ground: (x: number, z: number) => number;
  seed: number;
}

/** Arched wooden bridge with railings, curved support arches and stone abutments. */
export function bridge(spec: BridgeSpec): Model {
  const rand = mulberry32(spec.seed + 67);
  const m = emptyModel();
  const { span: S, width: W, deckAt } = spec;
  const half = S / 2;
  const slopeAt = (x: number) => Math.atan2(deckAt(x + 0.05) - deckAt(x - 0.05), 0.1);
  // Deck planks
  for (let x = -half + 0.2; x <= half - 0.2; x += 0.42) {
    m.solid.push(box(0.38, 0.14, W + (rand() - 0.5) * 0.1, tint(PAL.plank, rand, 0.12), { pos: [x, deckAt(x) - 0.07, 0], rot: [0, 0, slopeAt(x)] }));
  }
  // Curved stringers, support arches and struts on both sides
  const archAt = (x: number) => {
    const t = x / (half - 1.2);
    return 0.4 + (deckAt(0) - 0.7) * Math.cos((t * Math.PI) / 2);
  };
  const steps = 16;
  for (const side of [-1, 1]) {
    const z = side * (W / 2 - 0.1);
    for (let i = 0; i < steps; i++) {
      const x0 = -half + (i / steps) * S;
      const x1 = -half + ((i + 1) / steps) * S;
      m.solid.push(beam([x0, deckAt(x0) - 0.28, z], [x1, deckAt(x1) - 0.28, z], 0.32, PAL.woodDark, 0.22));
      const a0 = -half + 1.2 + (i / steps) * (S - 2.4);
      const a1 = -half + 1.2 + ((i + 1) / steps) * (S - 2.4);
      m.solid.push(beam([a0, archAt(a0), z], [a1, archAt(a1), z], 0.36, PAL.wood, 0.28));
    }
    for (let x = -half + 2.6; x <= half - 2.5; x += 1.6) m.solid.push(beam([x, archAt(x), z], [x, deckAt(x) - 0.3, z], 0.16, PAL.woodDark, 0.16));
    // Railing: posts, top rail, lattice braces
    const posts: number[] = [];
    for (let x = -half + 0.3; x <= half - 0.25; x += (S - 0.6) / 8) posts.push(x);
    const rz = side * (W / 2 + 0.02);
    posts.forEach((x, i) => {
      const end = i === 0 || i === posts.length - 1;
      const h = end ? 1.45 : 1.1;
      m.solid.push(rbox(0.2, h + 0.3, 0.2, PAL.wood, { pos: [x, deckAt(x) + h / 2 - 0.15, rz] }, 0.04));
      m.solid.push(ball(0.14, PAL.woodDark, [x, deckAt(x) + h - 0.02, rz], 1, [1, 0.7, 1]));
      if (i < posts.length - 1) {
        const xn = posts[i + 1];
        m.solid.push(beam([x, deckAt(x) + 0.95, rz], [xn, deckAt(xn) + 0.95, rz], 0.13, PAL.woodLight, 0.15));
        m.solid.push(beam([x, deckAt(x) + 0.12, rz], [xn, deckAt(xn) + 0.85, rz], 0.08, PAL.wood, 0.08));
        m.solid.push(beam([x, deckAt(x) + 0.85, rz], [xn, deckAt(xn) + 0.12, rz], 0.08, PAL.wood, 0.08));
      }
    });
    // Lanterns on the end posts
    for (const sx of [-1, 1]) {
      const x = posts[sx < 0 ? 0 : posts.length - 1];
      addModel(m, hangingLantern(new THREE.Color(2.2, 1.5, 0.6)), placeAt(x, deckAt(x) + 1.55, rz, 0, 0.75));
      m.solid.push(cyl(0.12, 0.12, 0.1, PAL.iron, { pos: [x, deckAt(x) + 1.45, rz] }, 6));
    }
  }
  // Stone abutments at both ends, reaching down into the water
  for (const sx of [-1, 1]) {
    const x = sx * (half - 1.0);
    const topY = deckAt(x) - 0.4;
    const bottom = Math.min(spec.ground(x, 0), -1.2);
    const courses = Math.max(2, Math.ceil((topY - bottom) / 0.7));
    for (let c = 0; c < courses; c++) {
      const y = bottom + (c + 0.5) * ((topY - bottom) / courses);
      for (const z of [-1, 0, 1]) {
        m.solid.push(rbox(1.5 + rand() * 0.3, (topY - bottom) / courses - 0.04, W / 3 + 0.25, tint(PAL.stone, rand, 0.12), { pos: [x + (rand() - 0.5) * 0.15, y, (z * W) / 3 + (c % 2) * 0.12], rot: [0, (rand() - 0.5) * 0.1, 0] }, 0.12));
      }
    }
    for (let i = 0; i < 4; i++) {
      const g = rockBlob(spec.seed + i + (sx > 0 ? 10 : 0), [0.7 + rand() * 0.5, 0.5, 0.7 + rand() * 0.5], stoneFn(PAL.stone, 0.5, rand));
      g.translate(x - sx * (0.9 + rand() * 0.6), bottom + 0.4, (rand() - 0.5) * W * 1.4);
      m.solid.push(g);
    }
  }
  return m;
}

/** Striped lighthouse on a rock base; the lamp anchor is at y = `lampY` (see return). */
export function lighthouse(seed: number): { model: Model; lampY: number } {
  const rand = mulberry32(seed + 71);
  const m = emptyModel();
  const H = 9;
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * H;
    const y1 = ((i + 1) / bands) * H;
    const r0 = 1.5 - (y0 / H) * 0.5;
    const r1 = 1.5 - (y1 / H) * 0.5;
    m.solid.push(cyl(r1, r0, y1 - y0, i % 2 ? PAL.white : "#d8382b", { pos: [0, (y0 + y1) / 2 + 0.6, 0] }, 16));
  }
  m.solid.push(cyl(1.75, 1.85, 0.7, PAL.stoneDark, { pos: [0, 0.3, 0] }, 16));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const g = rockBlob(seed + i, [1.1 + rand() * 0.6, 0.8 + rand() * 0.5, 1.1 + rand() * 0.6], stoneFn("#8d8580", 0.4, rand));
    g.translate(Math.cos(a) * 2.2, 0.1, Math.sin(a) * 2.2);
    m.solid.push(g);
  }
  // Door and windows
  m.solid.push(rbox(0.7, 1.3, 0.3, "#5a3a25", { pos: [0, 1.35, 1.42] }, 0.05));
  for (const [y, a] of [[4.2, 0.6], [6.6, -0.9]]) {
    const r = 1.5 - ((y - 0.6) / H) * 0.5;
    m.glow.push(rbox(0.32, 0.5, 0.12, new THREE.Color(1.9, 1.3, 0.55), { pos: [Math.sin(a) * r, y, Math.cos(a) * r], rot: [0, a, 0] }, 0.03));
  }
  // Gallery, lantern room and roof
  const gy = H + 0.6;
  m.solid.push(cyl(1.55, 1.3, 0.3, PAL.stoneDark, { pos: [0, gy, 0] }, 16));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    m.solid.push(cyl(0.035, 0.035, 0.7, PAL.iron, { pos: [Math.cos(a) * 1.45, gy + 0.45, Math.sin(a) * 1.45] }, 4));
  }
  m.solid.push(part(new THREE.TorusGeometry(1.45, 0.05, 4, 24), PAL.iron, { pos: [0, gy + 0.8, 0], rot: [Math.PI / 2, 0, 0] }));
  m.glow.push(cyl(0.75, 0.75, 1.1, new THREE.Color(3.0, 2.6, 1.4), { pos: [0, gy + 0.75, 0] }, 12));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    m.solid.push(box(0.08, 1.1, 0.08, PAL.iron, { pos: [Math.cos(a) * 0.78, gy + 0.75, Math.sin(a) * 0.78] }));
  }
  m.solid.push(cyl(0.2, 1.05, 0.9, "#d8382b", { pos: [0, gy + 1.75, 0] }, 12));
  m.solid.push(ball(0.16, PAL.gold, [0, gy + 2.3, 0]));
  return { model: m, lampY: gy + 0.75 };
}
