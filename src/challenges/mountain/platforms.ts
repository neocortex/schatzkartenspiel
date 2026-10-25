/**
 * Platform meshes for the climb: chunky rock ledges swept along the helix
 * (with an overhanging grass, moss or snow cap), pill-shaped stepping stones,
 * wooden boardwalks on stilts with a rope railing, a sagging rope bridge,
 * stone summit stairs and leaning ladders. Everything is painted vertex
 * geometry, merged into one mesh with the shared landmark "solid" material.
 */

import * as THREE from "three";
import { Noise2D, mulberry32, smoothstep } from "../../core/noise";
import { Model, emptyModel, rbox, pole, rope, rockBlob, stoneFn, tint, PAL, placeAt, V3 } from "../../world/models/shapes";
import { Course, Piece, DEPTH, stairCount } from "./course";
import { baseHeight } from "./terrain";

const noise = new Noise2D(4242);
const HW = DEPTH / 2;

/** Cap (walk surface + overhanging lip) cross-section, inner → outer. */
const CAP: [number, number][] = [
  [-HW - 0.14, -0.3], [-HW - 0.02, -0.06], [-HW + 0.35, 0], [-0.45, 0], [0.45, 0], [HW - 0.35, 0], [HW + 0.03, -0.06], [HW + 0.16, -0.32],
];

interface Style {
  top: THREE.Color;
  lip: THREE.Color;
  rock: THREE.Color;
  rockDark: THREE.Color;
}

function styleFor(y: number): Style {
  if (y >= 25.5) {
    return { top: new THREE.Color("#f7fbff"), lip: new THREE.Color("#d6e6fa"), rock: new THREE.Color("#8b8fa3"), rockDark: new THREE.Color("#585b70") };
  }
  if (y >= 18.5) {
    return { top: new THREE.Color("#a7c25a"), lip: new THREE.Color("#7f9c3e"), rock: new THREE.Color("#9a8d86"), rockDark: new THREE.Color("#635a5e") };
  }
  return { top: new THREE.Color("#6fcf45"), lip: new THREE.Color("#4ea434"), rock: new THREE.Color("#b08f6e"), rockDark: new THREE.Color("#6e5545") };
}

