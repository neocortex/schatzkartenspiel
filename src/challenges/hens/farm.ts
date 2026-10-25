/**
 * Farmyard props built from painted primitives (vertex colours, merged into
 * as few meshes as possible by the yard): round and square hay bales, the
 * water trough, the wheelbarrow full of pumpkins, the vegetable patch, a
 * feed sack with spilled grain, an egg basket — plus the swaying sunflowers
 * and the wobbly scarecrow, which stay separate groups so they can move.
 */

import * as THREE from "three";
import { part, merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { box, rbox, cyl, ball, beam, pole, tint } from "../../world/models/shapes";

type Parts = THREE.BufferGeometry[];
const STRAW = new THREE.Color("#e7c25c");
const STRAW_DARK = new THREE.Color("#c99b3a");

/** Straw colour: streaky on the sides, spiral rings on the round ends (axis = x). */
function strawFn(axis: "x" | "none", radius = 0.7): (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color {
  const out = new THREE.Color();
  return (p, n) => {
    if (axis === "x" && Math.abs(n.x) > 0.8) {
      const r = Math.hypot(p.y - radius, p.z) / radius;
      const ring = 0.5 + 0.5 * Math.sin(r * 26 + Math.atan2(p.y - radius, p.z) * 0.6);
      return out.copy(STRAW_DARK).lerp(STRAW, 0.35 + ring * 0.65);
    }
    const streak = 0.5 + 0.5 * Math.sin(p.x * 31 + Math.sin(p.y * 17) * 2 + p.z * 13);
    return out.copy(STRAW_DARK).lerp(STRAW, 0.55 + streak * 0.45);
  };
}

/** A round hay bale lying on its side (axis along x), resting on the ground. */
export function roundBale(rot = 0, r = 0.72, len = 1.2): Parts {
  const m = new THREE.Matrix4().makeRotationY(rot);
  const g = new THREE.CylinderGeometry(r, r, len, 22, 2);
  g.rotateZ(Math.PI / 2);
  g.translate(0, r, 0);
  const parts = [part(g, strawFn("x", r))];
  for (const x of [-len * 0.28, len * 0.28]) {
    parts.push(part(new THREE.TorusGeometry(r + 0.012, 0.018, 4, 24), "#8a5a32", { pos: [x, r, 0], rot: [0, Math.PI / 2, 0] }));
  }
  return parts.map((p) => p.applyMatrix4(m));
}

/** A rectangular straw bale with two twine bands. */
export function squareBale(x: number, y: number, z: number, rotY: number): Parts {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(1, 1, 1));
  const parts = [rbox(1.15, 0.5, 0.62, strawFn("none"), { pos: [0, 0.25, 0] }, 0.08, 2)];
  for (const bx of [-0.3, 0.3]) parts.push(box(0.03, 0.52, 0.64, "#8a5a32", { pos: [bx, 0.25, 0] }));
  return parts.map((p) => p.applyMatrix4(m));
}

/** Loose straw tufts scattered on the ground around a pile. */
function looseStraw(rand: () => number, radius: number, n: number): Parts {
  const parts: Parts = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = radius * (0.85 + rand() * 0.5);
    parts.push(box(0.4 + rand() * 0.3, 0.02, 0.025, tint("#f0cf6a", rand, 0.1), { pos: [Math.cos(a) * d, 0.02, Math.sin(a) * d], rot: [0, rand() * 3, 0] }));
  }
  return parts;
}

/** Hay pile by kind (see layout.HAY): local parts centred on the pile. */
export function hayPile(kind: "round" | "stack" | "pair", seed: number): Parts {
  const rand = mulberry32(seed);
  const parts: Parts = [];
  if (kind === "round") {
    parts.push(...roundBale(rand() * 0.6 - 0.3));
  } else if (kind === "pair") {
    const a = roundBale(0.25);
    const b = roundBale(-0.15);
    for (const g of a) g.translate(-0.55, 0, -0.35);
    for (const g of b) g.translate(0.7, 0, 0.45);
    parts.push(...a, ...b, ...squareBale(-0.6, 0, 1.05, 0.5));
  } else {
    parts.push(...squareBale(-0.32, 0, 0, 0.08), ...squareBale(0.36, 0, 0.08, -0.06), ...squareBale(0.02, 0.5, 0.03, 0.35));
    parts.push(...squareBale(0.15, 0, 0.85, 1.4));
  }
  parts.push(...looseStraw(rand, kind === "round" ? 0.9 : 1.3, 14));
  return parts;
}

