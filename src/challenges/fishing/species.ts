/**
 * The fish of the lagoon: five everyday kinds and the rare golden fish.
 * Each species has its German name and fun fact for the catch card, a size
 * range in centimetres and a cartoon model built from primitives (forward =
 * +z): a body with fins and big eyes, and a separate tail that wags around
 * its root. Fins are thin extrusions so the cartoon outline traces them too.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { part, merge, ColorFn, Xform } from "../../core/geo";
import { ball, cyl } from "../../world/models/shapes";

export type FishKind = "clown" | "tang" | "puffer" | "rainbow" | "box" | "gold";

export interface Species {
  kind: FishKind;
  name: string;
  /** What Fischer Jonas says when it is caught. */
  fact: string;
  cm: [number, number];
  /** Cruising speed (units/s). */
  speed: number;
  /** Number swimming in the lagoon. */
  count: number;
}

export const SPECIES: Record<FishKind, Species> = {
  clown: { kind: "clown", name: "Clownfisch", fact: "Ein Clownfisch! Der wohnt in einer Seeanemone.", cm: [8, 12], speed: 0.9, count: 2 },
  tang: { kind: "tang", name: "Doktorfisch", fact: "Ein Doktorfisch! So blau wie der Himmel.", cm: [18, 26], speed: 1.0, count: 2 },
  puffer: { kind: "puffer", name: "Kugelfisch", fact: "Ein Kugelfisch! Wenn er sich erschreckt, wird er rund wie ein Ball.", cm: [15, 24], speed: 0.6, count: 2 },
  rainbow: { kind: "rainbow", name: "Regenbogenfisch", fact: "Ein Regenbogenfisch! Seine Schuppen glitzern in allen Farben.", cm: [10, 16], speed: 0.95, count: 2 },
  box: { kind: "box", name: "Kofferfisch", fact: "Ein Kofferfisch! Der sieht aus wie ein kleiner Koffer mit Punkten.", cm: [12, 20], speed: 0.65, count: 2 },
  gold: { kind: "gold", name: "Goldfisch", fact: "Der goldene Glücksfisch! Den sieht man ganz, ganz selten!", cm: [30, 40], speed: 1.15, count: 0 },
};

export const EVERYDAY: FishKind[] = ["clown", "tang", "puffer", "rainbow", "box"];

export interface FishModel {
  body: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  /** Where the tail hinges (z) on the body. */
  tailZ: number;
  /** Nose-to-tail length in world units (for bites and the bucket). */
  length: number;
}

type Geo = THREE.BufferGeometry;
type P2 = [number, number];

/** A thin fin: polygon in the side plane (z along the body, y up), extruded to `thick` across x. */
function fin(points: P2[], color: THREE.ColorRepresentation | ColorFn, thick = 0.018, x: Xform = {}): Geo {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -thick / 2);
  // Reason: shape x becomes the fish's z (forward) and the extrusion becomes its width (x)
  g.rotateY(-Math.PI / 2);
  return part(g, color, x);
}

/** Smooth ellipsoid body part. */
function blob(rx: number, ry: number, rz: number, color: THREE.ColorRepresentation | ColorFn, pos: [number, number, number] = [0, 0, 0]): Geo {
  return part(new THREE.SphereGeometry(1, 28, 18), color, { pos, scale: [rx, ry, rz] });
}

/** Big cartoon eyes on both sides: white ball, dark pupil looking forward, two glints. */
function eyes(x: number, y: number, z: number, r: number): Geo[] {
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    parts.push(ball(r, "#ffffff", [s * x, y, z], 2));
    parts.push(ball(r * 0.62, "#15100d", [s * (x + r * 0.5), y + r * 0.05, z + r * 0.22], 2));
    parts.push(ball(r * 0.2, "#ffffff", [s * (x + r * 0.95), y + r * 0.28, z + r * 0.3], 1));
  }
  return parts;
}

