/**
 * The lagoon: one big water plane whose colour comes from the analytic water
 * depth (see `HEIGHT_GLSL`), so it shows white sand and dancing caustics in
 * the shallows, glowing turquoise over the lagoon, foam where waves break on
 * the beach and on the coral reef, and deep blue sea beyond the reef. Sun
 * glints are bright enough to bloom. Where the ground is dry (including the
 * dug hole) the water is discarded.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";
import { HEIGHT_GLSL } from "./terrain";

export interface WaterUniforms {
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSky: { value: THREE.Color };
  uSunColor: { value: THREE.Color };
}

export function createLagoon(u: WaterUniforms): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(2400, 2400, 240, 240).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uSand: { value: new THREE.Color("#f4e4bd") },
        uShallow: { value: new THREE.Color("#6fe9d6") },
        uLagoon: { value: new THREE.Color("#1fc3cf") },
        uDeep: { value: new THREE.Color("#1385c2") },
        uOcean: { value: new THREE.Color("#0b4f8f") },
      },
    ]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  // Reason: share the live uniforms (time, sun, sky colour) by reference so the dusk transition reaches the water
  Object.assign(mat.uniforms, u);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  mesh.name = "lagoon";
  return mesh;
}

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
${HEIGHT_GLSL}
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float depth = -seaHeight(wp.xz);
  // Calm in the lagoon, rolling swell out on the open sea
  float amp = mix(0.03, 0.28, smoothstep(3.0, 8.0, depth));
  wp.y += (sin(wp.x * 0.16 + uTime * 0.9) * 0.6 + sin(wp.z * 0.21 - uTime * 1.1 + wp.x * 0.05) * 0.4) * amp;
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSky;
uniform vec3 uSunColor;
uniform vec3 uSand;
uniform vec3 uShallow;
uniform vec3 uLagoon;
uniform vec3 uDeep;
uniform vec3 uOcean;
varying vec3 vWPos;
${HEIGHT_GLSL}
${NOISE_GLSL}
#include <fog_pars_fragment>

float ripples(vec2 p, float t) {
  return vnoise(p * 0.8 + vec2(t * 0.35, t * 0.2)) * 0.6
       + vnoise(p * 2.0 - vec2(t * 0.25, -t * 0.4)) * 0.3
       + vnoise(p * 5.1 + vec2(-t * 0.6, t * 0.5)) * 0.1;
}

void main() {
  vec2 p = vWPos.xz;
  float ground = seaHeight(p);
  float depth = vWPos.y - ground;
  if (depth <= 0.0) discard;
  float r = islandR(p);

  // Ripple normal; calmer in the shallow lagoon
  float e = 0.08;
  float r0 = ripples(p, uTime);
  float rx = ripples(p + vec2(e, 0.0), uTime);
  float rz = ripples(p + vec2(0.0, e), uTime);
  float bump = mix(0.12, 0.26, smoothstep(1.0, 6.0, depth));
  vec3 N = normalize(vec3(-(rx - r0) / e * bump, 1.0, -(rz - r0) / e * bump));
  vec3 V = normalize(cameraPosition - vWPos);

  // Depth ramp: sand seen through clear water → turquoise → lagoon teal → deep sea blue
  vec3 col = mix(uSand, uShallow, smoothstep(0.0, 0.55, depth));
  col = mix(col, uLagoon, smoothstep(0.5, 1.7, depth));
  col = mix(col, uDeep, smoothstep(1.7, 3.2, depth));
  col = mix(col, uOcean, smoothstep(3.5, 8.5, depth));

  // Caustics dancing on the sandy floor in the shallows
  float shallow = 1.0 - smoothstep(0.15, 2.4, depth);
  col += vec3(0.85, 1.0, 0.95) * caustics(p * 0.85, uTime * 1.2) * 0.32 * shallow;

  // Sky reflection
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  col = mix(col, uSky, clamp(fres * 0.85, 0.0, 0.65));

  // Sun glints and sparkles (bright enough to bloom)
  vec3 H = normalize(normalize(uSunDir) + V);
  float spec = pow(max(dot(N, H), 0.0), 240.0);
  float sparkle = smoothstep(0.9, 0.97, vnoise(p * 6.5 + uTime * vec2(0.9, -0.7))) * pow(max(dot(N, H), 0.0), 50.0);
  col += uSunColor * (spec * 3.2 + sparkle * 2.4);

  // Beach foam: a thin lip at the waterline plus bands of surf washing in
  float wobble = vnoise(p * 1.6 + uTime * 0.35);
  float lip = 1.0 - smoothstep(0.03 + wobble * 0.05, 0.12 + wobble * 0.12, depth);
  float shore = (r - 0.86) * 11.0;
  float bands = sin(shore * 3.2 - uTime * 1.6 + fbm3(p * 0.3) * 3.0) * 0.5 + 0.5;
  float bandMask = smoothstep(0.88, 0.97, bands) * (1.0 - smoothstep(0.15, 0.7, depth)) * smoothstep(0.4, 0.9, vnoise(p * 2.2 - uTime * 0.3));
  // Breakers on the coral reef
  float reef = smoothstep(-0.75, -0.3, ground) * step(1.8, r);
  float surf = smoothstep(0.35, 0.75, vnoise(p * vec2(0.9, 1.6) + vec2(uTime * 0.6, -uTime * 0.3)) + 0.25 * sin(uTime * 2.0 + p.x * 0.3));
  float foam = max(max(lip, bandMask * 0.85), reef * surf * 0.9);
  col = mix(col, vec3(1.0), foam * 0.92);

  // Soft edge where the water meets the beach
  float alpha = max(smoothstep(0.0, 0.1, depth), foam);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;