/** Wooden water trough (long side along x). Returns parts plus the water surface size and height. */
export function trough(): { parts: Parts; water: { w: number; d: number; y: number } } {
  const rand = mulberry32(7);
  const parts: Parts = [];
  const w = 2.3;
  const d = 0.62;
  const h = 0.5;
  const legH = 0.18;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.12, legH, 0.12, "#6e4528", { pos: [sx * (w / 2 - 0.2), legH / 2, sz * (d / 2 - 0.08)] }));
  parts.push(box(w, 0.08, d, "#7b4f2c", { pos: [0, legH + 0.04, 0] }));
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      parts.push(box(w, h / 3 - 0.01, 0.07, tint("#a8703f", rand, 0.1), { pos: [0, legH + 0.08 + (i + 0.5) * (h / 3), sz * (d / 2 - 0.035)], rot: [sz * 0.08, 0, 0] }));
    }
  }
  for (const sx of [-1, 1]) parts.push(box(0.08, h + 0.05, d, "#8a5a32", { pos: [sx * (w / 2 - 0.04), legH + 0.08 + h / 2, 0] }));
  for (const sx of [-1, 1]) parts.push(box(0.1, 0.06, d + 0.14, "#5b3a25", { pos: [sx * (w / 2 - 0.3), legH + h + 0.06, 0] }));
  return { parts, water: { w: w - 0.18, d: d - 0.16, y: legH + h - 0.05 } };
}

/** Pumpkin: ribbed orange ball with a green stalk. */
function pumpkin(x: number, y: number, z: number, s: number, rand: () => number): Parts {
  const base = tint("#ff8a1e", rand, 0.08);
  const dark = base.clone().multiplyScalar(0.72);
  const out = new THREE.Color();
  const ribs = (p: THREE.Vector3) => out.copy(dark).lerp(base, 0.55 + 0.45 * Math.cos(Math.atan2(p.z - z, p.x - x) * 8));
  const g = new THREE.SphereGeometry(0.28 * s, 18, 12);
  g.scale(1, 0.72, 1);
  g.translate(x, y + 0.2 * s, z);
  return [part(g, ribs), cyl(0.03 * s, 0.045 * s, 0.14 * s, "#4f7d2a", { pos: [x, y + 0.42 * s, z], rot: [0.2, 0, 0.25] }, 5)];
}

/** Wooden wheelbarrow tipped forward on its wheel, full of pumpkins. */
export function wheelbarrow(): Parts {
  const rand = mulberry32(11);
  const parts: Parts = [];
  const tray = "#3f86c9";
  parts.push(rbox(0.9, 0.06, 1.0, tray, { pos: [0, 0.48, 0] }, 0.02));
  for (const sx of [-1, 1]) parts.push(rbox(0.06, 0.38, 1.08, tray, { pos: [sx * 0.5, 0.64, 0], rot: [0, 0, sx * -0.28] }, 0.02));
  parts.push(rbox(1.05, 0.38, 0.06, tray, { pos: [0, 0.64, 0.58], rot: [0.45, 0, 0] }, 0.02));
  parts.push(rbox(0.95, 0.34, 0.06, tray, { pos: [0, 0.64, -0.52], rot: [-0.2, 0, 0] }, 0.02));
  // Wheel at the front, handles and legs at the back
  parts.push(cyl(0.3, 0.3, 0.12, "#3a2a20", { pos: [0, 0.3, 0.85], rot: [0, 0, Math.PI / 2] }, 16));
  parts.push(cyl(0.12, 0.12, 0.14, "#d9a441", { pos: [0, 0.3, 0.85], rot: [0, 0, Math.PI / 2] }, 10));
  for (const sx of [-1, 1]) {
    parts.push(pole([sx * 0.3, 0.32, 0.85], [sx * 0.38, 0.62, -1.25], 0.035, "#8a5a32"));
    parts.push(beam([sx * 0.33, 0.45, -0.45], [sx * 0.33, 0.0, -0.5], 0.06, "#6e4528"));
  }
  parts.push(...pumpkin(-0.18, 0.5, -0.12, 1, rand), ...pumpkin(0.2, 0.52, 0.18, 0.85, rand), ...pumpkin(0.05, 0.75, -0.02, 0.75, rand));
  return parts;
}