/** One painted, non-indexed strip between consecutive rings. `up` picks the winding. */
function strip(rings: THREE.Vector3[][], colors: THREE.Color[][], up: boolean): THREE.BufferGeometry {
  const n = rings.length;
  const k = rings[0].length;
  const pos: number[] = [];
  const col: number[] = [];
  for (const ring of rings) for (const p of ring) pos.push(p.x, p.y, p.z);
  for (const ring of colors) for (const c of ring) col.push(c.r, c.g, c.b);
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < k - 1; j++) {
      const a = i * k + j;
      const b = (i + 1) * k + j;
      const c = (i + 1) * k + j + 1;
      const d = i * k + j + 1;
      if (up) idx.push(a, d, b, b, d, c);
      else idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Fan-triangulated end cap of an outline (flip for the start end). */
function endCap(outline: THREE.Vector3[], color: THREE.Color, flip: boolean): THREE.BufferGeometry {
  const c = new THREE.Vector3();
  for (const p of outline) c.add(p);
  c.divideScalar(outline.length);
  const pos: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (flip) pos.push(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z);
    else pos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const col = new Float32Array(pos.length);
  for (let i = 0; i < col.length; i += 3) col.set([color.r, color.g, color.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

interface SweepOptions {
  /** Pill-shaped ends (stepping stones). */
  taper?: boolean;
  /** Skip the walk-surface cap (stairs put their own steps on top). */
  noCap?: boolean;
  /** Override the top height (e.g. smooth line under quantised stairs). */
  top?: (s: number) => number;
  /** Override the height-based colours. */
  style?: Style;
}

/** Rock ledge swept along [s0, s1]: cap + U-shaped body + end caps. */
function ledge(course: Course, p: Piece, s0: number, s1: number, o: SweepOptions = {}): THREE.BufferGeometry[] {
  const topAt = o.top ?? ((s: number) => course.top(p, s));
  const style = o.style ?? styleFor(Math.min(p.y0, p.y1));
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.45));
  const capRings: THREE.Vector3[][] = [];
  const capCols: THREE.Color[][] = [];
  const bodyRings: THREE.Vector3[][] = [];
  const bodyCols: THREE.Color[][] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const t = i / n;
    const top = topAt(s);
    const r = course.radius(top);
    const k = o.taper ? 0.62 + 0.38 * Math.pow(Math.sin(Math.PI * t), 0.45) : 1;
    course.point(s, r + HW, top, tmp);
    const H = THREE.MathUtils.clamp(top - baseHeight(tmp.x, tmp.z) + 0.9, 1.3, 9) * (o.taper ? 0.8 + 0.2 * k : 1);
    const wob = (j: number, f: number) => noise.noise(s * 0.9 + j * 1.7, f) ;
    capRings.push(CAP.map(([u, v], j) => course.point(s, r + u * k, top + v + (j === 0 || j === CAP.length - 1 ? wob(j, 3) * 0.06 : 0))));
    capCols.push(CAP.map((_, j) => {
      const c = j <= 1 || j >= CAP.length - 2 ? style.lip.clone() : style.top.clone();
      return c.multiplyScalar(0.93 + noise.noise(s * 0.6, j * 0.4) * 0.07);
    }));
    const body: [number, number][] = [
      [-HW + 0.02, -0.18], [-HW + 0.05 + wob(1, 1) * 0.12, -H * 0.45], [-HW + 0.4, -H], [0, -H - 0.15],
      [HW - 0.6, -H + wob(2, 2) * 0.2], [HW - 0.12 + wob(3, 3) * 0.16, -H * 0.5], [HW + 0.02 + wob(4, 4) * 0.08, -H * 0.18], [HW, -0.2],
    ];
    bodyRings.push(body.map(([u, v]) => course.point(s, r + u * k, top + v)));
    bodyCols.push(body.map(([, v]) => style.rock.clone().lerp(style.rockDark, smoothstep(0, H, -v)).multiplyScalar(0.92 + wob(5, v) * 0.08)));
  }
  const out: THREE.BufferGeometry[] = [];
  if (!o.noCap) out.push(strip(capRings, capCols, true));
  out.push(strip(bodyRings, bodyCols, false));
  // End caps: cap ring across the top, then the body back down and around
  for (const [i, flip] of [[0, true], [n, false]] as const) {
    const outline = [...(o.noCap ? [] : capRings[i]), ...[...bodyRings[i]].reverse()];
    out.push(endCap(outline, style.rock.clone().multiplyScalar(0.85), flip));
  }
  return out;
}

/** Wooden boardwalk: planks across the path, stilts down to the slope, rope railing on the outside. */
function boardwalk(course: Course, p: Piece, m: Model, rand: () => number): void {
  const tmp = new THREE.Vector3();
  const len = p.s1 - p.s0;
  const n = Math.round(len / 0.46);
  const slope = Math.atan2(p.y1 - p.y0, len);
  for (let i = 0; i < n; i++) {
    const s = p.s0 + ((i + 0.5) * len) / n;
    const y = course.top(p, s);
    const r = course.radius(y);
    course.point(s, r, y - 0.08, tmp);
    const g = rbox(DEPTH * 0.92, 0.14, 0.4, tint(PAL.plank, rand, 0.14), { rot: [slope, 0, 0] }, 0.04);
    g.applyMatrix4(placeAt(tmp.x, tmp.y, tmp.z, -course.theta(s)));
    m.solid.push(g);
  }
  // Stilts and cross beams every ~2 m, railing posts on the outer edge
  const posts: V3[] = [];
  for (let s = p.s0 + 0.3; s <= p.s1 - 0.2; s += 2.1) {
    const y = course.top(p, s);
    const r = course.radius(y);
    for (const u of [-HW + 0.25, HW - 0.25]) {
      const a = course.point(s, r + u, y - 0.15);
      const ground = baseHeight(a.x, a.z) - 0.5;
      m.solid.push(pole([a.x, ground, a.z], [a.x, a.y, a.z], 0.1, tint(PAL.woodDark, rand), 6));
    }
    const i0 = course.point(s, r - HW + 0.2, y - 0.3);
    const i1 = course.point(s, r + HW - 0.2, y - 0.3);
    m.solid.push(pole([i0.x, i0.y, i0.z], [i1.x, i1.y, i1.z], 0.07, PAL.timber, 5));
    const top = course.point(s, r + HW - 0.12, y);
    m.solid.push(pole([top.x, top.y - 0.1, top.z], [top.x, top.y + 0.85, top.z], 0.06, PAL.wood, 6));
    posts.push([top.x, top.y + 0.75, top.z]);
  }
  for (let i = 0; i < posts.length - 1; i++) m.solid.push(rope(posts[i], posts[i + 1], 0.18, 0.03));
}

/** Sagging rope bridge: planks hanging between two posts, hand ropes on both sides. */
function ropeBridge(course: Course, p: Piece, m: Model, rand: () => number): void {
  const tmp = new THREE.Vector3();
  const len = p.s1 - p.s0;
  const n = Math.round(len / 0.42);
  const r = course.radius((p.y0 + p.y1) / 2);
  for (let i = 0; i < n; i++) {
    const s = p.s0 + ((i + 0.5) * len) / n;
    const y = course.top(p, s);
    const dy = course.top(p, s + 0.05) - course.top(p, s - 0.05);
    course.point(s, r, y - 0.06, tmp);
    const g = rbox(DEPTH * 0.7, 0.1, 0.34, tint("#b98552", rand, 0.18), { rot: [Math.atan2(dy, 0.1), (rand() - 0.5) * 0.08, 0] }, 0.03);
    g.applyMatrix4(placeAt(tmp.x, tmp.y, tmp.z, -course.theta(s)));
    m.solid.push(g);
  }
  for (const u of [-DEPTH * 0.38, DEPTH * 0.38]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 10; i++) {
      const s = p.s0 + (len * i) / 10;
      const a = course.point(s, r + u, course.top(p, s) + 0.95 + 0.25 * Math.sin((Math.PI * i) / 10));
      pts.push([a.x, a.y, a.z]);
    }
    for (let i = 0; i < pts.length - 1; i++) m.solid.push(rope(pts[i], pts[i + 1], 0.02, 0.035));
    // Thin hanger ropes from the hand rope down to the planks
    for (let i = 1; i < 10; i++) {
      const s = p.s0 + (len * i) / 10;
      const b = course.point(s, r + u, course.top(p, s) - 0.02);
      m.solid.push(pole([b.x, b.y, b.z], pts[i], 0.015, PAL.rope, 3));
    }
    for (const s of [p.s0 - 0.25, p.s1 + 0.25]) {
      const y = course.top(p, s < p.s0 ? p.s0 : p.s1);
      const a = course.point(s, r + u, y - 0.4);
      m.solid.push(pole([a.x, a.y, a.z], [a.x, a.y + 1.6, a.z], 0.12, tint(PAL.woodDark, rand), 7));
      m.solid.push(rope([a.x, a.y + 1.2, a.z], [a.x, a.y + 1.3, a.z], 0, 0.14, PAL.rope, 2));
    }
  }
}

