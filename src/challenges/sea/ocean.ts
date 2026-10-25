/**
 * The open sea in the island's water style: rolling swell (the same wave sum
 * on the GPU and in `seaHeight` for buoyancy), the island's depth colours
 * (turquoise shallows around islands and rocks, deep blue in the open),
 * whitecaps, animated shore foam, sun glints and sparkles, a fresnel sky
 * reflection, and a hole where the boat floats so no water shows inside it.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";

/** Swell components: direction (x, z), wavelength, amplitude. All roll towards +z (head-on for the boat). */
const WAVES: [number, number, number, number][] = [
  [0.12, 1, 23, 0.42],
  [-0.55, 0.84, 13.5, 0.22],
  [0.7, 0.72, 8.2, 0.12],
  [-0.25, 0.97, 5.1, 0.06],
];

const GLSL_WAVES = WAVES.map(([x, z, len, amp]) => {
  const n = Math.hypot(x, z);
  const k = (2 * Math.PI) / len;
  return `vec4(${(x / n).toFixed(4)}, ${(z / n).toFixed(4)}, ${k.toFixed(5)}, ${amp.toFixed(3)})`;
}).join(", ");

/** Height of the swell at (x, z) (shared by ocean, wake and the floating things). */
export const SEA_GLSL = /* glsl */ `
const vec4 SEA_W[4] = vec4[4](${GLSL_WAVES});
// Reason: sharpened sines (wide troughs, pointy crests) read as cartoon swell
float seaHeight(vec2 p, float t, float amp, out vec2 grad) {
  float h = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = SEA_W[i];
    float th = w.z * dot(w.xy, p) - sqrt(9.8 * w.z) * t;
    float u = clamp(0.5 + 0.5 * sin(th), 0.0, 1.0);
    float pu = pow(u, 1.6);
    h += w.w * (2.0 * pu - 1.0);
    float d = w.w * 1.6 * pow(max(u, 1e-4), 0.6) * cos(th) * w.z;
    grad += w.xy * d;
  }
  return h * amp;
}
`;

const DIRS = WAVES.map(([x, z, len, amp]) => {
  const n = Math.hypot(x, z);
  const k = (2 * Math.PI) / len;
  return { x: x / n, z: z / n, k, w: Math.sqrt(9.8 * k), amp };
});

/** JS twin of `seaHeight` (height only, full amplitude). */
export function seaHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const d of DIRS) {
    const u = Math.max(0, 0.5 + 0.5 * Math.sin(d.k * (d.x * x + d.z * z) - d.w * t));
    h += d.amp * (2 * Math.pow(u, 1.6) - 1);
  }
  return h;
}

/** Up to this many islands / rocks get shallows and shore foam. */
export const MAX_ISLES = 24;

export interface OceanUniforms {
  [name: string]: THREE.IUniform;
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  /** Ellipses (x, z, radius x, radius z); unused slots have radius 0. */
  uIsles: { value: THREE.Vector4[] };
  /** How fast the seabed drops away from each shore (depth units per world unit). */
  uIsleSlope: { value: number[] };
  /** Boat cut-out: x, z, yaw, enabled. */
  uBoat: { value: THREE.Vector4 };
}