/** Vegetable patch: three soil rows with cabbages and carrot tops. */
export function veggiePatch(): Parts {
  const rand = mulberry32(21);
  const parts: Parts = [];
  for (let r = 0; r < 3; r++) {
    const z = (r - 1) * 0.75;
    parts.push(rbox(0.55, 0.14, 3.0, "#6b4428", { pos: [z, 0.05, 0] }, 0.06));
    for (let k = 0; k < 5; k++) {
      const x = -1.15 + k * 0.58;
      if (r === 1) {
        for (let i = 0; i < 3; i++) parts.push(part(new THREE.ConeGeometry(0.035, 0.32, 4), "#4f9a2a", { pos: [z + (i - 1) * 0.06, 0.28, x], rot: [(i - 1) * 0.3, 0, 0] }));
        parts.push(ball(0.05, "#ff7a1e", [z, 0.13, x], 0));
      } else {
        const c = tint("#7cc24a", rand, 0.1);
        parts.push(ball(0.2, c.clone().multiplyScalar(0.8), [z, 0.24, x], 1, [1, 0.8, 1]));
        parts.push(ball(0.15, c, [z + 0.03, 0.32, x + 0.02], 1, [1, 0.7, 1]));
      }
    }
  }
  return parts;
}

/** Open burlap feed sack with a rolled-down rim, full of grain that spills onto the ground. */
export function feedSack(): Parts {
  const rand = mulberry32(5);
  const base = new THREE.Color("#d2b07a");
  const out = new THREE.Color();
  const burlap = (p: THREE.Vector3) => out.copy(base).multiplyScalar(0.9 + 0.1 * Math.sin(p.x * 70) * Math.sin(p.y * 70 + p.z * 50));
  const parts: Parts = [rbox(0.74, 0.6, 0.56, burlap, { pos: [0, 0.3, 0] }, 0.2, 3)];
  parts.push(box(0.75, 0.08, 0.57, "#c9473a", { pos: [0, 0.3, 0] }));
  // Rolled-down rim and the heap of grain inside
  parts.push(rbox(0.8, 0.13, 0.62, "#e2c690", { pos: [0, 0.58, 0] }, 0.06, 2));
  parts.push(ball(0.3, "#f3cf57", [0, 0.62, 0], 0, [1.15, 0.45, 0.85]));
  for (let i = 0; i < 40; i++) {
    const a = 0.4 + rand() * 1.4;
    const d = 0.35 + rand() * 0.6;
    parts.push(ball(0.025, tint("#f3cf57", rand, 0.15), [Math.cos(a) * d, 0.02, Math.sin(a) * d], 0, [1, 0.6, 1]));
  }
  return parts;
}