/** Stone summit stairs: one rounded block per step on top of a ledge body. */
function stairs(course: Course, p: Piece, m: Model, rand: () => number): THREE.BufferGeometry[] {
  const n = stairCount(p);
  const run = (p.s1 - p.s0) / n;
  const tmp = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const s = p.s0 + (k + 0.5) * run;
    const y = course.top(p, s);
    const r = course.radius(y);
    course.point(s, r, y - 0.32, tmp);
    const snowy = (k + Math.floor(rand() * 3)) % 3 === 0;
    const g = rbox(DEPTH * 0.86, 0.64, run + 0.06, snowy ? "#eef4ff" : tint("#c7c0b8", rand, 0.08), {}, 0.08);
    g.applyMatrix4(placeAt(tmp.x, tmp.y, tmp.z, -course.theta(s)));
    m.solid.push(g);
  }
  // Reason: the body under the steps follows a smooth line just below the step corners
  const smooth = (s: number) => p.y0 + ((p.y1 - p.y0) * (s - p.s0)) / (p.s1 - p.s0) - 0.45;
  // Reason: light masonry grey, so the long stair body doesn't read as a dark slab
  const masonry = { ...styleFor(p.y0), rock: new THREE.Color("#aba5a2"), rockDark: new THREE.Color("#7a7580") };
  return ledge(course, p, p.s0, p.s1, { noCap: true, top: smooth, style: masonry });
}

