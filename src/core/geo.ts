/**
 * Geometry toolkit for building stylised models from primitives. Every part is
 * converted to non-indexed geometry with position/normal/color attributes so
 * parts can be merged into a single draw call with per-vertex colours.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Noise2D } from "./noise";

export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

export interface Xform {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: number | [number, number, number];
}

const tmpP = new THREE.Vector3();
const tmpN = new THREE.Vector3();

/** Apply a transform, strip to position/normal, and paint a colour (or colour function). */
export function part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, x: Xform = {}): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(x.pos ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(x.rot ?? [0, 0, 0]))),
    typeof x.scale === "number"
      ? new THREE.Vector3(x.scale, x.scale, x.scale)
      : new THREE.Vector3(...(x.scale ?? [1, 1, 1])),
  );
  g.applyMatrix4(m);
  g = paint(g, color);
  return g;
}

/** Add/overwrite a vertex colour attribute. */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const fixed = typeof color === "function" ? null : new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    const c = fixed ?? (color as ColorFn)(tmpP.fromBufferAttribute(pos, i), tmpN.fromBufferAttribute(nrm, i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Merge painted parts into one geometry. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error("mergeGeometries failed — parts have mismatched attributes");
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const displaceNoise = new Noise2D(9001);

/**
 * Push vertices along their normals by position-based noise. Because the noise
 * depends only on the vertex position, duplicated vertices move together and no
 * cracks open between faces.
 */
export function displace(g: THREE.BufferGeometry, amp: number, freq: number, seed = 0): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    tmpP.fromBufferAttribute(pos, i);
    tmpN.fromBufferAttribute(nrm, i);
    const n =
      displaceNoise.noise(tmpP.x * freq + seed, tmpP.y * freq + tmpP.z * freq * 0.7) * 0.7 +
      displaceNoise.noise(tmpP.z * freq * 1.9 - seed, tmpP.x * freq * 1.9 + tmpP.y) * 0.3;
    tmpP.addScaledVector(tmpN, n * amp);
    pos.setXYZ(i, tmpP.x, tmpP.y, tmpP.z);
  }
  pos.needsUpdate = true;
  return g;
}

/** Blend normals towards "radial from centre" — makes clustered blobs shade like one soft mass. */
export function softNormals(g: THREE.BufferGeometry, center: THREE.Vector3, blend: number, squash = 1): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    tmpP.fromBufferAttribute(pos, i).sub(center);
    tmpP.y *= squash;
    tmpP.normalize();
    tmpN.fromBufferAttribute(nrm, i).lerp(tmpP, blend).normalize();
    nrm.setXYZ(i, tmpN.x, tmpN.y, tmpN.z);
  }
  nrm.needsUpdate = true;
  return g;
}

/** Recompute flat (faceted) normals on non-indexed geometry. */
export function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeVertexNormals();
  return g;
}

/** Vertical gradient colour function between two colours over [y0, y1], with optional noise. */
export function gradient(bottom: THREE.ColorRepresentation, top: THREE.ColorRepresentation, y0: number, y1: number, jitter = 0): ColorFn {
  const a = new THREE.Color(bottom);
  const b = new THREE.Color(top);
  const out = new THREE.Color();
  return (p) => {
    const t = THREE.MathUtils.clamp((p.y - y0) / (y1 - y0), 0, 1);
    out.copy(a).lerp(b, t);
    if (jitter) out.multiplyScalar(1 - jitter + displaceNoise.noise(p.x * 3.1, p.z * 3.1 + p.y) * jitter);
    return out;
  };
}