/** Side (pectoral) fins: small paddles angled out and back. */
function sideFins(x: number, y: number, z: number, size: number, color: THREE.ColorRepresentation | ColorFn): Geo[] {
  const pts: P2[] = [[0, 0], [-size, size * 0.45], [-size * 1.1, -size * 0.2], [-size * 0.3, -size * 0.3]];
  return [-1, 1].map((s) => fin(pts, color, 0.014, { pos: [s * x, y, z], rot: [0, s * 0.55, s * 0.25] }));
}

/** Tail fan behind the hinge (z = 0 at the hinge, tail points to -z). */
function tailFan(len: number, spread: number, color: THREE.ColorRepresentation | ColorFn, notch = 0.35): Geo {
  return fin([[0.04, 0.04], [-len, spread], [-len * (1 - notch), 0], [-len, -spread], [0.04, -0.04]], color, 0.02);
}

const C = (hex: string) => new THREE.Color(hex);

function clownfish(): FishModel {
  const orange = C("#ff7a1a");
  const white = C("#fffaf0");
  const black = C("#1b1412");
  // Reason: three white bands with thin black borders, measured along the body
  const bands = [0.15, -0.01, -0.19];
  const paint: ColorFn = (p) => {
    for (const b of bands) {
      const d = Math.abs(p.z - b);
      if (d < 0.033) return white;
      if (d < 0.047) return black;
    }
    return orange;
  };
  const finPaint: ColorFn = (p) => (p.y > 0.2 || p.y < -0.15 || p.z < -0.42 ? black : orange);
  const body = merge([
    blob(0.12, 0.15, 0.3, paint),
    fin([[0.1, 0.12], [0.02, 0.24], [-0.06, 0.2], [-0.1, 0.25], [-0.2, 0.2], [-0.24, 0.1]], finPaint),
    fin([[-0.04, -0.12], [-0.12, -0.2], [-0.2, -0.17], [-0.22, -0.08]], finPaint),
    ...sideFins(0.1, -0.03, 0.08, 0.1, orange),
    ...eyes(0.08, 0.04, 0.19, 0.055),
    ball(0.03, "#c4501a", [0, -0.03, 0.29], 1),
  ]);
  const tail = merge([tailFan(0.18, 0.13, (p) => (p.z < -0.15 ? black : p.z < -0.1 ? white : orange))]);
  return { body, tail, tailZ: -0.27, length: 0.62 };
}

function tang(): FishModel {
  const blue = C("#2a64ea");
  const navy = C("#14183a");
  const yellow = C("#ffd21c");
  const paint: ColorFn = (p) => {
    // Black "palette" swoosh from behind the eye to the tail, with a loop on the upper flank
    const swoosh = Math.abs(p.y - 0.04 - (p.z + 0.05) * 0.25) < 0.04 && p.z < 0.12 && p.z > -0.26;
    const loop = Math.hypot((p.z + 0.06) / 0.12, (p.y - 0.12) / 0.05) < 1 && p.y > 0.08;
    return swoosh || loop ? navy : blue;
  };
  const body = merge([
    blob(0.08, 0.2, 0.28, paint),
    fin([[0.12, 0.17], [0.02, 0.27], [-0.2, 0.22], [-0.27, 0.06]], (p) => (p.y > 0.24 ? navy : blue)),
    fin([[0.06, -0.17], [-0.06, -0.25], [-0.22, -0.18], [-0.27, -0.06]], (p) => (p.y < -0.22 ? navy : blue)),
    ...sideFins(0.07, -0.02, 0.06, 0.11, yellow),
    ...eyes(0.055, 0.06, 0.17, 0.052),
    ball(0.025, "#1d3fb0", [0, -0.02, 0.28], 1),
  ]);
  const tail = merge([tailFan(0.17, 0.15, yellow, 0.45)]);
  return { body, tail, tailZ: -0.25, length: 0.6 };
}

