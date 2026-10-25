/**
 * Reef pieces for the lagoon floor, each built from primitives as painted,
 * mergeable geometry (origin on the sand, up = +y): branching and brain
 * corals, tube corals, sea fans, anemones, seaweed, starfish, shells, sea
 * urchins and rocks. Swaying pieces carry an `aSway` weight per vertex
 * (0 at the root) for the current in the underwater shader.
 */

import * as THREE from "three";
import { part, displace } from "../../core/geo";
import { ball, pole, rockBlob, stoneFn, withSway } from "../../world/models/shapes";

type Rand = () => number;
type Geo = THREE.BufferGeometry;

const WHITE = new THREE.Color("#ffffff");

/** Staghorn coral: forking branches with pale, rounded tips. */
export function branchCoral(rand: Rand, color: THREE.ColorRepresentation, size: number): Geo[] {
  const parts: Geo[] = [];
  const body = new THREE.Color(color);
  const tip = body.clone().lerp(WHITE, 0.45);
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    parts.push(pole([from.x, from.y, from.z], [to.x, to.y, to.z], r, body, 6, r * 0.78));
    if (depth === 0) {
      parts.push(ball(r * 0.95, tip, [to.x, to.y, to.z], 1));
      return;
    }
    const n = 2 + (rand() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const d = dir.clone().add(new THREE.Vector3((rand() - 0.5) * 1.3, 0.2 + rand() * 0.5, (rand() - 0.5) * 1.3)).normalize();
      grow(to, d, len * (0.7 + rand() * 0.2), r * 0.78, depth - 1);
    }
  };
  const stems = 2 + Math.floor(rand() * 2);
  for (let s = 0; s < stems; s++) {
    const d = new THREE.Vector3((rand() - 0.5) * 0.6, 1, (rand() - 0.5) * 0.6).normalize();
    grow(new THREE.Vector3((rand() - 0.5) * 0.15 * size, -0.05, (rand() - 0.5) * 0.15 * size), d, 0.3 * size, 0.055 * size, 3);
  }
  return parts;
}

/** Brain coral: a squat dome with a meandering groove pattern. */
export function brainCoral(rand: Rand, color: THREE.ColorRepresentation, groove: THREE.ColorRepresentation, r: number): Geo {
  const g = new THREE.IcosahedronGeometry(r, 4);
  g.scale(1, 0.6, 1);
  displace(g, r * 0.05, 2.2 / r, rand() * 50);
  const a = new THREE.Color(color);
  const b = new THREE.Color(groove);
  const out = new THREE.Color();
  const k = 7 / r;
  const ph = rand() * 10;
  return part(g, (p) => {
    // Reason: a sine of a sine gives wavy parallel ridges that read as brain coral grooves
    const w = Math.sin(p.x * k + Math.sin(p.z * k * 0.8 + ph) * 1.8 + p.y * k * 0.5);
    out.copy(Math.abs(w) < 0.35 ? b : a);
    if (p.y < 0.05) out.multiplyScalar(0.75);
    return out;
  }, { pos: [0, r * 0.12, 0] });
}

/** Cluster of tube corals with dark openings. */
export function tubeCoral(rand: Rand, color: THREE.ColorRepresentation, count: number): Geo[] {
  const parts: Geo[] = [];
  const c = new THREE.Color(color);
  const inside = c.clone().multiplyScalar(0.35);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.08 + rand() * 0.14;
    const h = 0.18 + rand() * 0.4;
    const r = 0.045 + rand() * 0.03;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const tilt: [number, number, number] = [(rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3];
    parts.push(part(new THREE.CylinderGeometry(r * 1.15, r * 0.8, h, 9), c.clone().multiplyScalar(0.85 + rand() * 0.3), { pos: [x, h / 2 - 0.02, z], rot: tilt }));
    parts.push(part(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.02, 9), inside, { pos: [x + tilt[2] * -h * 0.5, h - 0.01, z + tilt[0] * h * 0.5], rot: tilt }));
  }
  return parts;
}

/** Sea fan: a lacy half-disc standing upright (sways). */
export function seaFan(rand: Rand, color: THREE.ColorRepresentation, size: number): Geo {
  const g = new THREE.RingGeometry(0.03, size, 18, 6, 0, Math.PI);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 4 + rand()) * 0.03);
  g.computeVertexNormals();
  const c = new THREE.Color(color);
  const dark = c.clone().multiplyScalar(0.55);
  const painted = part(g, (p) => (Math.sin(Math.atan2(p.y, p.x) * 22) > 0.4 || Math.sin(Math.hypot(p.x, p.y) * 40) > 0.6 ? dark : c), {
    rot: [0, rand() * Math.PI, 0],
  });
  return withSway(painted, (p) => Math.max(p.y, 0) * 0.07);
}

/** Anemone: a stubby column crowned with swaying tentacles (a clownfish home). */
export function anemone(rand: Rand, color: THREE.ColorRepresentation, tips: THREE.ColorRepresentation, size: number): Geo[] {
  const parts: Geo[] = [withSway(part(new THREE.CylinderGeometry(0.13 * size, 0.17 * size, 0.14 * size, 10), new THREE.Color(color).multiplyScalar(0.7), { pos: [0, 0.07 * size, 0] }), () => 0)];
  const base = new THREE.Color(color);
  const tip = new THREE.Color(tips);
  const out = new THREE.Color();
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * 3.1 + rand() * 0.3;
    const ring = (i % 3) / 3;
    const len = (0.22 + rand() * 0.12) * size;
    const cone = new THREE.CapsuleGeometry(0.018 * size, len, 2, 5);
    const lean = 0.25 + ring * 0.7;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const r0 = (0.04 + ring * 0.08) * size;
    const center = new THREE.Vector3(Math.cos(a) * r0, 0.14 * size, Math.sin(a) * r0).addScaledVector(dir, len / 2);
    cone.applyQuaternion(q);
    cone.translate(center.x, center.y, center.z);
    const g = part(cone, (p) => out.copy(base).lerp(tip, THREE.MathUtils.smoothstep(p.y, 0.14 * size, 0.14 * size + len)));
    parts.push(withSway(g, (p) => Math.max(p.y - 0.14 * size, 0) * 0.35));
  }
  return parts;
}

