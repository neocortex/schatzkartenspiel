/**
 * Shared building blocks for the hand-made landmark models: the `Model`
 * container (painted parts grouped by material plus anchor points), a colour
 * palette, and small primitive helpers (rounded boxes, beams between two
 * points, sagging ropes, rocks, wind-sway weights).
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { part, displace, facet, ColorFn, Xform } from "../../core/geo";

export type V3 = [number, number, number];

/**
 * A model is a bag of painted, non-indexed geometries sorted by the material
 * they will be drawn with, plus named anchor points (flame tips, chimney tops).
 * All parts of one landmark are merged into one mesh per material.
 */
export interface Model {
  /** Lit, opaque, vertex-coloured parts. */
  solid: THREE.BufferGeometry[];
  /** Steady emissive parts (window panes, lantern glass). */
  glow: THREE.BufferGeometry[];
  /** Softly pulsing emissive parts (runes, crystals, magic lanterns). */
  pulse: THREE.BufferGeometry[];
  /** Wind-swayed cloth (flags, bunting, sails); each has an `aSway` attribute. */
  cloth: THREE.BufferGeometry[];
  /** Unlit dark parts (cave interiors). */
  dark: THREE.BufferGeometry[];
  /** Sign lettering quads with UVs into the sign atlas. */
  text: THREE.BufferGeometry[];
  flames: THREE.Vector3[];
  chimneys: THREE.Vector3[];
}

export function emptyModel(): Model {
  return { solid: [], glow: [], pulse: [], cloth: [], dark: [], text: [], flames: [], chimneys: [] };
}

const GEO_KEYS = ["solid", "glow", "pulse", "cloth", "dark", "text"] as const;

/** Transform every part and anchor of `m` by `matrix` (in place) and append them to `into`. */
export function addModel(into: Model, m: Model, matrix: THREE.Matrix4 = new THREE.Matrix4()): Model {
  for (const k of GEO_KEYS) {
    for (const g of m[k]) {
      g.applyMatrix4(matrix);
      into[k].push(g);
    }
  }
  for (const p of m.flames) into.flames.push(p.applyMatrix4(matrix));
  for (const p of m.chimneys) into.chimneys.push(p.applyMatrix4(matrix));
  return into;
}

/** Placement matrix: translate to (x, y, z), rotate about Y, uniform scale. */
export function placeAt(x: number, y: number, z: number, rotY = 0, scale = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(scale, scale, scale),
  );
}

