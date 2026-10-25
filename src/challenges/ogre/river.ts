/**
 * Water for the gorge, in the island's stylised look: a flowing river surface
 * coloured by depth (turquoise shallows → deep blue), with streaks drifting
 * downstream, foam along the banks and around rocks, churning white water in
 * the plunge pool, sun glints and a fresnel sky tint. Plus the waterfall
 * ribbon, its foam disc and a soft rainbow arching through the spray.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";
import { HEIGHT_GLSL, HeightBake } from "./gorgeShape";

export interface RiverUniforms {
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
}

const RIVER_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += sin(wp.x * 0.9 + uTime * 2.1) * 0.03 + sin(wp.z * 0.7 - uTime * 2.7) * 0.04;
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const RIVER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec2 uPool;
uniform float uSpeed;
varying vec3 vWPos;
${HEIGHT_GLSL}
${NOISE_GLSL}
#include <fog_pars_fragment>

// Ripples advected downstream (+z) so the river visibly flows
float ripples(vec2 p, float t) {
  vec2 q = p + vec2(0.0, -t * uSpeed);
  return vnoise(q * vec2(0.9, 0.55)) * 0.6 + vnoise(q * vec2(2.3, 1.2) + 7.0) * 0.3 + vnoise(p * 5.0 + vec2(t * 0.4, -t * 2.0)) * 0.1;
}

void main() {
  vec2 p = vWPos.xz;
  float ground = groundAt(p);
  float depth = max(vWPos.y - ground, 0.0);

  float e = 0.08;
  float r0 = ripples(p, uTime);
  float rx = ripples(p + vec2(e, 0.0), uTime);
  float rz = ripples(p + vec2(0.0, e), uTime);
  vec3 N = normalize(vec3(-(rx - r0) / e * 0.3, 1.0, -(rz - r0) / e * 0.3));
  vec3 V = normalize(cameraPosition - vWPos);

  vec3 col = mix(uShallow, uMid, smoothstep(0.0, 0.9, depth));
  col = mix(col, uDeep, smoothstep(0.8, 2.4, depth));

  // Flow streaks: long thin light lines drifting downstream
  vec2 sq = vec2(p.x * 2.2 + sin(p.y * 0.3) * 0.6, p.y * 0.25 - uTime * uSpeed * 0.3);
  float streak = smoothstep(0.62, 0.85, vnoise(sq) * 0.7 + vnoise(sq * 2.7 + 3.0) * 0.3);
  col += vec3(0.9, 1.0, 1.0) * streak * 0.22;

  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  col = mix(col, uSky, clamp(fres * 0.8, 0.0, 0.55));

  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 180.0);
  float sparkle = smoothstep(0.88, 0.97, vnoise(p * 6.0 + uTime * vec2(0.6, -1.4))) * pow(max(dot(N, H), 0.0), 40.0);
  col += vec3(1.0, 0.96, 0.85) * (spec * 2.6 + sparkle * 2.4);

  // Foam: banks and rocks (shallow water), drifting foam patches, the churning pool
  float wob = vnoise(p * 1.8 + vec2(0.0, -uTime * uSpeed * 0.6));
  float bank = 1.0 - smoothstep(0.05 + wob * 0.18, 0.32 + wob * 0.3, depth);
  vec2 fq = p * vec2(0.8, 0.45) + vec2(0.0, -uTime * uSpeed * 0.45);
  float drift = smoothstep(0.66, 0.8, fbm3(fq)) * smoothstep(0.2, 0.7, depth) * 0.75;
  float pd = length((p - uPool) * vec2(1.0, 1.4));
  float churn = smoothstep(7.0, 1.5, pd) * smoothstep(0.35, 0.65, fbm3(p * 1.3 + vec2(sin(uTime), uTime * 1.5)) + smoothstep(5.0, 0.0, pd) * 0.4);
  float foam = clamp(max(max(bank, drift), churn), 0.0, 1.0) * step(0.001, depth);
  col = mix(col, vec3(1.04), foam * 0.92);

  float alpha = mix(0.55, 0.97, smoothstep(0.05, 1.4, depth));
  alpha = max(alpha, foam);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

/** Flowing river surface (a flat plane at the water level). */
export function riverMaterial(u: RiverUniforms, bake: HeightBake, sky: THREE.Color, pool: THREE.Vector2, speed = 1.6): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uShallow: { value: new THREE.Color("#63e3d3") },
        uMid: { value: new THREE.Color("#22a9c6") },
        uDeep: { value: new THREE.Color("#0f5f96") },
        uSky: { value: sky.clone() },
        uPool: { value: pool.clone() },
        uSpeed: { value: speed },
        uBounds: { value: bake.bounds },
      },
    ]),
    vertexShader: RIVER_VERT,
    fragmentShader: RIVER_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  mat.uniforms.uTime = u.uTime;
  mat.uniforms.uSunDir = u.uSunDir;
  mat.uniforms.uHeight = { value: bake.texture };
  return mat;
}

