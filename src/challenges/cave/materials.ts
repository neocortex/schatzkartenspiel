/**
 * Cave materials and the "baked glow" trick: every glowing thing in the cave
 * (crystals, mushrooms, the pool, glow-worms, the daylight at the entrance) is
 * also registered as a glow source. Its coloured light is summed per vertex
 * (terrain) or per instance (props) into an `aGlow` attribute once, and the
 * patched standard material adds `albedo * aGlow` as emitted light. That gives
 * dozens of coloured light pools for free, leaving the real-time light budget
 * to Tadeo's torch.
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { Model } from "../../world/models/shapes";
import { patchXray } from "../../world/xray";

export interface GlowSource {
  pos: THREE.Vector3;
  color: THREE.Color;
  radius: number;
  intensity: number;
}

export class GlowField {
  readonly sources: GlowSource[] = [];

  add(pos: THREE.Vector3, color: THREE.ColorRepresentation, radius: number, intensity: number): void {
    this.sources.push({ pos: pos.clone(), color: new THREE.Color(color), radius, intensity });
  }

  /** Light arriving at point p with normal n (pass null to ignore orientation). */
  at(p: THREE.Vector3, n: THREE.Vector3 | null, out: THREE.Color): THREE.Color {
    out.setRGB(0, 0, 0);
    for (const s of this.sources) {
      const dx = s.pos.x - p.x;
      const dy = s.pos.y - p.y;
      const dz = s.pos.z - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= s.radius) continue;
      const fall = (1 - d / s.radius) ** 2;
      // Reason: surfaces facing the source catch more light; a floor keeps some ambient spill
      const facing = n && d > 1e-3 ? 0.35 + 0.65 * Math.max((n.x * dx + n.y * dy + n.z * dz) / d, 0) : 1;
      out.r += s.color.r * s.intensity * fall * facing;
      out.g += s.color.g * s.intensity * fall * facing;
      out.b += s.color.b * s.intensity * fall * facing;
    }
    return out;
  }
}

const GLOW_VERT = /* glsl */ `
attribute vec3 aGlow;
varying vec3 vGlow;
`;

/**
 * Lit, vertex-coloured rock material that adds the baked glow. `xray` cuts a
 * dithered hole where the rock hides Tadeo from the camera.
 */
export function rockMaterial(opts: { roughness?: number; xray?: boolean; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.88,
    metalness: 0,
    side: opts.side ?? THREE.FrontSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${GLOW_VERT}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;");
    if (opts.xray) patchXray(shader);
  };
  // Reason: three caches programs by onBeforeCompile source; the xray flag changes the shader
  m.customProgramCacheKey = () => `cave-rock-${opts.xray ? 1 : 0}`;
  return m;
}

/**
 * Faceted gem material: lit like a polished stone (torch glints on the facets)
 * and glowing from inside with its vertex colour. Facets that face the viewer
 * glow brighter, which reads as light refracting through the crystal.
 * `uPulse` (0..1+) lets callers brighten whole sets of gems at once.
 */
export function crystalMaterial(glow: number, time: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.18,
    metalness: 0.05,
    flatShading: true,
    emissive: "#ffffff",
    emissiveIntensity: glow,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vPulse;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
        vec3 ip = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
        #endif
        vPulse = 0.75 + 0.25 * sin(uTime * 1.7 + ip.x * 0.9 + ip.z * 0.6);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPulse;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float facing = 0.35 + 0.9 * pow(abs(normal.z), 1.5);
        totalEmissiveRadiance *= vColor.rgb * facing * vPulse;`,
      );
  };
  m.customProgramCacheKey = () => "cave-crystal";
  return m;
}

/** Unlit HDR vertex colours (values above 1 bloom): glow-worm drops, mushroom caps, flames. */
export function glowMaterial(opts: { transparent?: boolean; additive?: boolean } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: opts.transparent ?? false,
    depthWrite: !opts.additive,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
}

/** Add an `aGlow` attribute to an instanced geometry (one glow colour per instance). */
export function instanceGlow(geo: THREE.BufferGeometry, glow: GlowField, positions: THREE.Vector3[]): void {
  const data = new Float32Array(positions.length * 3);
  const c = new THREE.Color();
  positions.forEach((p, i) => {
    glow.at(p, null, c);
    data.set([c.r, c.g, c.b], i * 3);
  });
  geo.setAttribute("aGlow", new THREE.InstancedBufferAttribute(data, 3));
}

/** Instanced mesh of `geo` (cloned) at the given matrices, with baked glow per instance. */
export function instances(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  glow: GlowField | null,
  shadows = true,
): THREE.InstancedMesh {
  const g = geo.clone();
  const pos = matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  if (glow) instanceGlow(g, glow, pos);
  const mesh = new THREE.InstancedMesh(g, material, Math.max(matrices.length, 1));
  mesh.count = matrices.length;
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Merge a Model's solid and pulse parts into meshes with baked glow. */
export function modelMeshes(m: Model, glow: GlowField, time: { value: number }, owned: THREE.Material[]): THREE.Group {
  const group = new THREE.Group();
  if (m.solid.length) {
    const geo = merge(m.solid);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const data = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      glow.at(p.fromBufferAttribute(pos, i), n.fromBufferAttribute(nrm, i), c);
      data.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("aGlow", new THREE.BufferAttribute(data, 3));
    const mat = rockMaterial({ roughness: 0.8, xray: true });
    owned.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    // Reason: the torch hangs high above Tadeo, so beams and carts would throw hard black bands across the path
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (m.pulse.length) {
    const mat = crystalMaterial(1.2, time);
    owned.push(mat);
    group.add(new THREE.Mesh(merge(m.pulse), mat));
  }
  return group;
}