export function oceanUniforms(sunDir: THREE.Vector3): OceanUniforms {
  return {
    uTime: { value: 0 },
    uSunDir: { value: sunDir },
    uIsles: { value: Array.from({ length: MAX_ISLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uIsleSlope: { value: new Array(MAX_ISLES).fill(0.3) },
    uBoat: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
}

/** Distance-to-shore / depth helpers shared by the ocean and the wake. */
const ISLES_GLSL = /* glsl */ `
uniform vec4 uIsles[${MAX_ISLES}];
uniform float uIsleSlope[${MAX_ISLES}];
// x: distance to the nearest shore, y: estimated water depth
vec2 shoreInfo(vec2 p) {
  float dist = 1e5;
  float depth = 14.0;
  for (int i = 0; i < ${MAX_ISLES}; i++) {
    vec4 s = uIsles[i];
    if (s.z <= 0.0) continue;
    vec2 q = (p - s.xy) / s.zw;
    float d = (length(q) - 1.0) * min(s.z, s.w);
    dist = min(dist, d);
    depth = min(depth, max(d, 0.0) * uIsleSlope[i]);
  }
  return vec2(dist, depth);
}
`;

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
varying float vH;
varying float vCalm;
${SEA_GLSL}
${ISLES_GLSL}
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 info = shoreInfo(wp.xz);
  // Reason: calm water near shores keeps the foam line still; far triangles are too big to carry waves
  float calm = smoothstep(0.4, 5.0, info.y) * (1.0 - smoothstep(90.0, 260.0, distance(wp.xz, cameraPosition.xz)));
  vec2 g;
  float h = seaHeight(wp.xz, uTime, 1.0, g);
  wp.y += h * calm;
  vH = h;
  vCalm = calm;
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uSunColor;
uniform vec4 uBoat;
varying vec3 vWPos;
varying float vH;
varying float vCalm;
${NOISE_GLSL}
${SEA_GLSL}
${ISLES_GLSL}
#include <fog_pars_fragment>

float ripples(vec2 p, float t) {
  return vnoise(p * 0.9 + vec2(t * 0.35, t * 0.2)) * 0.6
       + vnoise(p * 2.1 - vec2(t * 0.25, -t * 0.4)) * 0.3
       + vnoise(p * 5.3 + vec2(-t * 0.6, t * 0.5)) * 0.1;
}

void main() {
  vec2 p = vWPos.xz;
  // No water inside the boat's hull
  if (uBoat.w > 0.5) {
    vec2 d = p - uBoat.xy;
    float c = cos(uBoat.z), s = sin(uBoat.z);
    float lat = c * d.x - s * d.y;
    float t = -(s * d.x + c * d.y) / 2.5;
    // Reason: the hull's footprint at the waterline (pinched towards the bow, see world/models/boats.ts);
    // a cut-out larger than the hull shows the sky through the sea behind the stern
    float pinch = t > 0.0 ? 1.0 - 0.82 * smoothstep(0.25, 1.0, t) : 1.0 - 0.25 * smoothstep(0.5, 1.0, -t);
    if (abs(lat) < sqrt(max(0.8 * 0.8 - t * t, 0.0)) * pinch) discard;
  }

  vec2 info = shoreInfo(p);
  float shoreD = info.x;
  float depth = info.y;
  float camDist = distance(p, cameraPosition.xz);

  // Normal: swell gradient + ripple detail (both fade into the distance)
  vec2 g;
  seaHeight(p, uTime, 1.0, g);
  g *= vCalm;
  float e = 0.08;
  float detail = 1.0 - smoothstep(40.0, 160.0, camDist);
  float r0 = ripples(p, uTime);
  float rx = ripples(p + vec2(e, 0.0), uTime);
  float rz = ripples(p + vec2(0.0, e), uTime);
  vec3 N = normalize(vec3(-g.x - (rx - r0) / e * 0.2 * detail, 1.0, -g.y - (rz - r0) / e * 0.2 * detail));
  vec3 V = normalize(cameraPosition - vWPos);

  // Depth colour ramp like the island: turquoise shallows → teal → deep blue
  vec3 col = mix(uShallow, uMid, smoothstep(0.0, 2.4, depth));
  col = mix(col, uDeep, smoothstep(2.2, 10.0, depth));
  // Light shines through the crests
  float crest = clamp(vH * vCalm / 0.6 * 0.5 + 0.5, 0.0, 1.0);
  col = mix(col, uMid * 1.15, smoothstep(0.55, 1.0, crest) * 0.45);
  col *= 0.9 + crest * 0.14;

  // Sky reflection
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  col = mix(col, uSky, clamp(fres * 0.85, 0.0, 0.65));

  // Sun specular + sparkles (bright enough to bloom)
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 240.0);
  float sparkle = smoothstep(0.9, 0.97, vnoise(p * 6.0 + uTime * vec2(0.9, -0.7))) * pow(max(dot(N, H), 0.0), 50.0) * detail;
  col += uSunColor * (spec * 3.2 + sparkle * 2.6);

  // Whitecaps on the highest crests
  float caps = smoothstep(0.8, 0.97, crest) * smoothstep(0.5, 0.75, vnoise(p * 0.7 + uTime * vec2(0.2, 0.5))) * detail;
  // Reason: finer noise breaks the caps into lacy foam instead of smooth white blobs up close
  caps *= smoothstep(0.3, 0.6, vnoise(p * 3.3 - uTime * vec2(0.5, 0.3)));
  // Shore foam: a lip at the waterline plus bands rolling in
  float wobble = vnoise(p * 1.7 + uTime * 0.35);
  float lip = 1.0 - smoothstep(0.15 + wobble * 0.35, 0.8 + wobble * 0.6, shoreD);
  float bands = sin(shoreD * 1.7 - uTime * 1.9 + fbm3(p * 0.3) * 3.0) * 0.5 + 0.5;
  float bandMask = smoothstep(4.0, 0.8, shoreD) * smoothstep(0.86, 0.96, bands);
  float breakup = smoothstep(0.3, 0.7, vnoise(p * 2.4 - uTime * 0.25));
  float foam = max(max(lip, bandMask * breakup * 0.85), caps * 0.8);
  col = mix(col, vec3(1.0), foam * 0.92);

  float alpha = mix(0.55, 1.0, smoothstep(0.05, 2.8, depth));
  alpha = max(alpha, foam);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

/**
 * Grid with fine cells in the middle and coarse ones towards the horizon
 * (x = R·(a·u + (1-a)·u·|u|)), so one mesh reaches the horizon cheaply.
 */
function oceanGeometry(radius: number, segments: number, a: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2, 2, segments, segments);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const warp = (u: number) => radius * (a * u + (1 - a) * u * Math.abs(u));
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, warp(pos.getX(i)), 0, warp(pos.getZ(i)));
  g.computeBoundingSphere();
  return g;
}

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** Centre cell size: the mesh follows the camera in steps of this, so vertices never swim. */
  private step: number;

  constructor(
    readonly uniforms: OceanUniforms,
    skyColor: THREE.Color,
  ) {
    const radius = 1300;
    const segments = 300;
    const a = 0.1;
    this.step = (radius * a * 2) / segments;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
        uShallow: { value: new THREE.Color("#5fe0d2") },
        uMid: { value: new THREE.Color("#1fa3c4") },
        uDeep: { value: new THREE.Color("#0d5a99") },
        uSky: { value: skyColor.clone() },
        uSunColor: { value: new THREE.Color("#fff1d6") },
        ...uniforms,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new THREE.Mesh(oceanGeometry(radius, segments, a), this.material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  /** Keep the fine middle of the grid under the camera. */
  follow(x: number, z: number): void {
    this.mesh.position.set(Math.round(x / this.step) * this.step, 0, Math.round(z / this.step) * this.step);
  }
}
