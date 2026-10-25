/**
 * Soft grass and meadow flowers: instanced tufts that sway in the breeze and
 * bend away from Tadeo and the hens as they run through (the "pushers").
 * Short lawn inside the yard, taller meadow grass outside the fence.
 */

import * as THREE from "three";
import { part, merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Disposable } from "./dispose";
import { Ground } from "./ground";
import { YARD } from "./layout";

export const PUSHERS = 9;

const PROJECT_GLSL = /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
float hgt = max(position.y, 0.0);
vec2 wp = mvPosition.xz;
float gust = sin(uTime * 1.6 + wp.x * 0.32 + wp.y * 0.21) * 0.6 + sin(uTime * 2.7 - wp.x * 0.8 + wp.y * 0.5) * 0.3;
vec2 bend = vec2(0.8, 0.35) * (0.22 + gust * 0.3);
for (int i = 0; i < ${PUSHERS}; i++) {
  vec2 away = wp - uPush[i].xy;
  float d = length(away);
  bend += away / max(d, 0.001) * smoothstep(uPush[i].z, uPush[i].z * 0.25, d) * 2.4;
}
float k = hgt * hgt * 2.4;
mvPosition.xz += bend * k;
// Reason: a blade pushed far over gets shorter, so it lies down instead of stretching
mvPosition.y -= min(dot(bend, bend) * k * 0.3, hgt * 0.6);
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

export class Grass {
  readonly group = new THREE.Group();
  private pushers = Array.from({ length: PUSHERS }, () => new THREE.Vector3(999, 999, 0.01));
  private uniforms = { uTime: { value: 0 }, uPush: { value: this.pushers } };

  /**
   * @param ground Height and bare-earth lookup.
   * @param blocked True where a prop stands (no grass under it).
   */
  constructor(ground: Ground, blocked: (x: number, z: number) => boolean, owned: Disposable[]) {
    const rand = mulberry32(77);
    const material = this.windMaterial(owned);
    const tufts = new THREE.InstancedMesh(tuftGeometry(), material, 19000);
    const palette = ["#ffffff", "#ffd23f", "#ff7eb0", "#b98cff"];
    const flowers = palette.map((c) => new THREE.InstancedMesh(flowerGeometry(c), material, 320));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    let nt = 0;
    const nf = [0, 0, 0, 0];
    for (let tries = 0; tries < 60000 && nt < tufts.count; tries++) {
      const x = -28 + rand() * 56;
      const z = -27 + rand() * 42;
      const inside = x > YARD.minX - 0.3 && x < YARD.maxX + 0.3 && z > YARD.minZ - 0.3 && z < YARD.maxZ + 0.3;
      const bare = ground.dirt(x, z);
      if (bare > 0.32 || blocked(x, z)) continue;
      // Reason: thin out far meadow tufts — the camera barely sees them and they cost vertices
      const far = Math.max(Math.abs(x) - 14, -z - 12, 0);
      if (far > 0 && rand() < far / 16) continue;
      const y = ground.height(x, z);
      const s = (inside ? 0.5 + rand() * 0.35 : 0.75 + rand() * 0.45) * (1 - bare * 1.2);
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      tufts.setMatrixAt(nt, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s)));
      // Reason: tinting each tuft with the lawn colour underneath hides where the blades meet the ground
      ground.grassColor(x, z, tint).multiplyScalar(0.9 + rand() * 0.2);
      tufts.setColorAt(nt++, tint);
      // Flowers like the fence line and the meadow more than the middle of the yard
      const edge = Math.min(x - YARD.minX, YARD.maxX - x, z - YARD.minZ, YARD.maxZ - z);
      const flowerChance = inside ? (edge < 2.2 ? 0.16 : 0.03) : 0.1;
      if (rand() < flowerChance) {
        const k = Math.floor(rand() * palette.length);
        if (nf[k] < flowers[k].count) {
          const fs = 0.8 + rand() * 0.5;
          q.setFromAxisAngle(up, rand() * Math.PI * 2);
          flowers[k].setMatrixAt(nf[k]++, m.compose(new THREE.Vector3(x + 0.12, y, z + 0.08), q, new THREE.Vector3(fs, fs, fs)));
        }
      }
    }
    tufts.count = nt;
    flowers.forEach((f, k) => (f.count = nf[k]));
    for (const mesh of [tufts, ...flowers]) {
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  /** Put pusher i (Tadeo, a hen) at (x, z) with influence radius r; r = 0 switches it off. */
  setPusher(i: number, x: number, z: number, r: number): void {
    this.pushers[i].set(x, z, Math.max(r, 0.01));
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  private windMaterial(owned: Disposable[]): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uPush = this.uniforms.uPush;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\nuniform float uTime;\nuniform vec3 uPush[${PUSHERS}];`)
        .replace("#include <project_vertex>", PROJECT_GLSL);
      // Reason: blade normals point up; without this the back faces flip them down and turn dark
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        THREE.ShaderChunk.normal_fragment_begin.replace("gl_FrontFacing ? 1.0 : - 1.0", "1.0"),
      );
    };
    m.customProgramCacheKey = () => "hens-grass";
    owned.push(m);
    return m;
  }
}

/**
 * A clump of seven bent blades. Vertex colours are brightness multipliers on
 * the per-tuft lawn tint: a touch darker at the root, sunlit at the tips.
 */
function tuftGeometry(): THREE.BufferGeometry {
  const verts: number[] = [];
  const cols: number[] = [];
  const root = new THREE.Color(0.78, 0.8, 0.74);
  const tip = new THREE.Color(1.45, 1.42, 1.08);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i * 0.9;
    const lean = 0.08 + (i % 3) * 0.06;
    const h = 0.3 + (i % 4) * 0.07;
    const bx = Math.cos(a) * 0.06;
    const bz = Math.sin(a) * 0.06;
    const w = 0.05;
    const px = Math.cos(a + 1.57) * w;
    const pz = Math.sin(a + 1.57) * w;
    verts.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    cols.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  // Reason: point the blade normals upwards so both faces catch the sun like a lawn
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  return g;
}

/** A little five-petal flower on a thin stem; the head sits at about 0.36. */
function flowerGeometry(petal: THREE.ColorRepresentation): THREE.BufferGeometry {
  const parts = [part(new THREE.CylinderGeometry(0.008, 0.012, 0.36, 4), "#3f7a2a", { pos: [0, 0.18, 0] })];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(new THREE.SphereGeometry(0.04, 6, 4), petal, { pos: [Math.cos(a) * 0.045, 0.37, Math.sin(a) * 0.045], scale: [1.3, 0.35, 0.8], rot: [0, -a, 0] }));
  }
  parts.push(part(new THREE.SphereGeometry(0.028, 6, 4), "#ffb21e", { pos: [0, 0.385, 0], scale: [1, 0.6, 1] }));
  const g = merge(parts);
  g.deleteAttribute("uv");
  return g;
}
