/**
 * Tiny toy-like creature models built from primitives (one merged geometry
 * each, forward = +z, up = +y, roughly real-world sized in island units).
 * Every vertex carries an `aPart` id that the species' GLSL animation in
 * `critterAnims.ts` uses: wings, heads, legs, tails, ...
 */

import * as THREE from "three";
import { part, merge, ColorFn, Xform } from "../../core/geo";
import { tagPart } from "./CritterMesh";

type V3 = [number, number, number];

/** A painted primitive with zero UVs and an animation part id. */
function piece(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, partId: number, x: Xform = {}): THREE.BufferGeometry {
  const g = part(geo, color, x);
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return tagPart(g, partId);
}

/** Flat convex polygon (fan-triangulated) — wings, tails and fins. Pass `uvs` to texture it. */
function flat(points: V3[], color: THREE.ColorRepresentation, partId: number, uvs?: [number, number][]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    for (const k of [0, i, i + 1]) {
      pos.push(...points[k]);
      uv.push(...(uvs ? uvs[k] : [0, 0]));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Reason: wings are lit from above whatever their winding, so force normals to face up (or sideways for fins)
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) {
    if (nrm.getY(i) < 0 || (nrm.getY(i) === 0 && nrm.getX(i) < 0)) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  }
  const painted = part(g, color);
  painted.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return tagPart(painted, partId);
}

/** Polygon plus its mirror image across the x = 0 plane. */
function mirrored(points: V3[], color: THREE.ColorRepresentation, partId: number, uvs?: [number, number][]): THREE.BufferGeometry[] {
  const mirror = points.map(([x, y, z]) => [-x, y, z] as V3);
  return [flat(points, color, partId, uvs), flat(mirror, color, partId, uvs)];
}

const sphere = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const along = (rx = Math.PI / 2): V3 => [rx, 0, 0];

/** Butterfly: dark body + two textured wing quads (part 1). Wingspan ≈ 0.6. */
export function butterflyModel(): THREE.BufferGeometry {
  const body = "#2a1f1a";
  const span = 0.3;
  const wing: V3[] = [[0.008, 0, -0.17], [span, 0, -0.17], [span, 0, 0.2], [0.008, 0, 0.2]];
  const wingUv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  return merge([
    piece(new THREE.CylinderGeometry(0.016, 0.01, 0.2, 6), body, 0, { rot: along() }),
    piece(sphere(0.024, 8, 6), body, 0, { pos: [0, 0, 0.11] }),
    piece(new THREE.BoxGeometry(0.006, 0.006, 0.12), body, 0, { pos: [0.02, 0.035, 0.16], rot: [-0.6, 0.3, 0] }),
    piece(new THREE.BoxGeometry(0.006, 0.006, 0.12), body, 0, { pos: [-0.02, 0.035, 0.16], rot: [-0.6, -0.3, 0] }),
    ...mirrored(wing, "#ffffff", 1, wingUv),
  ]);
}

/** Seagull: white body, swept-back light grey wings (part 1, wrist joint at |x| = 0.42) with black tips. Wingspan ≈ 1.9. */
export function gullModel(): THREE.BufferGeometry {
  const white = "#f7f7f2";
  return merge([
    piece(sphere(0.12), white, 0, { scale: [1, 0.9, 2.9] }),
    piece(sphere(0.095), white, 0, { pos: [0, 0.06, 0.33] }),
    piece(new THREE.ConeGeometry(0.026, 0.13, 6), "#f2b21b", 0, { pos: [0, 0.04, 0.45], rot: along() }),
    piece(sphere(0.016, 6, 4), "#111111", 0, { pos: [0.055, 0.09, 0.38] }),
    piece(sphere(0.016, 6, 4), "#111111", 0, { pos: [-0.055, 0.09, 0.38] }),
    flat([[-0.07, 0.02, -0.3], [0.07, 0.02, -0.3], [0.1, 0.03, -0.5], [-0.1, 0.03, -0.5]], "#e4e8ec", 0),
    ...mirrored([[0.05, 0.04, 0.13], [0.42, 0.04, 0.16], [0.42, 0.04, -0.04], [0.05, 0.04, -0.15]], "#e6eaee", 1),
    ...mirrored([[0.42, 0.04, 0.16], [0.7, 0.04, 0.06], [0.7, 0.04, -0.1], [0.42, 0.04, -0.04]], "#cdd3d9", 1),
    ...mirrored([[0.7, 0.04, 0.06], [0.97, 0.04, -0.2], [0.7, 0.04, -0.1]], "#1e1f22", 1),
  ]);
}

