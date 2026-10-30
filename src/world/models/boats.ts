/**
 * Boats: Tadeo's little sailboat (rounded hull, striped sail, pennant, name on
 * the bow) and the half-buried shipwreck on the treasure island. Boat models
 * point their bow along +x with the waterline at y = 0.
 */

import * as THREE from "three";
import { part } from "../../core/geo";
import { mulberry32, smoothstep } from "../../core/noise";
import { Model, PAL, emptyModel, tint, withSway, rbox, box, cyl, ball, beam, pole, rope, triangles, flip, V3 } from "./shapes";
import { SignAtlas } from "./signs";

export const HALF_LEN = 2.5;
export const HALF_BEAM = 1.0;
export const DEPTH = 0.95;
export const RIM = 0.5;

/** How much the hull narrows towards the bow at normalised length t = x / HALF_LEN. */
const pinch = (t: number): number => (t > 0 ? 1 - 0.82 * smoothstep(0.25, 1, t) : 1 - 0.25 * smoothstep(0.5, 1, -t));
/** Upward sweep of the gunwale towards bow and stern. */
export const sheer = (t: number): number => (t > 0 ? 0.42 * t * t : 0.18 * t * t);

/** Hull surface (lower half of a squashed sphere, pinched into a bow). */
export function hullSurface(xMax = 1, around = 22, down = 9): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, around, down, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(pos.getX(i), xMax);
    const y = pos.getY(i);
    const rimW = 1 + y; // 1 at the gunwale, 0 at the keel
    pos.setXYZ(i, t * HALF_LEN, y * DEPTH + RIM + sheer(t) * rimW, pos.getZ(i) * HALF_BEAM * pinch(t));
  }
  g.computeVertexNormals();
  return g;
}

/** A point on the gunwale at angle a (0 = bow). */
export function rimPoint(a: number): THREE.Vector3 {
  const t = Math.cos(a);
  return new THREE.Vector3(t * HALF_LEN, RIM + sheer(t), Math.sin(a) * HALF_BEAM * pinch(t));
}

export interface BoatColors {
  hull: THREE.ColorRepresentation;
  stripe: THREE.ColorRepresentation;
  sail: [THREE.ColorRepresentation, THREE.ColorRepresentation];
  pennant: THREE.ColorRepresentation;
  /** Mended: wooden boards nailed over the holes in the hull, cloth patches on the sail. */
  patched?: boolean;
}

/** Tadeo's boat: the one the shark breaks, and the one Paco mends and moors at the north dock. */
export const NORTH_DOCK_BOAT: BoatColors = { hull: "#d24a35", stripe: "#fff4e0", sail: ["#2f9a8f", "#fff4e0"], pennant: "#3f7fbf" };

/** Name painted on one side of the bow (side = +1 / -1), following the hull's curve. */
export function bowName(atlas: SignAtlas, name: string, side: number): THREE.BufferGeometry {
  const a = side > 0 ? Math.acos(0.5) : -Math.acos(0.5);
  const p = rimPoint(a);
  const q = rimPoint(a + side * 0.05);
  const tangent = q.sub(p);
  const g = atlas.quad(name, 1.3, 0.32, "#ffffff");
  g.rotateY(side > 0 ? Math.atan2(-tangent.z, tangent.x) + Math.PI : Math.atan2(-tangent.z, tangent.x));
  g.translate(p.x - 0.05, p.y - 0.36, p.z + side * 0.02);
  return g;
}

/** A board lying on the hull, from t0 to t1 along the length at depth s (see `hullPoint`), with a nail at each end. */
function hullBoard(m: Model, t0: number, t1: number, s: number, width: number, side: number, color: THREE.ColorRepresentation): void {
  const rows = 6;
  const v: number[] = [];
  const at = (t: number, sv: number) => {
    const p = hullPoint(t, sv, side);
    // Reason: push the board off the hull along the outward normal of its cross-section, so it never z-fights
    const c = Math.sqrt(Math.max(0, 1 - sv * sv));
    return [p.x, p.y - sv * 0.035, p.z + side * c * 0.035];
  };
  for (let i = 0; i < rows; i++) {
    const a = t0 + ((t1 - t0) * i) / rows;
    const b = t0 + ((t1 - t0) * (i + 1)) / rows;
    const [p, q, r, u] = [at(a, s), at(b, s), at(a, s + width), at(b, s + width)];
    v.push(...p, ...q, ...r, ...r, ...q, ...u);
  }
  const g = triangles(v, color);
  // Reason: the winding follows the board's direction, so turn it to face away from the hull
  m.solid.push((g.attributes.normal as THREE.BufferAttribute).getZ(0) * side < 0 ? flip(g) : g);
  for (const t of [t0 + 0.02, t1 - 0.02]) {
    const nail = at(t, s + width / 2);
    m.solid.push(ball(0.028, PAL.iron, nail as V3, 0));
  }
}