/** Ladder leaning on the cliff face behind the end of the lower ledge. */
function ladder(course: Course, s: number, yb: number, yt: number, m: Model, rand: () => number): void {
  const r = ladderRadius(course, yt);
  const side = course.tangent(s).multiplyScalar(0.32);
  const base = course.point(s, r + 0.12, yb - 0.05);
  const top = course.point(s, r, yt + 0.75);
  for (const k of [-1, 1]) {
    m.solid.push(pole([base.x + side.x * k, base.y, base.z + side.z * k], [top.x + side.x * k, top.y, top.z + side.z * k], 0.06, tint("#9a6235", rand, 0.1), 6));
  }
  const rungs = Math.round((yt + 0.6 - yb) / 0.4);
  for (let i = 1; i <= rungs; i++) {
    const c = base.clone().lerp(top, i / (rungs + 0.4));
    m.solid.push(pole([c.x - side.x, c.y, c.z - side.z], [c.x + side.x, c.y, c.z + side.z], 0.045, "#c98d55", 5));
  }
}

/** Radius of a ladder: just in front of the upper ledge's outer face. */
export function ladderRadius(course: Course, yt: number): number {
  return course.radius(yt) + HW + 0.18;
}

/** Ladder position along the path (just before the wall at `l.s`). */
export const LADDER_BACK = 0.75;

/** Build every platform of the course as one merged model. */
export function buildPlatforms(course: Course): Model {
  const rand = mulberry32(31);
  const m = emptyModel();
  for (const p of course.pieces) {
    const atLadder = course.ladders.find((l) => Math.abs(l.s - p.s0) < 0.01);
    // Reason: a ledge that starts at a ladder reaches back over it, so the ladder leans on rock
    const s0 = atLadder ? p.s0 - LADDER_BACK - 0.9 : p.s0;
    if (p.kind === "ledge") m.solid.push(...ledge(course, p, s0, p.s1));
    else if (p.kind === "stone") m.solid.push(...ledge(course, p, p.s0, p.s1, { taper: true }));
    else if (p.kind === "boards") boardwalk(course, p, m, rand);
    else if (p.kind === "bridge") ropeBridge(course, p, m, rand);
    else if (p.kind === "stairs") m.solid.push(...stairs(course, p, m, rand));
  }
  for (const l of course.ladders) {
    ladder(course, l.s - LADDER_BACK, l.yb, l.yt, m, rand);
    // A rock closes the lower ledge, so the only way on is up
    const b = course.point(l.s + 0.5, course.radius(l.yb) + 0.35, l.yb + 0.3);
    const g = rockBlob(l.s * 3, [0.8, 0.95, 0.75], stoneFn("#9b948f", l.yb < 20 ? 0.35 : 0, rand), 1);
    g.translate(b.x, b.y, b.z);
    m.solid.push(g);
  }
  return m;
}
