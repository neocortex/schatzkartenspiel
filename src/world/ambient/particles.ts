/**
 * Shared building blocks for GPU particle effects: an instanced unit quad,
 * billboard GLSL helpers and a ShaderMaterial factory with the usual particle
 * settings (transparent, no depth writes, additive or normal blending).
 * Particles animate entirely in the vertex shader from the shared `uTime`.
 */

import * as THREE from "three";

/** Instance attribute arrays keyed by attribute name: [data, itemSize]. */
export type InstanceData = Record<string, [Float32Array, number]>;

/** Draw order for effects: after the (transparent) water, glows after smoke. */
export const RENDER_ORDER = { smoke: 2, glow: 3 } as const;

/** Instanced unit quad (position.xy in [-0.5, 0.5], uv in [0, 1]) with per-instance attributes. */
export function quadGeometry(count: number, attrs: InstanceData): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute("position", base.attributes.position);
  geo.setAttribute("uv", base.attributes.uv);
  for (const [name, [array, size]] of Object.entries(attrs)) {
    geo.setAttribute(name, new THREE.InstancedBufferAttribute(array, size));
  }
  geo.instanceCount = count;
  return geo;
}

/** GLSL: camera-facing quads and texture rotation. Expects the unit-quad `position` attribute. */
export const BILLBOARD_GLSL = /* glsl */ `
vec4 billboard(vec3 center, float size) {
  vec4 mv = viewMatrix * vec4(center, 1.0);
  mv.xy += position.xy * size;
  return projectionMatrix * mv;
}
vec2 rotateUv(vec2 uv, float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c) * (uv - 0.5) + 0.5;
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
`;

interface ParticleMaterialOptions {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
  additive?: boolean;
}

/** Transparent, depth-tested but non-writing particle material. */
export function particleMaterial(o: ParticleMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: o.uniforms,
    vertexShader: o.vertexShader,
    fragmentShader: o.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** Wrap geometry + material in a never-culled mesh (instances are spread far from the origin). */
export function particleMesh(geo: THREE.BufferGeometry, mat: THREE.Material, renderOrder: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return mesh;
}
