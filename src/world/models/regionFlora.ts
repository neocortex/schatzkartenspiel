/**
 * Plants of the newer regions (see world/regions.ts): bamboo, big leaves,
 * ferns and giant flowers in the jungle; hibiscus and beach grass at the
 * lagoon; mangroves, reeds and lily pads in the swamp; pale trees and flower
 * clumps on the flower hills. Same style as flora.ts: one merged,
 * vertex-coloured geometry per model.
 */

import * as THREE from "three";
import { part, merge, gradient } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { FloraModel, canopy, trunk } from "./flora";

const PETALS = ["#ff3d7f", "#ff8a1f", "#ffd21f", "#e0263a", "#b04dff", "#ffffff"];

/**
 * A leaf, frond or blade as a ribbon: starts at `at`, heads out along `yaw`
 * (`reach` sideways, `rise` up) and droops at the tip. The midrib sits a little
 * higher than the edges so the leaf shades like a fold.
 */
function leaf(
  at: THREE.Vector3,
  yaw: number,
  reach: number,
  rise: number,
  droop: number,
  width: number,
  dark: THREE.ColorRepresentation,
  light: THREE.ColorRepresentation,
  steps = 6,
): THREE.BufferGeometry {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const pt = (t: number, side: number): number[] => {
    const w = Math.sin(Math.PI * Math.min(t * 1.1, 1)) * width * side;
    const along = t * reach;
    const y = rise * t - droop * t * t - Math.abs(side) * width * 0.25 * (1 - t * 0.5);
    return [at.x + cos * along - sin * w, at.y + y, at.z + sin * along + cos * w];
  };
  const v: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const [l0, c0, r0, l1, c1, r1] = [pt(t0, -1), pt(t0, 0), pt(t0, 1), pt(t1, -1), pt(t1, 0), pt(t1, 1)];
    v.push(...l0, ...c0, ...l1, ...l1, ...c0, ...c1, ...c0, ...r0, ...c1, ...c1, ...r0, ...r1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  upwardNormals(g);
  const top = at.y + Math.max(rise - droop, rise * 0.5);
  return part(g, gradient(dark, light, at.y, top + 0.2, 0.12));
}

/** Thin double-sided parts: tip normals upwards so both faces catch the sun. */
function upwardNormals(g: THREE.BufferGeometry): void {
  const n = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    if (v.y < 0) v.negate();
    v.y += 0.6;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

/** A five-petal blossom facing `normal`, centred at `at`. */
function blossom(at: THREE.Vector3, normal: THREE.Vector3, size: number, color: THREE.ColorRepresentation): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(size, 6, 4);
    petal.scale(1, 0.28, 0.62);
    petal.translate(size * 0.85, 0, 0);
    petal.rotateZ(0.25);
    petal.rotateY(a);
    petal.applyQuaternion(q);
    petal.translate(at.x, at.y, at.z);
    parts.push(part(petal, color));
  }
  const centre = new THREE.IcosahedronGeometry(size * 0.38, 0);
  centre.translate(at.x, at.y, at.z);
  parts.push(part(centre, "#ffe14a"));
  return parts;
}

export function bamboo(seed: number): FloraModel {
  const rand = mulberry32(seed + 101);
  const parts: THREE.BufferGeometry[] = [];
  const culms = 4 + Math.floor(rand() * 4);
  for (let c = 0; c < culms; c++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.5;
    const h = 3.6 + rand() * 2.4;
    const radius = 0.07 + rand() * 0.04;
    const lean = (rand() - 0.5) * 0.25;
    const g = new THREE.CylinderGeometry(radius, radius * 1.1, h, 6, 8);
    g.translate(0, h / 2, 0);
    const node = 0.55 + rand() * 0.15;
    parts.push(
      part(g, (p) => {
        const ring = (p.y % node) / node < 0.07;
        const base = new THREE.Color("#4f9a3a").lerp(new THREE.Color("#9fcf5a"), p.y / h);
        return ring ? base.multiplyScalar(0.62).lerp(new THREE.Color("#c9b45a"), 0.3) : base;
      }, { pos: [Math.cos(a) * r, 0, Math.sin(a) * r], rot: [lean, 0, -lean * 0.6] }),
    );
    // Leaf sprays near the top
    const top = new THREE.Vector3(0, h, 0)
      .applyEuler(new THREE.Euler(lean, 0, -lean * 0.6))
      .add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    for (let l = 0; l < 4; l++) {
      const at = top.clone().add(new THREE.Vector3(0, -0.3 - l * 0.45, 0));
      parts.push(leaf(at, rand() * Math.PI * 2, 0.75 + rand() * 0.3, 0.15, 0.45, 0.09, "#2f7a2a", "#9ad45a", 4));
    }
  }
  return { geometry: merge(parts), swayStart: 1.2, swayAmp: 0.05, doubleSided: true };
}

