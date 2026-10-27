/**
 * Procedural plant and rock models (one merged, vertex-coloured geometry each)
 * used by the instanced vegetation system.
 */

import * as THREE from "three";
import { part, merge, displace, softNormals, gradient, facet } from "../../core/geo";
import { mulberry32 } from "../../core/noise";

/** Height (object space) above which wind sway starts, per model. */
export interface FloraModel {
  geometry: THREE.BufferGeometry;
  swayStart: number;
  swayAmp: number;
  doubleSided?: boolean;
}

export function canopy(
  rand: () => number,
  center: THREE.Vector3,
  blobs: number,
  spread: number,
  radius: number,
  dark: THREE.ColorRepresentation,
  light: THREE.ColorRepresentation,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const y0 = center.y - radius * 1.1;
  const y1 = center.y + radius * 1.3;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rand() * 0.8;
    const r = radius * (0.7 + rand() * 0.45);
    const off = i === 0 ? 0 : spread * (0.55 + rand() * 0.45);
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(center.x + Math.cos(a) * off, center.y + (rand() - 0.35) * radius * 0.7 + (i === 0 ? radius * 0.35 : 0), center.z + Math.sin(a) * off);
    displace(g, r * 0.12, 1.4, rand() * 50);
    softNormals(g, center, 0.65, 1.2);
    parts.push(part(g, gradient(dark, light, y0, y1, 0.22)));
  }
  return parts;
}

export function trunk(height: number, r0: number, r1: number, color: THREE.ColorRepresentation, lean = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, height, 7, 3);
  g.translate(0, height / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height;
    pos.setX(i, pos.getX(i) + lean * t * t);
  }
  g.computeVertexNormals();
  return part(g, gradient(new THREE.Color(color).multiplyScalar(0.6), color, 0, height * 0.6));
}

export function roundTree(seed: number): FloraModel {
  const rand = mulberry32(seed);
  const h = 1.8 + rand() * 0.8;
  const lean = (rand() - 0.5) * 0.5;
  const parts = [trunk(h + 0.6, 0.3, 0.16, "#7b5435", lean)];
  const c = new THREE.Vector3(lean, h + 0.9, 0);
  const palettes: [string, string][] = [
    ["#1f5c2a", "#86d14c"],
    ["#1d5631", "#6cc04f"],
    ["#2d6a22", "#b2d84e"],
  ];
  const [dark, light] = palettes[seed % palettes.length];
  parts.push(...canopy(rand, c, 5, 0.85, 1.05, dark, light));
  return { geometry: merge(parts), swayStart: h * 0.5, swayAmp: 0.035 };
}

export function enchantedTree(seed: number): FloraModel {
  const rand = mulberry32(seed + 77);
  const h = 2.6 + rand() * 1.2;
  const lean = (rand() - 0.5) * 0.7;
  const parts = [trunk(h + 0.5, 0.42, 0.18, "#5b4a6b", lean)];
  // Exposed roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand();
    const root = new THREE.CylinderGeometry(0.05, 0.16, 1.0, 5);
    parts.push(part(root, "#4a3a58", { pos: [Math.cos(a) * 0.35, 0.18, Math.sin(a) * 0.35], rot: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1] }));
  }
  const palettes: [string, string][] = [
    ["#1d5a6e", "#47c0b4"],
    ["#3a2f78", "#8f6bdc"],
    ["#1f5f4a", "#5fd39a"],
  ];
  const [dark, light] = palettes[seed % palettes.length];
  parts.push(...canopy(rand, new THREE.Vector3(lean, h + 1.1, 0), 6, 1.1, 1.25, dark, light));
  return { geometry: merge(parts), swayStart: h * 0.5, swayAmp: 0.03 };
}

export function pineTree(seed: number, snowy = false): FloraModel {
  const rand = mulberry32(seed + 13);
  const parts = [trunk(1.4, 0.22, 0.14, "#6b4a32")];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 1.35 - t * 0.85;
    const cone = new THREE.ConeGeometry(r, 1.5 - t * 0.35, 9, 1);
    cone.translate(0, 1.6 + i * 0.85, 0);
    const g = part(cone, (p, n) => {
      const base = new THREE.Color("#245c40").lerp(new THREE.Color("#4f9a5c"), THREE.MathUtils.clamp((p.y - 1) / 4, 0, 1));
      if (snowy && n.y > 0.35) base.lerp(new THREE.Color("#f2f7ff"), 0.85);
      return base.multiplyScalar(0.85 + rand() * 0.25);
    });
    displace(g, 0.06, 2.0, seed + i);
    parts.push(g);
  }
  return { geometry: merge(parts), swayStart: 1.5, swayAmp: 0.02 };
}