/** A clump of seaweed ribbons (sways a lot near the top). */
export function seaweed(rand: Rand, height: number): Geo[] {
  const parts: Geo[] = [];
  const blades = 3 + Math.floor(rand() * 4);
  const dark = new THREE.Color(rand() < 0.5 ? "#2f7a3a" : "#4a7d2c");
  const light = new THREE.Color(rand() < 0.5 ? "#8fd16a" : "#b5d86a");
  const out = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const h = height * (0.6 + rand() * 0.6);
    const g = new THREE.PlaneGeometry(0.11, h, 1, 10);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const twist = (rand() - 0.5) * 3;
    const bend = (rand() - 0.5) * 0.5;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / h;
      const x = pos.getX(i) * (1 - t * 0.5);
      const ang = twist * t;
      pos.setXYZ(i, x * Math.cos(ang) + bend * t * t, pos.getY(i), x * Math.sin(ang) + Math.sin(t * 5 + b) * 0.06);
    }
    g.computeVertexNormals();
    const a = rand() * Math.PI;
    const painted = part(g, (p) => out.copy(dark).lerp(light, THREE.MathUtils.clamp(p.y / h, 0, 1)), {
      pos: [(rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2],
      rot: [0, a, 0],
    });
    parts.push(withSway(painted, (p) => Math.pow(Math.max(p.y, 0) / height, 1.5) * 0.28));
  }
  return parts;
}

/** Five-armed starfish lying on the sand with little bumps. */
export function starfish(rand: Rand, color: THREE.ColorRepresentation, size: number): Geo[] {
  const shape = new THREE.Shape();
  const arms = 5;
  for (let i = 0; i <= arms * 2; i++) {
    const a = (i / (arms * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? size : size * 0.4;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: size * 0.12, bevelEnabled: true, bevelThickness: size * 0.1, bevelSize: size * 0.12, bevelSegments: 2, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  const c = new THREE.Color(color);
  const spin = rand() * Math.PI;
  const parts: Geo[] = [part(g, c, { pos: [0, 0.02, 0], rot: [0, spin, 0] })];
  const dot = c.clone().lerp(WHITE, 0.55);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 - spin;
    for (const k of [0.35, 0.62]) parts.push(ball(size * 0.07, dot, [Math.cos(a) * size * k, size * 0.24, -Math.sin(a) * size * k], 0));
  }
  return parts;
}

/** Scallop shell: a ribbed fan, slightly cupped. */
export function scallop(rand: Rand, color: THREE.ColorRepresentation, size: number): Geo {
  const g = new THREE.CircleGeometry(size, 12, Math.PI * 0.1, Math.PI * 0.8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    pos.setZ(i, Math.sin((r / size) * Math.PI) * size * 0.25);
  }
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2);
  const c = new THREE.Color(color);
  const rib = c.clone().lerp(WHITE, 0.5);
  return part(g, (p) => (Math.sin(Math.atan2(p.z, p.x) * 14) > 0 ? c : rib), { pos: [0, 0.03, 0], rot: [0, rand() * 6.28, 0] });
}

/** Sea urchin: dark ball with long spines. */
export function urchin(rand: Rand, size: number): Geo[] {
  const color = new THREE.Color(rand() < 0.5 ? "#3a2050" : "#1f2440");
  const parts: Geo[] = [ball(size * 0.45, color, [0, size * 0.3, 0], 1)];
  for (let i = 0; i < 22; i++) {
    const dir = new THREE.Vector3(rand() - 0.5, rand() * 0.9 + 0.05, rand() - 0.5).normalize();
    const from: [number, number, number] = [dir.x * size * 0.35, size * 0.3 + dir.y * size * 0.35, dir.z * size * 0.35];
    const to: [number, number, number] = [dir.x * size * 1.2, size * 0.3 + dir.y * size * 1.2, dir.z * size * 1.2];
    parts.push(pole(from, to, size * 0.045, color.clone().lerp(new THREE.Color("#b07ad0"), 0.25), 4, 0.002));
  }
  return parts;
}

/** Spiral snail shell lying on its side. */
export function snailShell(rand: Rand, size: number): Geo {
  const g = new THREE.ConeGeometry(size * 0.5, size * 1.3, 10, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / (size * 1.3) + 0.5;
    const a = t * 5;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setX(i, x * Math.cos(a) - z * Math.sin(a));
    pos.setZ(i, x * Math.sin(a) + z * Math.cos(a));
  }
  g.computeVertexNormals();
  const c = new THREE.Color(rand() < 0.5 ? "#ffb4a2" : "#f6d7a7");
  const band = c.clone().multiplyScalar(0.7);
  return part(g, (p) => (Math.sin(p.y * 40 / size) > 0.3 ? band : c), { pos: [0, size * 0.35, 0], rot: [0, rand() * 6.28, Math.PI / 2] });
}

/** Mossy boulder for coral clusters to grow on. */
export function reefRock(rand: Rand, size: number): Geo {
  return rockBlob(Math.floor(rand() * 1000), [size, size * 0.6, size * 0.85], stoneFn("#9a8f86", 0.45, rand), 2);
}
