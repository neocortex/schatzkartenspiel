/**
 * Soft grass tufts covering the glade. Every tuft is an instance of one
 * small clump of tapered blades; the vertex shader sways them in the breeze
 * and bends them away from Tadeo's feet as he walks through.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { BERRIES, ForestField, MAX_X, MAX_Z, MIN_X, MIN_Z, THORNS } from "./layout";

const BLADE_H = 0.5;

function tuftGeometry(rand: () => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const base = new THREE.Color("#173f33");
  const tip = new THREE.Color("#5cb874");
  const c = new THREE.Color();
  for (let b = 0; b < 7; b++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.16;
    const h = BLADE_H * (0.55 + rand() * 0.45);
    const w = 0.035 + rand() * 0.02;
    const lean = 0.12 + rand() * 0.18;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    // Reason: blades face random directions and lean outwards like a real clump
    const fx = -Math.sin(a);
    const fz = Math.cos(a);
    const i0 = pos.length / 3;
    const rows: [number, number][] = [
      [0, w],
      [0.55, w * 0.7],
      [1, 0],
    ];
    for (const [t, half] of rows) {
      const lx = ox + Math.cos(a) * lean * t * t;
      const lz = oz + Math.sin(a) * lean * t * t;
      c.copy(base).lerp(tip, t);
      if (half > 0) {
        pos.push(lx - fx * half, h * t, lz - fz * half, lx + fx * half, h * t, lz + fz * half);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      } else {
        pos.push(lx, h, lz);
        col.push(c.r, c.g, c.b);
      }
    }
    index.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2, i0 + 2, i0 + 3, i0 + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  // Reason: up-facing normals light every blade like the ground below it (no dark backsides)
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(index);
  return geo;
}

export class Grass {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.MeshStandardMaterial;
  private player = { value: new THREE.Vector3(1e5, 0, 1e5) };

  constructor(field: ForestField, time: { value: number }) {
    const rand = mulberry32(64);
    const geo = tuftGeometry(rand);
    const matrices: THREE.Matrix4[] = [];
    const tints: THREE.Color[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const keep = [...THORNS.map((t) => ({ x: t.x, z: t.z, r: t.r * 0.7 })), ...BERRIES.map((b) => ({ x: b.x, z: b.z, r: 0.7 }))];
    for (let tries = 0; tries < 60000 && matrices.length < 9000; tries++) {
      const x = MIN_X + 6 + rand() * (MAX_X - MIN_X - 12);
      const z = MIN_Z + 6 + rand() * (MAX_Z - MIN_Z - 12);
      const open = field.openAt(x, z);
      if (open < -1.2 || field.brookAt(x, z) > 0.2) continue;
      // Reason: thinner along the trails and on the forest edge, lush in the clearings
      const trail = field.trailAt(x, z);
      if (rand() < trail * 0.85 || (open < 0.3 && rand() < 0.5)) continue;
      if (keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      const s = 0.75 + rand() * 0.6;
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x, field.terrainAt(x, z) - 0.03, z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s)));
      const r = rand();
      const k = 0.85 + rand() * 0.25;
      tints.push(r < 0.12 ? new THREE.Color(1.05 * k, 0.78 * k, 1.35 * k) : r < 0.35 ? new THREE.Color(0.75 * k, 1.0 * k, 1.1 * k) : new THREE.Color(k, k, k));
    }

    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.uniforms.uPlayer = this.player;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform vec3 uPlayer;")
        .replace(
          "#include <project_vertex>",
          `vec4 wpos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          float bendT = clamp(position.y / ${BLADE_H.toFixed(2)}, 0.0, 1.0);
          bendT *= bendT;
          vec2 wind = vec2(sin(uTime * 1.7 + wpos.x * 0.5 + wpos.z * 0.3) + 0.4 * sin(uTime * 3.1 + wpos.z * 1.3),
                           cos(uTime * 1.3 + wpos.x * 0.4)) * 0.07;
          vec2 away = wpos.xz - uPlayer.xz;
          float dist = length(away);
          vec2 push = away / max(dist, 0.001) * smoothstep(1.1, 0.25, dist) * 0.38;
          wpos.xz += (wind + push) * bendT;
          wpos.y -= length(push) * bendT * 0.6;
          vec4 mvPosition = viewMatrix * wpos;
          gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    this.material.customProgramCacheKey = () => "forest-grass";

    this.mesh = new THREE.InstancedMesh(geo, this.material, matrices.length);
    matrices.forEach((m, i) => {
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, tints[i]);
    });
    this.mesh.receiveShadow = true;
    this.mesh.computeBoundingSphere();
  }

  update(player: THREE.Vector3): void {
    this.player.value.copy(player);
  }
}