/** Rotation about Y that turns a model's +z (front) towards direction (dx, dz). */
export function faceDir(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Rotation about Y that turns a model's +x towards direction (dx, dz). */
export function pointDir(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

export const PAL = {
  wood: "#a8703f",
  woodLight: "#cf9a5f",
  woodDark: "#6e4528",
  timber: "#5b3a25",
  plank: "#b98552",
  plaster: "#f4e5c6",
  stone: "#a39b90",
  stoneLight: "#c2b9ab",
  stoneDark: "#6f6862",
  moss: "#6a9a3c",
  rope: "#dcc28c",
  iron: "#3c3d44",
  gold: "#f4c54a",
  sand: "#e9cf98",
  red: "#d23b2c",
  white: "#f7f3ea",
};

/** Slightly vary a colour (per part), for plank-to-plank variety. */
export function tint(color: THREE.ColorRepresentation, rand: () => number, amount = 0.12): THREE.Color {
  const c = new THREE.Color(color);
  return c.multiplyScalar(1 - amount + rand() * amount * 2);
}

/** Box with softly rounded edges (toy look). */
export function rbox(
  w: number,
  h: number,
  d: number,
  color: THREE.ColorRepresentation | ColorFn,
  x: Xform = {},
  radius = 0.06,
  segments = 1,
): THREE.BufferGeometry {
  const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
  return part(new RoundedBoxGeometry(w, h, d, segments, r), color, x);
}

/** Plain box part. */
export function box(w: number, h: number, d: number, color: THREE.ColorRepresentation | ColorFn, x: Xform = {}): THREE.BufferGeometry {
  return part(new THREE.BoxGeometry(w, h, d), color, x);
}

/** Cylinder part (axis = Y, centred). */
export function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  color: THREE.ColorRepresentation | ColorFn,
  x: Xform = {},
  seg = 8,
): THREE.BufferGeometry {
  return part(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, x);
}

/** Small sphere/icosphere part. */
export function ball(r: number, color: THREE.ColorRepresentation | ColorFn, pos: V3, detail = 1, scale: V3 = [1, 1, 1]): THREE.BufferGeometry {
  return part(new THREE.IcosahedronGeometry(r, detail), color, { pos, scale });
}

const UP = new THREE.Vector3(0, 1, 0);

/** Orient a Y-axis geometry so it spans from a to b. */
function spanBetween(g: THREE.BufferGeometry, a: V3, b: V3): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  g.scale(1, len, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Square-section beam from a to b (timber framing, railings, braces). */
export function beam(a: V3, b: V3, thick: number, color: THREE.ColorRepresentation | ColorFn, depth = thick): THREE.BufferGeometry {
  return part(spanBetween(new THREE.BoxGeometry(thick, 1, depth), a, b), color);
}

/** Round pole from a to b. */
export function pole(a: V3, b: V3, r: number, color: THREE.ColorRepresentation | ColorFn, seg = 7, rEnd = r): THREE.BufferGeometry {
  return part(spanBetween(new THREE.CylinderGeometry(rEnd, r, 1, seg), a, b), color);
}

/** Points along a sagging rope between a and b (parabolic catenary approximation). */
export function sagPoints(a: V3, b: V3, sag: number, segs: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(
      new THREE.Vector3(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
        a[2] + (b[2] - a[2]) * t,
      ),
    );
  }
  return pts;
}

/** Thin tube hanging between a and b. */
export function rope(a: V3, b: V3, sag: number, r: number, color: THREE.ColorRepresentation = PAL.rope, segs = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(sagPoints(a, b, sag, segs));
  return part(new THREE.TubeGeometry(curve, segs, r, 4, false), color);
}

/** Lumpy faceted rock blob centred at the origin. */
export function rockBlob(seed: number, size: V3, color: THREE.ColorRepresentation | ColorFn, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.scale(...size);
  displace(g, Math.min(...size) * 0.22, 1.3 / Math.max(...size), seed * 7.7);
  facet(g);
  return part(g, color);
}

/** Stone colour with darker undersides and optional moss on top. */
export function stoneFn(base: THREE.ColorRepresentation, mossy = 0, rand: () => number = Math.random): ColorFn {
  const b = new THREE.Color(base);
  const moss = new THREE.Color(PAL.moss);
  const out = new THREE.Color();
  return (_p, n) => {
    out.copy(b).multiplyScalar(0.9 + rand() * 0.18);
    if (n.y < -0.3) out.multiplyScalar(0.65);
    if (mossy && n.y > 0.65) out.lerp(moss, mossy);
    return out;
  };
}

/** Sharp point from `base` along `dir` (a splinter, a thorn). In a colour function, p.y runs from 0 at the base to `length` at the tip. */
export function spike(base: THREE.Vector3, dir: THREE.Vector3, length: number, width: number, color: THREE.ColorRepresentation | ColorFn, sides = 4): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(width, length, sides);
  cone.translate(0, length / 2, 0);
  const painted = part(cone, color);
  painted.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  painted.translate(base.x, base.y, base.z);
  return painted;
}

/** Attach a per-vertex wind weight (`aSway`) used by the cloth shader. */
export function withSway(g: THREE.BufferGeometry, weight: (p: THREE.Vector3) => number): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const w = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) w[i] = weight(p.fromBufferAttribute(pos, i));
  g.setAttribute("aSway", new THREE.BufferAttribute(w, 1));
  return g;
}

/** Build a painted triangle-soup geometry from flat vertex positions (normals computed). */
export function triangles(vertices: number[], color: THREE.ColorRepresentation | ColorFn): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/** Reverse triangle winding and normals (to see a surface from inside). */
export function flip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = g.attributes.color as THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i += 3) {
    for (const attr of [pos, nrm, col]) {
      if (!attr) continue;
      for (let c = 0; c < attr.itemSize; c++) {
        const a = attr.getComponent(i + 1, c);
        attr.setComponent(i + 1, c, attr.getComponent(i + 2, c));
        attr.setComponent(i + 2, c, a);
      }
    }
  }
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return g;
}