/** Mended holes: raw wooden boards on the hull's quarters and amidships, where they show from behind and the side. */
function hullPatches(m: Model, rand: () => number): void {
  const boards: [number, number, number, number, number][] = [
    // side, t0, t1, s, width
    [1, -0.86, -0.46, 0.16, 0.13], [1, -0.82, -0.42, 0.31, 0.13], [1, -0.87, -0.5, 0.46, 0.13],
    [-1, -0.84, -0.5, 0.26, 0.13], [-1, -0.88, -0.46, 0.41, 0.13], [-1, -0.8, -0.52, 0.56, 0.13],
    [1, -0.1, 0.22, 0.34, 0.12], [1, -0.06, 0.26, 0.48, 0.12],
    [-1, 0.0, 0.32, 0.3, 0.12], [-1, -0.04, 0.28, 0.44, 0.12],
  ];
  for (const [side, t0, t1, s, w] of boards) hullBoard(m, t0, t1, s, w, side, tint("#e0b57e", rand, 0.14));
}

/** Small sailboat with an optional name painted on both sides of the bow. */
export function sailboat(atlas: SignAtlas, colors: BoatColors, name: string | null, seed: number): Model {
  const rand = mulberry32(seed + 51);
  const m = emptyModel();
  const hullColor = new THREE.Color(colors.hull);
  const stripe = new THREE.Color(colors.stripe);
  const bottom = new THREE.Color("#b5402e");
  m.solid.push(part(hullSurface(), (p) => (p.y < 0.02 ? bottom : p.y > RIM + sheer(p.x / HALF_LEN) - 0.2 ? stripe : hullColor)));
  const inner = hullSurface();
  inner.scale(0.94, 0.94, 0.9);
  inner.translate(0, RIM * 0.06, 0);
  m.solid.push(flip(part(inner, "#d9a56b")));
  // Gunwale rail and floorboards
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i < 40; i++) rim.push(rimPoint((i / 40) * Math.PI * 2));
  m.solid.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 60, 0.08, 5, true), PAL.woodDark));
  m.solid.push(rbox(3.4, 0.08, 1.2, "#c99460", { pos: [-0.2, 0.0, 0] }, 0.03));
  // Foredeck: a fan of triangles from the bow rim back to x = 1
  const a0 = Math.acos(0.4);
  const c = new THREE.Vector3(1.6, RIM + sheer(0.64) - 0.02, 0);
  const deck: number[] = [];
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const p = rimPoint(-a0 + (i / steps) * 2 * a0);
    const q = rimPoint(-a0 + ((i + 1) / steps) * 2 * a0);
    deck.push(c.x, c.y, c.z, q.x, q.y - 0.02, q.z, p.x, p.y - 0.02, p.z);
  }
  const pa = rimPoint(a0);
  const pb = rimPoint(-a0);
  deck.push(c.x, c.y, c.z, pb.x, pb.y - 0.02, pb.z, pa.x, pa.y - 0.02, pa.z);
  const deckGeo = triangles(deck, colors.stripe);
  m.solid.push((deckGeo.attributes.normal as THREE.BufferAttribute).getY(0) < 0 ? flip(deckGeo) : deckGeo);
  m.solid.push(box(0.1, 0.12, 2 * Math.sin(a0) * HALF_BEAM * pinch(0.4), PAL.woodDark, { pos: [1.0, RIM + sheer(0.4), 0] }));
  for (const x of [-1.2, 0.4]) m.solid.push(rbox(0.36, 0.08, 1.75 * pinch(x / HALF_LEN), PAL.woodLight, { pos: [x, 0.32, 0] }, 0.03));
  // Mast, boom, stays
  const mx = 0.55;
  const top = 4.6;
  m.solid.push(cyl(0.06, 0.085, top, PAL.woodDark, { pos: [mx, top / 2, 0] }, 7));
  m.solid.push(pole([mx, 1.05, 0], [-1.95, 1.05, 0], 0.05, PAL.wood));
  m.solid.push(rope([mx, top - 0.05, 0], [HALF_LEN - 0.05, RIM + sheer(1), 0], 0.02, 0.015, PAL.rope, 6));
  m.solid.push(rope([mx, top - 0.05, 0], [-HALF_LEN + 0.1, RIM + sheer(-1) + 0.05, 0], 0.04, 0.015, PAL.rope, 6));
  for (const sz of [-1, 1]) m.solid.push(rope([mx, top * 0.75, 0], [mx - 0.1, RIM + 0.05, sz * HALF_BEAM * 0.95], 0, 0.012, PAL.rope, 2));
  // Striped mainsail: stripes radiate from the head; billows to one side
  const foot0 = new THREE.Vector3(mx - 0.08, 1.12, 0);
  const foot1 = new THREE.Vector3(-1.9, 1.12, 0);
  const head = new THREE.Vector3(mx - 0.08, top - 0.25, 0);
  const sailAt = (u: number, v: number) => {
    const p = foot0.clone().lerp(foot1, u * (1 - v)).add(head.clone().sub(foot0).multiplyScalar(v));
    p.z += Math.sin(Math.PI * u) * Math.sqrt(Math.max(0, 1 - v)) * 0.38;
    return p;
  };
  const stripes = 6;
  const rows = 6;
  for (let k = 0; k < stripes; k++) {
    const v: number[] = [];
    const u0 = k / stripes;
    const u1 = (k + 1) / stripes;
    for (let r = 0; r < rows; r++) {
      const a = sailAt(u0, r / rows), b = sailAt(u1, r / rows), c = sailAt(u0, (r + 1) / rows), d = sailAt(u1, (r + 1) / rows);
      v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z);
    }
    m.cloth.push(withSway(triangles(v, colors.sail[k % 2]), (p) => Math.max(0, mx - p.x) * 0.025));
  }
  // Jib
  const jib = [mx + 0.05, top * 0.82, 0, HALF_LEN - 0.15, RIM + sheer(1) + 0.15, 0, mx + 0.12, 1.25, 0.05];
  m.cloth.push(withSway(triangles(jib, colors.sail[1]), (p) => Math.max(0, p.x - mx) * 0.02));
  // Pennant at the masthead
  const pv = [mx, top + 0.02, 0, mx, top - 0.3, 0, mx - 1.0, top - 0.12, 0];
  m.cloth.push(withSway(triangles(pv, colors.pennant), (p) => Math.max(0, mx - p.x) * 0.12));
  m.solid.push(cyl(0.05, 0.05, 0.12, PAL.gold, { pos: [mx, top + 0.06, 0] }, 6));
  // A coil of rope, a little crate and a lantern on board
  m.solid.push(part(new THREE.TorusGeometry(0.2, 0.06, 5, 10), PAL.rope, { pos: [-1.6, 0.1, 0.25], rot: [Math.PI / 2, 0, 0] }));
  m.solid.push(rbox(0.45, 0.4, 0.45, tint(PAL.woodLight, rand), { pos: [-0.5, 0.24, -0.35], rot: [0, 0.3, 0] }, 0.04));
  // Name on both sides of the bow, following the hull's curve
  if (name) for (const side of [-1, 1]) m.text.push(bowName(atlas, name, side));
  if (colors.patched) {
    hullPatches(m, rand);
    // Cloth patches sewn on both faces of the sail, in the pennant's colour and a warm yellow
    for (const [u0, u1, v0, v1, color] of [[0.42, 0.78, 0.12, 0.4, colors.pennant], [0.12, 0.42, 0.42, 0.68, "#f2c14e"]] as const) {
      for (const dz of [-0.025, 0.025]) {
        const [a, b, c, d] = [sailAt(u0, v0), sailAt(u1, v0), sailAt(u0, v1), sailAt(u1, v1)];
        const patch = triangles([a.x, a.y, a.z + dz, b.x, b.y, b.z + dz, c.x, c.y, c.z + dz, c.x, c.y, c.z + dz, b.x, b.y, b.z + dz, d.x, d.y, d.z + dz], color);
        m.cloth.push(withSway(patch, (p) => Math.max(0, mx - p.x) * 0.025));
      }
    }
  }
  return m;
}