/** Wicker basket with a clutch of eggs. */
export function eggBasket(): Parts {
  const rand = mulberry32(3);
  const parts: Parts = [cyl(0.3, 0.24, 0.24, "#b07a3c", { pos: [0, 0.12, 0] }, 14)];
  parts.push(part(new THREE.TorusGeometry(0.3, 0.035, 5, 18), "#8a5a2a", { pos: [0, 0.24, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new THREE.TorusGeometry(0.28, 0.025, 5, 18, Math.PI), "#8a5a2a", { pos: [0, 0.24, 0] }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(ball(0.08, rand() < 0.5 ? "#fff8ec" : "#e9c79a", [Math.cos(a) * 0.13, 0.27, Math.sin(a) * 0.13], 1, [0.85, 1.15, 0.85]));
  }
  return parts;
}

/** One sunflower: a gently curved stem with leaves, and a head on its own group (nods in the wind). */
export function sunflower(seed: number, material: THREE.Material): { group: THREE.Group; head: THREE.Group } {
  const rand = mulberry32(seed + 100);
  const h = 1.7 + rand() * 0.8;
  const stem: Parts = [cyl(0.035, 0.05, h, "#4f8a2a", { pos: [0, h / 2, 0] }, 6)];
  for (let i = 0; i < 3; i++) {
    const y = h * (0.3 + i * 0.2);
    const a = i * 2.3 + rand();
    stem.push(ball(0.2, "#4f9a32", [Math.cos(a) * 0.2, y, Math.sin(a) * 0.2], 1, [1.2, 0.18, 0.75]));
  }
  const head: Parts = [cyl(0.2, 0.2, 0.08, "#5a3418", { pos: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0] }, 16)];
  head.push(ball(0.15, "#3d2412", [0, 0, 0.06], 1, [1, 1, 0.3]));
  const petals = 14;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const r = 0.29;
    head.push(part(new THREE.SphereGeometry(0.1, 8, 6), tint(i % 2 ? "#ffd21f" : "#ffc20f", rand, 0.06), {
      pos: [Math.cos(a) * r, Math.sin(a) * r, 0],
      rot: [0, 0, a],
      scale: [1.5, 0.55, 0.22],
    }));
  }
  head.push(cyl(0.05, 0.05, 0.12, "#4f8a2a", { pos: [0, 0, -0.06], rot: [Math.PI / 2, 0, 0] }, 6));
  const group = new THREE.Group();
  const stemMesh = new THREE.Mesh(merge(stem), material);
  stemMesh.castShadow = true;
  group.add(stemMesh);
  const headGroup = new THREE.Group();
  const headMesh = new THREE.Mesh(merge(head), material);
  headMesh.castShadow = true;
  headGroup.add(headMesh);
  headGroup.position.set(0, h, 0.04);
  headGroup.rotation.x = 0.25;
  group.add(headGroup);
  return { group, head: headGroup };
}

/** Scarecrow in a plaid shirt and straw hat, with a little bird on one arm. */
export function scarecrow(material: THREE.Material): THREE.Group {
  const parts: Parts = [];
  parts.push(cyl(0.06, 0.07, 1.9, "#7b5435", { pos: [0, 0.95, 0] }, 6));
  parts.push(pole([-0.85, 1.42, 0], [0.85, 1.42, 0], 0.045, "#7b5435"));
  const red = new THREE.Color("#d2453a");
  const dark = new THREE.Color("#8a2a24");
  const out = new THREE.Color();
  const plaid = (p: THREE.Vector3) => {
    const a = Math.sin(p.x * 22) > 0.4 ? 1 : 0;
    const b = Math.sin(p.y * 22) > 0.4 ? 1 : 0;
    return out.copy(red).lerp(dark, (a + b) * 0.35);
  };
  parts.push(rbox(0.62, 0.72, 0.34, plaid, { pos: [0, 1.25, 0] }, 0.1, 2));
  for (const sx of [-1, 1]) {
    parts.push(part(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 8), plaid, { pos: [sx * 0.5, 1.42, 0], rot: [0, 0, Math.PI / 2] }));
    for (let i = 0; i < 4; i++) parts.push(part(new THREE.ConeGeometry(0.03, 0.26, 4), "#f0cf6a", { pos: [sx * (0.86 + i * 0.01), 1.42 + (i - 1.5) * 0.04, 0], rot: [0, 0, sx * (-Math.PI / 2 + (i - 1.5) * 0.2)] }));
    parts.push(ball(0.07, "#3a5aa8", [sx * 0.16, 0.95, 0.12], 1));
  }
  parts.push(ball(0.07, "#3a5aa8", [0, 1.1, 0.18], 1));
  // Sack head with a stitched smile and button eyes
  parts.push(ball(0.27, "#ead6a8", [0, 1.86, 0], 2, [1, 1.05, 0.95]));
  for (const sx of [-1, 1]) parts.push(ball(0.045, "#2a1b12", [sx * 0.09, 1.9, 0.24], 1));
  for (let i = -2; i <= 2; i++) parts.push(box(0.03, 0.03, 0.03, "#5a3418", { pos: [i * 0.05, 1.77 + Math.abs(i) * 0.015, 0.25] }));
  parts.push(ball(0.04, "#ff8a3a", [0, 1.84, 0.27], 1, [1, 1, 1.6]));
  // Floppy straw hat
  parts.push(cyl(0.48, 0.5, 0.04, "#e3b94f", { pos: [0, 2.03, 0], rot: [0.08, 0, 0.1] }, 18));
  parts.push(cyl(0.2, 0.26, 0.26, "#e8c35a", { pos: [0, 2.17, 0] }, 14));
  parts.push(cyl(0.265, 0.265, 0.06, "#d2453a", { pos: [0, 2.08, 0] }, 14));
  for (let i = 0; i < 6; i++) parts.push(part(new THREE.ConeGeometry(0.03, 0.2, 4), "#f0cf6a", { pos: [-0.25 + i * 0.1, 1.75, -0.12], rot: [0.4, 0, (i - 2.5) * 0.15] }));
  // A little blue bird perched on the right arm
  parts.push(ball(0.08, "#4a8fd8", [0.62, 1.53, 0.02], 1, [1, 0.9, 1.3]), ball(0.055, "#4a8fd8", [0.62, 1.62, 0.08], 1));
  parts.push(ball(0.04, "#fff3dc", [0.62, 1.5, 0.08], 1), part(new THREE.ConeGeometry(0.018, 0.05, 5), "#ffb21e", { pos: [0.62, 1.62, 0.15], rot: [Math.PI / 2, 0, 0] }));
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(merge(parts), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}