const FALL_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec3 p = position;
  p += normal * sin(uTime * 4.0 + uv.y * 14.0 + uv.x * 5.0) * 0.07;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FALL_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  float u = vUv.x;
  float v = vUv.y;
  // Reason: streaks stretch along the fall and speed up towards the bottom (v = 1)
  float speed = uTime * (1.4 + v * 1.2);
  float s1 = vnoise(vec2(u * 18.0, v * 2.4 - speed));
  float s2 = vnoise(vec2(u * 41.0 + 3.0, v * 4.5 - speed * 1.5));
  float streak = s1 * 0.6 + s2 * 0.4;
  vec3 col = mix(vec3(0.2, 0.62, 0.86), vec3(0.92, 0.99, 1.0), smoothstep(0.32, 0.75, streak));
  float foam = smoothstep(0.78, 1.0, v) + smoothstep(0.08, 0.0, v) * 0.8;
  col = mix(col, vec3(1.08), clamp(foam, 0.0, 1.0));
  float edge = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u);
  float alpha = (0.68 + streak * 0.32) * edge;
  alpha = max(alpha, foam * edge * 0.95);
  gl_FragColor = vec4(col * 1.1, alpha);
  #include <fog_fragment>
}
`;

/** Streaky falling water for a ribbon with uv.y = 0 at the lip and 1 at the bottom. */
export function fallMaterial(u: RiverUniforms): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: FALL_VERT,
    fragmentShader: FALL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  mat.uniforms.uTime = u.uTime;
  return mat;
}

/**
 * Ribbon strip following a waterfall's profile: the water shoots out over the
 * lip and curves down (a parabola) into the pool.
 */
export function fallRibbon(lip: THREE.Vector3, bottomY: number, width: number, reach: number, rows = 24): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const drop = lip.y - bottomY;
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    const y = lip.y - drop * v;
    // Reason: x(t) ∝ sqrt(fall) traces a free-fall arc that leaves the lip horizontally
    const z = lip.z + reach * Math.sqrt(v) + 0.25 * v;
    const w = width * (1 + v * 0.35);
    for (const s of [0, 1]) {
      pos.push(lip.x + (s - 0.5) * w, y, z);
      uv.push(s, v);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rows; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const FOAM_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float a = atan(c.y, c.x);
  float rings = vnoise(vec2(a * 3.0, r * 6.0 - uTime * 1.8)) * 0.6 + vnoise(vec2(a * 7.0, r * 11.0 - uTime * 2.6)) * 0.4;
  float alpha = smoothstep(1.0, 0.3, r) * smoothstep(0.3, 0.6, rings + (1.0 - r) * 0.55);
  gl_FragColor = vec4(vec3(1.05), alpha * 0.95);
  #include <fog_fragment>
}
`;

/** Spreading foam disc where a waterfall lands. */
export function foamMaterial(u: RiverUniforms): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: FALL_VERT.replace("p += normal", "p += 0.0 * normal"),
    fragmentShader: FOAM_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  mat.uniforms.uTime = u.uTime;
  return mat;
}

/** A faint rainbow arc (flat half ring) that shimmers in the waterfall spray. */
export function rainbow(radius: number, width: number, u: RiverUniforms): THREE.Mesh {
  const geo = new THREE.RingGeometry(radius - width, radius, 64, 1, 0, Math.PI);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: u.uTime, uInner: { value: radius - width }, uOuter: { value: radius } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uInner;
      uniform float uOuter;
      varying vec2 vP;
      vec3 hue(float h) {
        return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }
      void main() {
        float r = (length(vP) - uInner) / (uOuter - uInner);
        float ang = atan(vP.y, vP.x) / 3.14159;
        vec3 col = hue(0.82 - r * 0.82);
        float edge = smoothstep(0.0, 0.18, r) * smoothstep(1.0, 0.82, r);
        float ends = smoothstep(0.0, 0.25, ang) * smoothstep(1.0, 0.75, ang);
        float shimmer = 0.75 + 0.25 * sin(uTime * 1.3 + ang * 6.0);
        gl_FragColor = vec4(col, edge * ends * shimmer * 0.32);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.ownMaterial = true;
  mesh.renderOrder = 3;
  return mesh;
}