function pufferfish(): FishModel {
  const top = C("#f3c64a");
  const belly = C("#fff4dc");
  const spot = C("#8a5a2b");
  const paint: ColorFn = (p) => {
    if (p.y < -0.06) return belly;
    // Reason: a coarse grid of round dots, offset every other row, gives cartoon leopard spots
    const row = Math.round(p.y * 11);
    const sx = p.x * 11 + (row % 2) * 0.5;
    const sz = p.z * 11 + (row % 2) * 0.5;
    const d = Math.hypot(sx - Math.round(sx), sz - Math.round(sz), p.y * 11 - row);
    return d < 0.24 ? spot : top;
  };
  const parts: Geo[] = [blob(0.2, 0.19, 0.24, paint)];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const yy = 1 - (i / 25) * 1.8;
    const r = Math.sqrt(Math.max(0, 1 - yy * yy));
    const dir = new THREE.Vector3(Math.cos(a) * r, yy, Math.sin(a) * r);
    if (dir.z > 0.75) continue;
    const at = new THREE.Vector3(dir.x * 0.2, dir.y * 0.19, dir.z * 0.24);
    const spike = new THREE.ConeGeometry(0.02, 0.07, 4);
    spike.translate(0, 0.035, 0);
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    parts.push(part(spike, "#e8d6a0", { pos: [at.x, at.y, at.z] }));
  }
  parts.push(...sideFins(0.18, -0.02, 0.05, 0.09, "#f6d878"));
  parts.push(fin([[-0.12, 0.15], [-0.2, 0.22], [-0.24, 0.12]], "#f6d878"));
  parts.push(...eyes(0.11, 0.07, 0.17, 0.07));
  parts.push(part(new THREE.TorusGeometry(0.03, 0.014, 6, 12), "#e0763a", { pos: [0, -0.03, 0.235] }));
  const tail = merge([tailFan(0.12, 0.09, "#f6d878", 0.3)]);
  return { body: merge(parts), tail, tailZ: -0.22, length: 0.5 };
}

function rainbowfish(): FishModel {
  const hue = new THREE.Color();
  const silver = C("#e8f0ff");
  const paint: ColorFn = (p) => {
    // Reason: overlapping scale cells, each with its own hue, shimmer like a rainbow
    const cell = Math.floor(p.z * 18) * 7 + Math.floor(p.y * 16) * 13;
    const h = (0.55 + p.z * 0.9 + Math.sin(cell) * 0.12 + 1) % 1;
    if (Math.sin(cell * 3.7) > 0.86) return silver;
    return hue.setHSL(h, 0.75, p.y < -0.08 ? 0.72 : 0.58);
  };
  const finPaint: ColorFn = (p) => hue.setHSL((0.75 + p.z * 0.6 + 1) % 1, 0.7, 0.65);
  const body = merge([
    blob(0.1, 0.17, 0.32, paint),
    fin([[0.06, 0.15], [-0.04, 0.3], [-0.22, 0.26], [-0.28, 0.1]], finPaint, 0.014),
    fin([[0.0, -0.15], [-0.1, -0.27], [-0.26, -0.2], [-0.28, -0.08]], finPaint, 0.014),
    ...sideFins(0.09, -0.03, 0.08, 0.11, finPaint),
    ...eyes(0.07, 0.05, 0.2, 0.055),
  ]);
  const tail = merge([tailFan(0.22, 0.17, finPaint, 0.4)]);
  return { body, tail, tailZ: -0.29, length: 0.7 };
}

function boxfish(): FishModel {
  const yellow = C("#ffd21c");
  const dot = C("#1b1412");
  const paint: ColorFn = (p) => {
    const sy = p.y * 13;
    const sz = p.z * 13 + (Math.round(sy) % 2) * 0.5;
    const d = Math.hypot(sy - Math.round(sy), sz - Math.round(sz));
    return d < 0.2 && p.y > -0.06 ? dot : yellow;
  };
  const box = new RoundedBoxGeometry(0.22, 0.2, 0.34, 4, 0.08);
  const body = merge([
    part(box, paint),
    ...sideFins(0.11, -0.02, 0.06, 0.08, "#ffe680"),
    fin([[-0.1, 0.09], [-0.16, 0.15], [-0.2, 0.08]], "#ffe680"),
    ...eyes(0.095, 0.05, 0.12, 0.06),
    ball(0.035, "#ff8a5a", [0, -0.03, 0.18], 1, [1.2, 0.9, 0.8]),
  ]);
  const tail = merge([tailFan(0.12, 0.1, "#ffe680", 0.25)]);
  return { body, tail, tailZ: -0.17, length: 0.48 };
}