/** Songbird: round grey body (tinted per instance), cream breast, single-hinge wings (part 1). */
export function songbirdModel(): THREE.BufferGeometry {
  const grey = "#e0e0e0";
  return merge([
    piece(sphere(0.1), grey, 0, { scale: [0.95, 0.95, 1.4] }),
    piece(sphere(0.085), "#fff0d2", 0, { pos: [0, -0.025, 0.05], scale: [0.9, 0.85, 1.1] }),
    piece(sphere(0.075), grey, 0, { pos: [0, 0.06, 0.13] }),
    piece(new THREE.ConeGeometry(0.02, 0.06, 6), "#ffb02e", 0, { pos: [0, 0.05, 0.215], rot: along() }),
    piece(sphere(0.012, 6, 4), "#111111", 0, { pos: [0.045, 0.08, 0.17] }),
    piece(sphere(0.012, 6, 4), "#111111", 0, { pos: [-0.045, 0.08, 0.17] }),
    flat([[-0.03, 0.01, -0.12], [0.03, 0.01, -0.12], [0.06, 0.02, -0.27], [-0.06, 0.02, -0.27]], "#8c8c8c", 0),
    ...mirrored([[0.05, 0.04, 0.07], [0.3, 0.05, 0.0], [0.27, 0.05, -0.09], [0.05, 0.04, -0.07]], "#b5b5b5", 1),
  ]);
}

/** Dragonfly: slim grey body (tinted per instance), big eyes, four glassy wings (part 1). */
export function dragonflyModel(): THREE.BufferGeometry {
  const grey = "#c4c4c4";
  const glass = "#b9d8e8";
  return merge([
    piece(new THREE.CylinderGeometry(0.02, 0.011, 0.36, 6), grey, 0, { pos: [0, 0, -0.11], rot: along(-Math.PI / 2) }),
    piece(sphere(0.034, 8, 6), grey, 0, { pos: [0, 0, 0.1], scale: [1, 1, 1.4] }),
    piece(sphere(0.022, 8, 6), "#163a46", 0, { pos: [0.02, 0.008, 0.16] }),
    piece(sphere(0.022, 8, 6), "#163a46", 0, { pos: [-0.02, 0.008, 0.16] }),
    ...mirrored([[0.02, 0.02, 0.135], [0.25, 0.02, 0.125], [0.26, 0.02, 0.095], [0.02, 0.02, 0.1]], glass, 1),
    ...mirrored([[0.02, 0.02, 0.075], [0.23, 0.02, 0.06], [0.24, 0.02, 0.025], [0.02, 0.02, 0.045]], glass, 1),
  ]);
}