/**
 * Point on the hull surface: t in [-1, 1] along the length (bow = +1), s in
 * [0, 1] from gunwale to keel, side = +1 / -1. Matches `hullSurface`.
 */
export function hullPoint(t: number, s: number, side: number): THREE.Vector3 {
  const q = Math.sqrt(Math.max(0, 1 - t * t));
  const y = -s * q;
  return new THREE.Vector3(t * HALF_LEN, y * DEPTH + RIM + sheer(t) * (1 + y), side * q * Math.sqrt(1 - s * s) * HALF_BEAM * pinch(t));
}

/** Old wreck keeled over on its side and half sunk into the sand: planks with gaps showing the ribs. */
export function shipwreck(seed: number): Model {
  const rand = mulberry32(seed + 53);
  const m = emptyModel();
  const wood = ["#6a5240", "#5a4535", "#735a45"];
  const parts: THREE.BufferGeometry[] = [];
  // Strakes (hull planks); some are missing on the upturned side so the ribs show through
  const strakes = [0.06, 0.22, 0.38, 0.54, 0.7, 0.86];
  for (const side of [-1, 1]) {
    strakes.forEach((sv, k) => {
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const t0 = -0.96 + (i / steps) * 1.92;
        const t1 = -0.96 + ((i + 1) / steps) * 1.92;
        const missing = side > 0 && ((k % 2 === 0 && k > 0 && t0 > -0.45 && t1 < 0.5) || (t0 > 0.45 && sv < 0.6));
        if (missing) continue;
        parts.push(beam(hullPoint(t0, sv, side).toArray() as V3, hullPoint(t1, sv, side).toArray() as V3, 0.26, wood[(k + i) % 3], 0.1));
      }
    });
  }
  // Ribs: U-shaped frames across the hull, poking a little above the gunwale
  for (const t of [-0.72, -0.46, -0.2, 0.06, 0.32, 0.58]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const side = u < 0.5 ? 1 : -1;
      const sv = u < 0.5 ? u * 2 : (1 - u) * 2;
      pts.push(hullPoint(t, Math.min(sv, 0.999), side).multiplyScalar(0.97));
    }
    pts[0].y += 0.3;
    pts[12].y += 0.3;
    parts.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07, 4, false), "#4d3b2e"));
  }
  parts.push(beam(hullPoint(-0.98, 0.999, 1).toArray() as V3, hullPoint(0.98, 0.999, 1).toArray() as V3, 0.18, "#4d3b2e"));
  // Broken mast with a tattered black flag
  parts.push(pole([0.3, 0.2, 0], [0.5, 3.2, 0.2], 0.11, "#5a4535"));
  parts.push(pole([0.5, 3.2, 0.2], [0.75, 3.55, 0.05], 0.07, "#5a4535"));
  parts.push(pole([0.2, 2.6, 0.15], [-0.9, 2.5, 0.25], 0.05, "#5a4535"));
  // Reason: lay the hull on its side (upturned +z side faces the sky) and sink it into the sand
  const tilt = new THREE.Matrix4().makeTranslation(0, -0.55, 0).multiply(new THREE.Matrix4().makeRotationX(-1.0));
  for (const g of parts) {
    g.applyMatrix4(tilt);
    m.solid.push(g);
  }
  const f = new THREE.Vector3(0.45, 3.0, 0.2).applyMatrix4(tilt);
  const flag = triangles([f.x, f.y, f.z, f.x, f.y - 0.6, f.z + 0.35, f.x - 1.2, f.y - 0.25, f.z + 0.2], "#22201f");
  m.cloth.push(withSway(flag, (p) => Math.max(0, f.x - p.x) * 0.1));
  // Scattered planks
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.6 + rand() * 1.5;
    m.solid.push(box(1.2 + rand(), 0.07, 0.24, tint("#6a5240", rand), { pos: [Math.cos(a) * r, 0.03, Math.sin(a) * r], rot: [0, rand() * 3, (rand() - 0.5) * 0.2] }));
  }
  return m;
}
