/**
 * Small plants for the challenge sets (ferns, grass tufts, flowers, reeds,
 * hanging vines) as painted, merged geometries, plus a wind-sway material and
 * a helper that scatters a geometry as one instanced mesh.
 */

import * as THREE from "three";
import { part, merge, gradient } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Bin } from "./kit";

/**
 * Vertex-coloured standard material whose vertices above `start` sway in the
 * wind (phase taken from the instance position, so neighbours differ).
 */
export function swayMaterial(bin: Bin, time: { value: number }, start: number, amp: number, doubleSided = false): THREE.MeshStandardMaterial {
  const mat = bin.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide }));
  if (amp <= 0) return mat;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = { value: new THREE.Vector2(start, amp) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform vec2 uSway;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
        vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.7 + ip.z * 0.9;
        float sway = max(position.y - uSway.x, 0.0) * uSway.y;
        transformed.x += sin(uTime * 1.5 + ph) * sway + sin(uTime * 3.3 + ph * 2.0) * sway * 0.3;
        transformed.z += cos(uTime * 1.2 + ph * 1.3) * sway * 0.6;`,
      );
  };
  return mat;
}

/** One instanced mesh drawing `geo` at every matrix. */
export function scatter(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], shadows = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(matrices.length, 1));
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = matrices.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Placement matrix with a random yaw and a uniform scale. */
export function placement(x: number, y: number, z: number, scale: number, yaw = Math.random() * Math.PI * 2, tilt = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.5, "YXZ")),
    new THREE.Vector3(scale, scale, scale),
  );
}

/** Force a double-sided leaf strip's normals upwards so both faces catch the sun. */
function upNormals(g: THREE.BufferGeometry, lift = 0.7): THREE.BufferGeometry {
  const n = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    if (v.y < 0) v.negate();
    v.y += lift;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function strip(points: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.computeVertexNormals();
  return upNormals(g);
}

/** Arching fern: fronds with saw-tooth leaflets radiating from the centre. ~0.9 tall. */
export function fernGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed + 101);
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 7 + Math.floor(rand() * 3);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.5;
    const len = 0.9 + rand() * 0.45;
    const rise = 0.55 + rand() * 0.3;
    const pts: number[] = [];
    const steps = 9;
    const at = (t: number, side: number): [number, number, number] => {
      const w = Math.sin(Math.PI * Math.min(t * 1.15, 1)) * 0.17 * (side === 0 ? 0 : 1) * (1 - t * 0.4);
      // Reason: alternate leaflet tips outward so the edge reads as a saw-tooth fern frond
      const tooth = side !== 0 && Math.round(t * steps * 2) % 2 === 0 ? 1.35 : 0.8;
      const along = t * len;
      const y = rise * Math.sin(t * Math.PI * 0.75) - t * t * 0.25;
      const x = Math.cos(a) * along - Math.sin(a) * w * side * tooth;
      const z = Math.sin(a) * along + Math.cos(a) * w * side * tooth;
      return [x, y, z];
    };
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      for (const side of [-1, 1]) {
        pts.push(...at(t0, 0), ...at(t0, side), ...at(t1, 0));
        pts.push(...at(t0, side), ...at(t1, side), ...at(t1, 0));
      }
    }
    parts.push(part(strip(pts), gradient("#2f7a30", "#8fd65a", 0, 0.8, 0.12)));
  }
  return merge(parts);
}

/** A clump of grass blades (~0.6 tall). */
export function tuftGeometry(seed: number, tall = 0.6): THREE.BufferGeometry {
  const rand = mulberry32(seed + 202);
  const pts: number[] = [];
  const blades = 9;
  for (let b = 0; b < blades; b++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.12;
    const h = tall * (0.6 + rand() * 0.6);
    const lean = 0.15 + rand() * 0.25;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const dx = Math.cos(a) * lean;
    const dz = Math.sin(a) * lean;
    const px = -Math.sin(a) * 0.035;
    const pz = Math.cos(a) * 0.035;
    pts.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + dx, h, bz + dz);
  }
  return part(strip(pts), gradient("#3b8a2c", "#b6e05a", 0, tall, 0.15));
}

/** A little flower: stem, five petals and a yellow heart (~0.35 tall). */
export function flowerGeometry(color: THREE.ColorRepresentation, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed + 303);
  const h = 0.26 + rand() * 0.14;
  const parts = [part(new THREE.CylinderGeometry(0.012, 0.016, h, 4), "#4f9a35", { pos: [0, h / 2, 0] })];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(new THREE.SphereGeometry(0.045, 6, 4), color, { pos: [Math.cos(a) * 0.05, h, Math.sin(a) * 0.05], scale: [1, 0.35, 0.7], rot: [0, -a, 0] }));
  }
  parts.push(part(new THREE.SphereGeometry(0.03, 6, 4), "#ffd23f", { pos: [0, h + 0.012, 0] }));
  const leaf = new THREE.SphereGeometry(0.05, 6, 4);
  parts.push(part(leaf, "#5fb83a", { pos: [0.04, h * 0.35, 0], scale: [1.4, 0.3, 0.6], rot: [0, 0, 0.5] }));
  return merge(parts);
}

/** Reeds with two brown cattails, for the river banks (~1.3 tall). */
export function reedGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed + 404);
  const parts: THREE.BufferGeometry[] = [];
  const pts: number[] = [];
  for (let b = 0; b < 8; b++) {
    const a = rand() * Math.PI * 2;
    const h = 0.9 + rand() * 0.5;
    const lean = 0.1 + rand() * 0.2;
    const px = -Math.sin(a) * 0.03;
    const pz = Math.cos(a) * 0.03;
    pts.push(-px, 0, -pz, px, 0, pz, Math.cos(a) * lean, h, Math.sin(a) * lean);
  }
  parts.push(part(strip(pts), gradient("#3f7f34", "#a6cf4c", 0, 1.3)));
  for (let i = 0; i < 2; i++) {
    const x = (rand() - 0.5) * 0.2;
    const z = (rand() - 0.5) * 0.2;
    const h = 1.1 + rand() * 0.3;
    parts.push(part(new THREE.CylinderGeometry(0.01, 0.012, h, 4), "#6a8a3a", { pos: [x, h / 2, z] }));
    parts.push(part(new THREE.CapsuleGeometry(0.045, 0.16, 3, 6), "#7a4a2a", { pos: [x, h - 0.05, z] }));
  }
  return merge(parts);
}

/** Leafy vine hanging straight down from its origin, `length` long. */
export function vineGeometry(length: number, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed + 505);
  const pts: THREE.Vector3[] = [];
  const n = Math.max(3, Math.round(length * 2.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(Math.sin(t * 5 + seed) * 0.12, -t * length, Math.cos(t * 4 + seed) * 0.08));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const parts = [part(new THREE.TubeGeometry(curve, n * 2, 0.025, 4, false), "#3d7a2a")];
  const leaves = Math.round(length * 6);
  for (let i = 0; i < leaves; i++) {
    const p = curve.getPoint(rand() * 0.95 + 0.03);
    const a = rand() * Math.PI * 2;
    parts.push(part(new THREE.SphereGeometry(0.075, 6, 4), rand() < 0.5 ? "#4f9e35" : "#76c043", { pos: [p.x + Math.cos(a) * 0.06, p.y, p.z + Math.sin(a) * 0.06], scale: [1, 0.3, 0.6], rot: [rand(), a, rand() * 0.6] }));
  }
  return merge(parts);
}