/** Beach crab: flat red shell, googly eyes on stalks, two claws (part 3), legs in two alternating groups (parts 1, 2). */
export function crabModel(): THREE.BufferGeometry {
  const shell = "#e2552d";
  const leg = "#c8431f";
  const parts = [
    piece(sphere(0.16, 12, 8), shell, 0, { pos: [0, 0.11, 0], scale: [1.35, 0.55, 1.0] }),
    piece(sphere(0.07, 8, 6), "#e8673c", 3, { pos: [0.22, 0.1, 0.17], scale: [1.0, 0.7, 1.35] }),
    piece(sphere(0.07, 8, 6), "#e8673c", 3, { pos: [-0.22, 0.1, 0.17], scale: [1.0, 0.7, 1.35] }),
  ];
  for (const s of [1, -1]) {
    parts.push(
      piece(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5), shell, 0, { pos: [s * 0.06, 0.18, 0.1] }),
      piece(sphere(0.03, 8, 6), "#ffffff", 0, { pos: [s * 0.06, 0.24, 0.1] }),
      piece(sphere(0.016, 6, 4), "#111111", 0, { pos: [s * 0.06, 0.245, 0.125] }),
      piece(new THREE.BoxGeometry(0.1, 0.03, 0.03), leg, 3, { pos: [s * 0.16, 0.09, 0.12], rot: [0, -s * 0.6, 0] }),
    );
    [-0.08, 0, 0.08].forEach((z, k) => {
      const group = (k + (s > 0 ? 0 : 1)) % 2 === 0 ? 1 : 2;
      parts.push(piece(new THREE.BoxGeometry(0.2, 0.025, 0.025), leg, group, { pos: [s * 0.24, 0.06, z], rot: [0, 0, -s * 0.55] }));
    });
  }
  return merge(parts);
}

/** Hen: white body (tinted per instance), red comb, yellow beak; head and neck are part 1 (pecking). */
export function chickenModel(): THREE.BufferGeometry {
  const white = "#f5f3ee";
  const red = "#e8262b";
  const yellow = "#ffb21e";
  const parts = [
    piece(sphere(0.17, 12, 10), white, 0, { pos: [0, 0.27, -0.01], scale: [0.85, 0.8, 1.1] }),
    piece(new THREE.ConeGeometry(0.09, 0.2, 7), white, 0, { pos: [0, 0.38, -0.15], rot: [-0.7, 0, 0] }),
    piece(sphere(0.085), white, 1, { pos: [0, 0.46, 0.13] }),
    piece(sphere(0.06, 8, 6), white, 1, { pos: [0, 0.39, 0.1] }),
    piece(sphere(0.026, 6, 4), red, 1, { pos: [0, 0.39, 0.2] }),
    piece(new THREE.ConeGeometry(0.025, 0.07, 6), yellow, 1, { pos: [0, 0.45, 0.225], rot: along() }),
  ];
  for (const z of [0.08, 0.12, 0.16]) parts.push(piece(sphere(0.032, 6, 5), red, 1, { pos: [0, 0.55 - Math.abs(z - 0.12), z] }));
  for (const s of [1, -1]) {
    parts.push(
      piece(sphere(0.1, 8, 6), "#e8e4dc", 0, { pos: [s * 0.13, 0.28, -0.03], scale: [0.35, 0.7, 1.2] }),
      piece(sphere(0.014, 6, 4), "#111111", 1, { pos: [s * 0.06, 0.48, 0.17] }),
      piece(new THREE.CylinderGeometry(0.013, 0.013, 0.16, 5), yellow, 0, { pos: [s * 0.05, 0.08, 0] }),
      piece(new THREE.BoxGeometry(0.06, 0.012, 0.08), yellow, 0, { pos: [s * 0.05, 0.006, 0.02] }),
    );
  }
  return merge(parts);
}