export function bigLeaf(seed: number): FloraModel {
  const rand = mulberry32(seed + 202);
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.05, 0.12, 0.6, 6);
  stem.translate(0, 0.3, 0);
  parts.push(part(stem, "#4f7a2f"));
  const leaves = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < leaves; i++) {
    const yaw = (i / leaves) * Math.PI * 2 + rand() * 0.5;
    const len = 1.6 + rand() * 0.8;
    parts.push(leaf(new THREE.Vector3(0, 0.45 + rand() * 0.3, 0), yaw, len, 0.9 + rand() * 0.5, 1.4, 0.45 + rand() * 0.2, "#1f6a2a", "#5fc04a", 7));
  }
  return { geometry: merge(parts), swayStart: 0.4, swayAmp: 0.06, doubleSided: true };
}

export function fern(seed: number): FloraModel {
  const rand = mulberry32(seed + 303);
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 8 + Math.floor(rand() * 4);
  for (let i = 0; i < fronds; i++) {
    const yaw = (i / fronds) * Math.PI * 2 + rand() * 0.3;
    parts.push(leaf(new THREE.Vector3(0, 0.05, 0), yaw, 0.8 + rand() * 0.35, 0.7, 0.75, 0.16, "#2a6e2a", "#7cc94a", 6));
  }
  return { geometry: merge(parts), swayStart: 0.15, swayAmp: 0.06, doubleSided: true };
}

export function giantFlower(seed: number): FloraModel {
  const rand = mulberry32(seed + 404);
  const h = 0.9 + rand() * 0.5;
  const parts: THREE.BufferGeometry[] = [];
  const stalk = new THREE.CylinderGeometry(0.03, 0.05, h, 5);
  stalk.translate(0, h / 2, 0);
  parts.push(part(stalk, "#3f8a2a"));
  parts.push(leaf(new THREE.Vector3(0, h * 0.3, 0), rand() * 6, 0.45, 0.25, 0.3, 0.14, "#2a6e2a", "#6cc04a", 4));
  parts.push(leaf(new THREE.Vector3(0, h * 0.45, 0), rand() * 6, 0.4, 0.25, 0.3, 0.12, "#2a6e2a", "#6cc04a", 4));
  const color = PETALS[seed % 5];
  parts.push(...blossom(new THREE.Vector3(0, h, 0), new THREE.Vector3(0.25, 1, 0.1), 0.24, color));
  return { geometry: merge(parts), swayStart: 0.3, swayAmp: 0.08, doubleSided: true };
}

export function hibiscus(seed: number): FloraModel {
  const rand = mulberry32(seed + 505);
  const parts = canopy(rand, new THREE.Vector3(0, 0.55, 0), 4, 0.55, 0.6, "#1f6328", "#58b043");
  const color = ["#e0263a", "#ff5fa2", "#ff8a1f"][seed % 3];
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.45 + rand() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a), 0.5 + rand() * 0.4, Math.sin(a)).normalize();
    parts.push(...blossom(new THREE.Vector3(Math.cos(a) * 0.72, y, Math.sin(a) * 0.72), dir, 0.13, color));
  }
  return { geometry: merge(parts), swayStart: 0.3, swayAmp: 0.04 };
}

export function mangrove(seed: number): FloraModel {
  const rand = mulberry32(seed + 606);
  const lift = 0.9;
  const parts = [trunk(2.0, 0.22, 0.14, "#6b5a45", (rand() - 0.5) * 0.4)];
  parts[0].translate(0, lift, 0);
  // Arching stilt roots
  const roots = 6;
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + rand() * 0.4;
    const r = 0.9 + rand() * 0.4;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(Math.cos(a) * 0.12, lift + 0.4, Math.sin(a) * 0.12),
      new THREE.Vector3(Math.cos(a) * r * 0.7, lift + 0.5, Math.sin(a) * r * 0.7),
      new THREE.Vector3(Math.cos(a) * r, -0.2, Math.sin(a) * r),
    );
    parts.push(part(new THREE.TubeGeometry(curve, 6, 0.06, 5, false), "#5e4e3b"));
  }
  parts.push(...canopy(rand, new THREE.Vector3(0, lift + 2.5, 0), 5, 0.9, 1.0, "#2b4f26", "#7a9a3a"));
  return { geometry: merge(parts), swayStart: lift + 1.5, swayAmp: 0.025 };
}

