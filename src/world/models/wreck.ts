/**
 * Tadeo's wrecked boat on the landing beach: the boat he sailed, broken on the
 * sand with the shark's bite in its side, the mast snapped and the sail fallen.
 */

import * as THREE from "three";
import { part } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Model, PAL, V3, addModel, box, cyl, emptyModel, flip, pole, rbox, rope, spike, tint, triangles, withSway } from "./shapes";
import { DEPTH, HALF_LEN, NORTH_DOCK_BOAT, RIM, bowName, hullPoint, hullSurface, rimPoint, sheer } from "./boats";
import { SignAtlas } from "./signs";

/** The shark's bite in the hull's +z side: a half circle with toothy scallops around (x, y) in hull space. */
const BITE = { x: -0.75, y: 0.55, r: 0.92, teeth: 7 };
const biteRadius = (angle: number): number => BITE.r * (1 + 0.14 * Math.abs(Math.sin((angle * BITE.teeth) / 2)) - 0.07);
const inBite = (p: THREE.Vector3): boolean => {
  const dx = p.x - BITE.x;
  const dy = p.y - BITE.y;
  return p.z > 0 && Math.hypot(dx, dy) < biteRadius(Math.atan2(dy, dx));
};

/** Drop the triangles whose centre lies in the bite. */
function bitten(g: THREE.BufferGeometry, hullSpace: (p: THREE.Vector3) => THREE.Vector3 = (p) => p): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = g.attributes.color as THREE.BufferAttribute;
  const keep: number[][] = [[], [], []];
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, i + k));
    if (inBite(hullSpace(c.divideScalar(3)))) continue;
    for (let k = 0; k < 3; k++) {
      keep[0].push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      keep[1].push(nrm.getX(i + k), nrm.getY(i + k), nrm.getZ(i + k));
      keep[2].push(col.getX(i + k), col.getY(i + k), col.getZ(i + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(keep[0], 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(keep[1], 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(keep[2], 3));
  return out;
}


/** The sail lying on the sand: a triangle of stripes from `head` to the foot (`footA`, `footB`), softly folded and torn along the foot. */
function fallenSail(m: Model, head: THREE.Vector3, footA: THREE.Vector3, footB: THREE.Vector3, seed: number): void {
  const rand = mulberry32(seed);
  const stripes = 6;
  const rows = 8;
  const at = (u: number, v: number) => {
    const p = footA.clone().lerp(footB, u).lerp(head, v);
    // Reason: long soft folds running from the head, with a sharper ridge here and there
    p.y += 0.05 + 0.13 * Math.abs(Math.sin(u * 13 + v * 2.2)) * (1 - v * 0.6) + 0.05 * Math.sin(v * 9 + u * 4);
    return p;
  };
  for (let k = 0; k < stripes; k++) {
    const u0 = k / stripes;
    const u1 = (k + 1) / stripes;
    const v: number[] = [];
    for (let r = 0; r < rows; r++) {
      // Reason: the bottom row of each stripe is uneven or missing, so the foot of the sail looks ripped
      if (r === 0 && rand() < 0.4) continue;
      const lo = r === 0 ? 0.04 + rand() * 0.1 : r / rows;
      const hi = (r + 1) / rows;
      const [a, b, c, d] = [at(u0, lo), at(u1, lo), at(u0, hi), at(u1, hi)];
      v.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
    m.cloth.push(withSway(triangles(v, NORTH_DOCK_BOAT.sail[k % 2]), (p) => (p.y > 0.2 ? 0.012 : 0.004)));
  }
}

/**
 * Tadeo's own boat, broken on the sand: the same hull, colours and name as the
 * boat he sailed, keeled over with a big shark's bite in its side, the mast
 * snapped and the striped sail lying in front of it. Faces the viewer with its
 * +z side, bow along +x, y = 0 is the sand.
 */
export function wreckedBoat(atlas: SignAtlas): Model {
  const m = emptyModel();
  const hull = emptyModel();
  const rand = mulberry32(61);
  const colors = NORTH_DOCK_BOAT;
  const hullColor = new THREE.Color(colors.hull);
  const stripe = new THREE.Color(colors.stripe);
  const bottom = new THREE.Color("#b5402e");
  // Finer than the sailing boat's hull: the scalloped edge of the bite is cut from these triangles
  hull.solid.push(bitten(part(hullSurface(1, 64, 22), (p) => (p.y < 0.02 ? bottom : p.y > RIM + sheer(p.x / HALF_LEN) - 0.2 ? stripe : hullColor))));
  const inner = hullSurface(1, 64, 22);
  inner.scale(0.94, 0.94, 0.9);
  inner.translate(0, RIM * 0.06, 0);
  const toHull = (p: THREE.Vector3) => new THREE.Vector3(p.x / 0.94, (p.y - RIM * 0.06) / 0.94, p.z / 0.9);
  hull.solid.push(flip(bitten(part(inner, "#d9a56b"), toHull)));

  // Gunwale rail, broken where the bite went through
  const biteEnds = [BITE.x + BITE.r * 0.82, BITE.x - BITE.r * 0.82].map((x) => Math.acos(x / HALF_LEN));
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i <= 44; i++) {
    const span = Math.PI * 2 - (biteEnds[1] - biteEnds[0]);
    rim.push(rimPoint(biteEnds[1] + (i / 44) * span));
  }
  hull.solid.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 80, 0.08, 5, false), PAL.woodDark));

  // Floorboards and thwarts, one of them snapped; ribs show through the bite
  hull.solid.push(rbox(3.4, 0.08, 1.2, "#c99460", { pos: [-0.2, 0.0, 0] }, 0.03));
  hull.solid.push(rbox(0.36, 0.08, 1.5, PAL.woodLight, { pos: [0.4, 0.32, 0] }, 0.03));
  hull.solid.push(rbox(0.36, 0.08, 0.9, PAL.woodLight, { pos: [-1.2, 0.32, -0.35], rot: [0.1, 0, 0.08] }, 0.03));
  for (const t of [-0.56, -0.38, -0.2, -0.02]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) pts.push(hullPoint(t, Math.min(i / 8, 0.999), 1).multiply(new THREE.Vector3(1, 0.97, 0.9)));
    hull.solid.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.05, 4, false), "#8a5f3a"));
  }

  // Splintered planks all around the bite, some pointing into the hole and some bent outwards
  for (let i = 0; i < 26; i++) {
    const a = 0.02 + (i / 25) * (Math.PI - 0.04) + Math.PI;
    const r = biteRadius(a) * 1.0;
    const x = BITE.x + Math.cos(a) * r;
    const y = BITE.y + Math.sin(a) * r;
    const t = THREE.MathUtils.clamp(x / HALF_LEN, -0.97, 0.97);
    const q = Math.sqrt(1 - t * t);
    const s = THREE.MathUtils.clamp((RIM + sheer(t) - y) / (q * (DEPTH + sheer(t))), 0.02, 0.98);
    const base = hullPoint(t, s, 1);
    const inward = new THREE.Vector3(BITE.x - base.x, BITE.y - base.y, 0).normalize();
    const out = new THREE.Vector3(0, 0, i % 3 === 0 ? 0.7 : -0.1);
    const color = i % 4 === 0 ? "#f0d9b0" : i % 4 === 1 ? colors.hull : i % 4 === 2 ? "#d9a56b" : colors.stripe;
    hull.solid.push(spike(base, inward.add(out), 0.22 + rand() * 0.34, 0.05 + rand() * 0.035, color));
  }

  // Snapped mast: a stump with a splintered top, its stay hanging loose
  const mx = 0.55;
  const stumpTop = 1.75;
  hull.solid.push(cyl(0.07, 0.085, stumpTop, PAL.woodDark, { pos: [mx, stumpTop / 2, 0] }, 7));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const base = new THREE.Vector3(mx + Math.cos(a) * 0.04, stumpTop - 0.03, Math.sin(a) * 0.04);
    hull.solid.push(spike(base, new THREE.Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3), 0.14 + rand() * 0.2, 0.03, i % 2 ? "#f0d9b0" : PAL.wood));
  }
  hull.solid.push(rope([mx, stumpTop - 0.1, 0], [HALF_LEN - 0.05, RIM + sheer(1), 0], 0.5, 0.015, PAL.rope, 8));
  hull.text.push(bowName(atlas, "TADEO", 1));

  // Reason: keeled over away from the viewer, bow up the beach, so the name and the bite face the camera; the keel digs into the sand
  const tilt = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0.72, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0.1)),
    new THREE.Vector3(1, 1, 1),
  );
  addModel(m, hull, tilt);

  // The top of the mast lies in front of the boat with the sail still on it, pennant at its tip
  const tip = new THREE.Vector3(-2.4, 0.12, 3.5);
  const foot = new THREE.Vector3(1.5, 0.12, 2.7);
  m.solid.push(pole(foot.toArray() as V3, tip.toArray() as V3, 0.07, PAL.woodDark));
  m.solid.push(cyl(0.05, 0.05, 0.12, PAL.gold, { pos: [tip.x, tip.y + 0.06, tip.z], rot: [0, 0, Math.PI / 2] }, 6));
  fallenSail(m, tip.clone(), foot.clone(), new THREE.Vector3(0.2, 0.08, 1.15), 62);
  const pennant = [tip.x, tip.y + 0.03, tip.z, tip.x + 0.2, tip.y + 0.03, tip.z + 0.3, tip.x - 0.75, tip.y + 0.08, tip.z + 0.42];
  m.cloth.push(withSway(triangles(pennant, colors.pennant), (p) => (p.x < tip.x - 0.3 ? 0.03 : 0.004)));

  // What fell overboard: planks, the little crate, the coil of rope, and the lantern-less boom
  for (const [x, z, ry, len] of [[2.5, 1.9, 0.5, 1.5], [-3.2, 1.6, 2.2, 1.2], [3.0, 3.0, 1.2, 1.0], [-1.0, 4.5, 0.2, 1.3]] as const) {
    m.solid.push(box(len, 0.07, 0.26, tint("#c99460", rand), { pos: [x, 0.05, z], rot: [0, ry, (rand() - 0.5) * 0.14] }));
    m.solid.push(box(len * 0.97, 0.03, 0.05, colors.hull, { pos: [x, 0.09, z], rot: [0, ry, 0] }));
  }
  m.solid.push(rbox(0.45, 0.4, 0.45, tint(PAL.woodLight, rand), { pos: [2.3, 0.12, 3.6], rot: [0.35, 0.8, 0.2] }, 0.04));
  m.solid.push(part(new THREE.TorusGeometry(0.2, 0.06, 5, 10), PAL.rope, { pos: [1.2, 0.08, 4.2], rot: [Math.PI / 2, 0, 0] }));
  m.solid.push(part(new THREE.TorusGeometry(0.14, 0.05, 5, 10), PAL.rope, { pos: [1.22, 0.15, 4.2], rot: [Math.PI / 2, 0, 0.4] }));
  return m;
}