/** Rabbit: grey-white body (tinted per instance), cream tail, ears are part 1 (twitching). */
export function rabbitModel(): THREE.BufferGeometry {
  const fur = "#ededed";
  const parts = [
    piece(sphere(0.16, 12, 10), fur, 0, { pos: [0, 0.16, -0.02], scale: [0.85, 0.82, 1.15] }),
    piece(sphere(0.1), fur, 0, { pos: [0, 0.29, 0.15] }),
    piece(sphere(0.05, 8, 6), "#fff3df", 0, { pos: [0, 0.2, -0.19] }),
    piece(sphere(0.017, 6, 4), "#ff8fa3", 0, { pos: [0, 0.3, 0.25] }),
  ];
  for (const s of [1, -1]) {
    parts.push(
      piece(sphere(0.1, 8, 6), fur, 1, { pos: [s * 0.04, 0.44, 0.12], scale: [0.3, 1.15, 0.14], rot: [0, 0, -s * 0.15] }),
      piece(sphere(0.018, 6, 4), "#111111", 0, { pos: [s * 0.06, 0.32, 0.21] }),
      piece(sphere(0.035, 6, 4), fur, 0, { pos: [s * 0.05, 0.03, 0.1], scale: [1, 0.6, 1.5] }),
      piece(sphere(0.05, 6, 4), fur, 0, { pos: [s * 0.08, 0.03, -0.06], scale: [1, 0.6, 1.9] }),
    );
  }
  return merge(parts);
}

/** Lake fish: grey body (tinted per instance) with a vertical tail fin; the tail end sways. */
export function fishModel(): THREE.BufferGeometry {
  const grey = "#d0d4da";
  return merge([
    piece(sphere(0.1, 10, 8), grey, 0, { scale: [0.55, 0.85, 2.0] }),
    piece(sphere(0.018, 6, 4), "#111111", 0, { pos: [0.045, 0.03, 0.13] }),
    piece(sphere(0.018, 6, 4), "#111111", 0, { pos: [-0.045, 0.03, 0.13] }),
    flat([[0, 0, -0.16], [0, 0.12, -0.33], [0, -0.12, -0.33]], "#b8bec6", 1),
    flat([[0, 0.07, 0.05], [0, 0.14, -0.05], [0, 0.07, -0.1]], "#b8bec6", 1),
  ]);
}

/** Sleeping ginger tabby curled into a ball, head resting on the front; the body (part 1) breathes. */
export function catModel(): THREE.BufferGeometry {
  const fur = new THREE.Color("#f2a04e");
  const dark = new THREE.Color("#c86f28");
  const stripe = new THREE.Color();
  // Tabby stripes radiating around the curled body
  const tabby = (p: THREE.Vector3) => stripe.copy(Math.sin(Math.atan2(p.z, p.x) * 9) > 0.45 ? dark : fur);
  const tail = new THREE.TorusGeometry(0.27, 0.05, 6, 20, Math.PI * 1.2);
  const ear = new THREE.ConeGeometry(0.05, 0.1, 5);
  const lid = new THREE.BoxGeometry(0.045, 0.01, 0.01);
  const q = Math.PI / 4;
  return merge([
    piece(sphere(0.24, 16, 10), tabby, 1, { pos: [0, 0.14, 0], scale: [1.1, 0.62, 0.9] }),
    piece(sphere(0.13, 12, 10), fur, 0, { pos: [0.2, 0.15, 0.2], scale: [1.1, 0.95, 1] }),
    piece(sphere(0.06, 8, 6), "#fff1dc", 0, { pos: [0.27, 0.11, 0.27], scale: [1.1, 0.8, 1] }),
    piece(ear, fur, 0, { pos: [0.13, 0.27, 0.25], rot: [0.25, 0, 0.25] }),
    piece(ear, fur, 0, { pos: [0.25, 0.27, 0.13], rot: [-0.25, 0, -0.25] }),
    piece(lid, "#3a2a20", 0, { pos: [0.33, 0.18, 0.25], rot: [0, q, 0.2] }),
    piece(lid, "#3a2a20", 0, { pos: [0.25, 0.18, 0.33], rot: [0, q, -0.2] }),
    piece(sphere(0.018, 6, 4), "#ff8fa0", 0, { pos: [0.32, 0.14, 0.32] }),
    piece(sphere(0.05, 8, 6), "#fff1dc", 0, { pos: [0.33, 0.04, 0.17], scale: [1.3, 0.7, 1] }),
    piece(tail, tabby, 0, { pos: [0, 0.05, 0], rot: [-Math.PI / 2, 0, 1.9] }),
  ]);
}