export function palmTree(seed: number): FloraModel {
  const rand = mulberry32(seed + 5);
  const height = 4.2 + rand() * 1.4;
  const bend = 0.9 + rand() * 0.8;
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bend * 0.2, height * 0.55, 0),
    new THREE.Vector3(bend, height, 0),
  );
  const tube = new THREE.TubeGeometry(curve, 10, 0.2, 7, false);
  // Taper the trunk and paint the ring segments
  const pos = tube.attributes.position as THREE.BufferAttribute;
  const segs = 10;
  const ring = 8;
  for (let s = 0; s <= segs; s++) {
    const c = curve.getPoint(s / segs);
    const k = 1.15 - (s / segs) * 0.45;
    for (let r = 0; r < ring; r++) {
      const i = s * ring + r;
      pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
    }
  }
  tube.computeVertexNormals();
  const parts = [
    part(tube, (p) => {
      const band = Math.sin(p.y * 7) > 0.2 ? 1 : 0.82;
      return new THREE.Color("#9a7449").multiplyScalar(band);
    }),
  ];
  const top = curve.getPoint(1);
  // Fronds: drooping folded strips
  const fronds = 8;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const len = 2.4 + rand() * 0.8;
    const vertices: number[] = [];
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const pt = (t: number, side: number) => {
        const w = Math.sin(Math.PI * Math.min(t * 1.2, 1)) * 0.42 * (1 - t * 0.3);
        const along = t * len;
        const droop = -t * t * 1.6 + t * 0.5;
        const x = Math.cos(a) * along - Math.sin(a) * w * side;
        const z = Math.sin(a) * along + Math.cos(a) * w * side;
        const fold = Math.abs(side) * 0.12 * (1 - t);
        return [top.x + x, top.y + droop - fold, top.z + z];
      };
      const c0 = pt(t0, 0), l0 = pt(t0, -1), r0 = pt(t0, 1);
      const c1 = pt(t1, 0), l1 = pt(t1, -1), r1 = pt(t1, 1);
      vertices.push(...l0, ...c0, ...l1, ...l1, ...c0, ...c1, ...c0, ...r0, ...c1, ...c1, ...r0, ...r1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.computeVertexNormals();
    // Reason: fronds are double-sided; force normals upward so both faces catch the sun
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(n, i);
      if (v.y < 0) v.negate();
      v.y += 0.6;
      v.normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    parts.push(part(g, gradient("#2f8a3a", "#8bd14d", top.y - 1.5, top.y + 0.3)));
  }
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.IcosahedronGeometry(0.17, 1);
    const a = i * 2.1;
    parts.push(part(nut, "#5a3b1f", { pos: [top.x + Math.cos(a) * 0.2, top.y - 0.25, top.z + Math.sin(a) * 0.2] }));
  }
  return { geometry: merge(parts), swayStart: height * 0.4, swayAmp: 0.03, doubleSided: true };
}

export function bush(seed: number, berries: THREE.ColorRepresentation | null = null): FloraModel {
  const rand = mulberry32(seed + 31);
  const parts = canopy(rand, new THREE.Vector3(0, 0.45, 0), 4, 0.5, 0.55, "#2d6f2e", "#6fbb43");
  if (berries) {
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      const y = 0.3 + rand() * 0.6;
      const r = 0.62 + rand() * 0.15;
      parts.push(part(new THREE.IcosahedronGeometry(0.08, 1), berries, { pos: [Math.cos(a) * r, y, Math.sin(a) * r] }));
    }
  }
  return { geometry: merge(parts), swayStart: 0.3, swayAmp: 0.04 };
}

export function rock(seed: number, mossy = true): FloraModel {
  const rand = mulberry32(seed + 3);
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.scale(1 + rand() * 0.4, 0.6 + rand() * 0.3, 1 + rand() * 0.3);
  displace(g, 0.22, 1.1, seed * 3.3);
  facet(g);
  const geo = part(g, (p, n) => {
    const c = new THREE.Color("#8d8680").lerp(new THREE.Color("#a49d93"), rand());
    if (n.y < -0.2) c.multiplyScalar(0.6);
    if (mossy && n.y > 0.72) c.lerp(new THREE.Color("#5c8f37"), 0.75);
    return c;
  });
  geo.translate(0, 0.25, 0);
  return { geometry: merge([geo]), swayStart: 99, swayAmp: 0 };
}

export function deadTree(seed: number): FloraModel {
  const rand = mulberry32(seed + 11);
  const parts = [trunk(2.6, 0.22, 0.08, "#3d3433", (rand() - 0.5) * 0.6)];
  for (let i = 0; i < 3; i++) {
    const y = 1.2 + i * 0.45;
    const a = rand() * Math.PI * 2;
    const br = new THREE.CylinderGeometry(0.03, 0.07, 1.0, 5);
    br.translate(0, 0.5, 0);
    parts.push(part(br, "#3d3433", { pos: [0, y, 0], rot: [Math.cos(a) * 0.9, a, Math.sin(a) * 0.9] }));
  }
  return { geometry: merge(parts), swayStart: 99, swayAmp: 0 };
}

export function mushroom(seed: number, glowing: boolean): FloraModel {
  const rand = mulberry32(seed + 17);
  const stem = new THREE.CylinderGeometry(0.07, 0.1, 0.35, 7);
  stem.translate(0, 0.17, 0);
  const cap = new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.75, 1);
  cap.translate(0, 0.33, 0);
  const capColor = glowing ? "#6ff0ff" : ["#d93a2b", "#e8873a", "#c94f9b"][Math.floor(rand() * 3)];
  const parts = [part(stem, "#f1e7d4"), part(cap, capColor)];
  if (!glowing) {
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.1 + rand() * 0.08;
      parts.push(part(new THREE.IcosahedronGeometry(0.03, 0), "#ffffff", { pos: [Math.cos(a) * r, 0.47, Math.sin(a) * r] }));
    }
  }
  return { geometry: merge(parts), swayStart: 99, swayAmp: 0 };
}
