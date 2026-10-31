/**
 * Glowing lava: an animated shader (drifting crust plates with white-hot
 * seams, bright enough to bloom), the river ribbons that follow the carved
 * channels down to the sea, and the bubbling lava lake inside the crater.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";
import { WorldUniforms } from "../../world/Terrain";
import { ribbon } from "../../world/models/effects";
import { Course, RIVER_HALF, VOLCANO } from "./course";

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += (sin(uTime * 1.4 + wp.x * 0.7) + sin(uTime * 1.1 + wp.z * 0.9)) * 0.03;
  vWPos = wp.xyz;
  vUv = uv;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uCool;
varying vec3 vWPos;
varying vec2 vUv;
${NOISE_GLSL}
#include <fog_pars_fragment>

// Distance to the nearest edge between slowly drifting crust plates
float plates(vec2 p) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = hash22(g + o);
      h = 0.5 + 0.4 * sin(uTime * 0.5 + 6.2831 * h);
      float d = length(o + h - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

void main() {
  #ifdef FLOW
  // Rivers: uv.x across, uv.y = metres along the flow / 4
  vec2 p = vec2(vUv.x * 1.4, vUv.y - uTime * 0.55);
  #else
  vec2 p = vWPos.xz * 0.35 + vec2(uTime * 0.03, -uTime * 0.02);
  #endif
  vec2 warp = vec2(fbm3(p * 0.8 + uTime * 0.06), fbm3(p * 0.8 - uTime * 0.05 + 5.0));
  float n = fbm3(p * 1.5 + warp * 1.4 + uTime * 0.1);
  float edge = plates(p * 1.3 + warp * 0.8);
  float hot = smoothstep(0.3, 0.0, edge) * 0.8 + n * 0.55;
  #ifdef FLOW
  // Cooler crusty banks, a hot fast core
  float bank = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
  hot *= mix(0.4, 1.15, bank);
  #else
  float bub = vnoise(vWPos.xz * 0.8 + vec2(0.0, uTime * 0.4));
  hot += smoothstep(0.75, 0.95, bub) * (0.5 + 0.5 * sin(uTime * 3.0 + bub * 20.0)) * 0.45;
  #endif
  // Cooling: the seams go first, then the whole flow settles to a dull, dark red
  hot = clamp(hot, 0.0, 1.25) * mix(1.0, 0.36, uCool);
  vec3 col = mix(vec3(0.16, 0.05, 0.035), vec3(1.9, 0.26, 0.04), smoothstep(0.1, 0.4, hot));
  col = mix(col, vec3(3.6, 1.1, 0.12), smoothstep(0.42, 0.72, hot));
  col = mix(col, vec3(5.5, 3.4, 1.0), smoothstep(0.85, 1.15, hot));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

/** `cool` goes from 0 (white-hot) to 1 (the volcano has gone to rest). */
export function lavaMaterial(world: WorldUniforms, flow: boolean, cool: { value: number } = { value: 0 }): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: flow ? { FLOW: "" } : {},
    fog: true,
  });
  mat.uniforms.uTime = world.uTime;
  mat.uniforms.uCool = cool;
  return mat;
}

export interface LavaSet {
  group: THREE.Group;
  materials: THREE.Material[];
  /** Where each river pours into the sea (for steam). */
  mouths: THREE.Vector3[];
}

/** River ribbons in their channels plus the crater lake. */
export function createLava(course: Course, world: WorldUniforms, cool: { value: number }): LavaSet {
  const group = new THREE.Group();
  const flow = lavaMaterial(world, true, cool);
  const pool = lavaMaterial(world, false, cool);
  const mouths: THREE.Vector3[] = [];

  course.rivers.forEach((r, i) => {
    const ys = course.riverProfile(i);
    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    let end = r.pts.length - 1;
    // Reason: stop the ribbon where the land dips under the sea; steam takes over there
    for (let k = 0; k < r.pts.length; k++) {
      if (course.natural(r.pts[k].x, r.pts[k].y) < 0.15) {
        end = k;
        break;
      }
    }
    for (let k = 0; k <= end; k += 2) {
      const p = r.pts[k];
      const a = r.pts[Math.max(k - 2, 0)];
      const b = r.pts[Math.min(k + 2, r.pts.length - 1)];
      const t = b.clone().sub(a).normalize();
      // Narrow at the crater rim, full width once down on the plain
      const half = (RIVER_HALF + 0.35) * (0.45 + 0.55 * Math.min(1, r.s[k] / 30));
      const y = ys[k];
      left.push(new THREE.Vector3(p.x - t.y * half, y, p.y + t.x * half));
      right.push(new THREE.Vector3(p.x + t.y * half, y, p.y - t.x * half));
    }
    const geo = ribbon(left, right);
    // Reason: uv.y in metres/4 keeps the crust pattern the same size along every river
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const len = r.s[Math.min(end, r.s.length - 1)];
    for (let v = 0; v < uv.count; v++) uv.setY(v, (uv.getY(v) * len) / 4);
    const mesh = new THREE.Mesh(geo, flow);
    mesh.name = `lava-river-${i}`;
    group.add(mesh);
    const m = r.pts[end];
    mouths.push(new THREE.Vector3(m.x, 0.3, m.y));
  });

  // Crater lake
  const lake = new THREE.Mesh(new THREE.CircleGeometry(7.4, 40).rotateX(-Math.PI / 2), pool);
  lake.position.set(VOLCANO.x, VOLCANO.rim - 8.3, VOLCANO.z);
  lake.name = "crater-lake";
  group.add(lake);

  return { group, materials: [flow, pool], mouths };
}