function goldfish(): FishModel {
  const gold = C("#ffb800");
  const deep = C("#ff7400");
  const belly = C("#fff0a8");
  const paint: ColorFn = (p) => (p.y < -0.07 ? belly : gold.clone().lerp(deep, THREE.MathUtils.clamp(-p.z * 2.5, 0, 1)));
  const finPaint: ColorFn = (p) => deep.clone().lerp(C("#ffe9a0"), THREE.MathUtils.clamp(-p.z * 1.5 - 0.2, 0, 0.85));
  const body = merge([
    blob(0.13, 0.17, 0.32, paint),
    fin([[0.1, 0.15], [-0.02, 0.36], [-0.22, 0.3], [-0.26, 0.1]], finPaint, 0.016),
    fin([[-0.06, -0.15], [-0.14, -0.26], [-0.26, -0.18]], finPaint, 0.016),
    ...sideFins(0.12, -0.04, 0.08, 0.13, finPaint),
    ...eyes(0.09, 0.05, 0.2, 0.06),
    // A tiny crown of light: three pearls on the head
    ...[-1, 0, 1].map((i) => ball(0.025, "#fff8d0", [i * 0.045, 0.17 - Math.abs(i) * 0.02, 0.1], 1)),
  ]);
  // Big double veil tail
  const tail = merge([
    fin([[0.04, 0.05], [-0.3, 0.3], [-0.42, 0.1], [-0.22, 0.0]], finPaint, 0.016),
    fin([[0.04, -0.05], [-0.3, -0.28], [-0.42, -0.08], [-0.22, 0.0]], finPaint, 0.016),
  ]);
  return { body, tail, tailZ: -0.29, length: 0.85 };
}

const BUILDERS: Record<FishKind, () => FishModel> = {
  clown: clownfish,
  tang,
  puffer: pufferfish,
  rainbow: rainbowfish,
  box: boxfish,
  gold: goldfish,
};

const cache = new Map<FishKind, FishModel>();

/** Shared geometry for a species (built once, reused by every fish of that kind). */
export function fishModel(kind: FishKind): FishModel {
  let m = cache.get(kind);
  if (!m) {
    m = BUILDERS[kind]();
    cache.set(kind, m);
  }
  return m;
}

/** Free the cached geometry (on leaving the challenge). */
export function disposeFishModels(): void {
  for (const m of cache.values()) {
    m.body.dispose();
    m.tail.dispose();
  }
  cache.clear();
}

/** Glass bottle (lying along +z) and what is inside it: a cork and a rolled-up letter. */
export function bottleModel(): { glass: Geo; inner: Geo } {
  const glass = C("#8fe0b8");
  const along: Xform["rot"] = [Math.PI / 2, 0, 0];
  return {
    glass: merge([
      cyl(0.075, 0.075, 0.26, glass, { rot: along }, 14),
      part(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, { pos: [0, 0, 0.13], rot: along }),
      cyl(0.03, 0.032, 0.11, glass, { pos: [0, 0, 0.24], rot: along }, 10),
    ]),
    inner: merge([
      cyl(0.033, 0.028, 0.06, "#b07a45", { pos: [0, 0, 0.31], rot: along }, 8),
      cyl(0.042, 0.042, 0.19, "#fff3d0", { pos: [0, -0.01, -0.01], rot: along }, 8),
      part(new THREE.TorusGeometry(0.044, 0.009, 4, 10), "#e63946", { pos: [0, -0.01, -0.01] }),
    ]),
  };
}