/** Reeds with cattails (swamp), or pale beach grass when `beach`. */
export function reeds(seed: number, beach = false): FloraModel {
  const rand = mulberry32(seed + 707);
  const parts: THREE.BufferGeometry[] = [];
  const [dark, light] = beach ? ["#8a9a4a", "#e6dc8a"] : ["#3f6a2a", "#a6c45a"];
  const blades = 10 + Math.floor(rand() * 5);
  for (let i = 0; i < blades; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.3;
    const h = (beach ? 0.5 : 1.0) + rand() * (beach ? 0.4 : 0.7);
    parts.push(leaf(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), a, 0.12 + rand() * 0.2, h, 0.2, 0.05, dark, light, 4));
  }
  if (!beach) {
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.25;
      const h = 1.2 + rand() * 0.5;
      const stalk = new THREE.CylinderGeometry(0.015, 0.02, h, 4);
      stalk.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      parts.push(part(stalk, "#5a7a32"));
      const head = new THREE.CapsuleGeometry(0.055, 0.22, 2, 6);
      head.translate(Math.cos(a) * r, h - 0.05, Math.sin(a) * r);
      parts.push(part(head, "#6b4226"));
    }
  }
  return { geometry: merge(parts), swayStart: 0.2, swayAmp: 0.09, doubleSided: true };
}

export function lilyPad(seed: number): FloraModel {
  const rand = mulberry32(seed + 808);
  const r = 0.45 + rand() * 0.25;
  const pad = new THREE.CircleGeometry(r, 18, 0.3, Math.PI * 2 - 0.6);
  pad.rotateX(-Math.PI / 2);
  const parts = [part(pad, (p) => new THREE.Color("#3f8f34").lerp(new THREE.Color("#7ccf4f"), Math.hypot(p.x, p.z) / r))];
  if (seed % 2 === 0) parts.push(...blossom(new THREE.Vector3(r * 0.2, 0.08, -r * 0.1), new THREE.Vector3(0, 1, 0), 0.12, seed % 4 === 0 ? "#ff9ec4" : "#ffffff"));
  return { geometry: merge(parts), swayStart: 99, swayAmp: 0 };
}

export function flowerPatch(seed: number): FloraModel {
  const rand = mulberry32(seed + 909);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) parts.push(leaf(new THREE.Vector3(0, 0, 0), rand() * 6.3, 0.3, 0.15, 0.15, 0.08, "#2f7a2a", "#7cc94a", 3));
  const color = PETALS[seed % PETALS.length];
  const count = 6 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.35;
    const h = 0.25 + rand() * 0.25;
    const stalk = new THREE.CylinderGeometry(0.012, 0.015, h, 4);
    stalk.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    parts.push(part(stalk, "#3f8a2a"));
    const head = new THREE.IcosahedronGeometry(0.07, 0);
    head.scale(1, 0.6, 1);
    head.translate(Math.cos(a) * r, h, Math.sin(a) * r);
    parts.push(part(head, rand() < 0.2 ? "#ffffff" : color));
  }
  return { geometry: merge(parts), swayStart: 0.1, swayAmp: 0.06, doubleSided: true };
}

export function lightTree(seed: number): FloraModel {
  const rand = mulberry32(seed + 1010);
  const h = 2.2 + rand() * 0.8;
  const lean = (rand() - 0.5) * 0.3;
  const bark = trunk(h + 0.4, 0.2, 0.11, "#e9e2d0", lean);
  const parts = [part(bark, (p) => new THREE.Color(Math.sin(p.y * 9 + p.x * 3) > 0.75 ? "#4a4440" : "#ece6d6"))];
  const palettes: [string, string][] = [
    ["#5f9a32", "#d6ec7a"],
    ["#4f8f3a", "#b8e06a"],
    ["#6aa23a", "#f0e47a"],
  ];
  const [dark, light] = palettes[seed % palettes.length];
  parts.push(...canopy(rand, new THREE.Vector3(lean, h + 0.8, 0), 4, 0.75, 0.95, dark, light));
  return { geometry: merge(parts), swayStart: h * 0.5, swayAmp: 0.04 };
}
