/**
 * Stylised water: one big plane at sea level covering ocean, lake and river.
 * Colour comes from the water depth (read from the heightfield texture), with
 * animated shore foam, rolling waves, sun glints and a fresnel sky reflection.
 */

import * as THREE from "three";
import { HF_GLSL } from "./Heightfield";
import { NOISE_GLSL } from "../core/glsl";
import { WorldUniforms } from "./Terrain";
import { WATER_LEVEL } from "./layout";

export function createWater(world: WorldUniforms, skyColor: THREE.Color): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1400, 1400, 280, 280);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uShallow: { value: new THREE.Color("#5fe0d2") },
        uMid: { value: new THREE.Color("#1fa3c4") },
        uDeep: { value: new THREE.Color("#0b4f8a") },
        uFoam: { value: new THREE.Color("#ffffff") },
        uSky: { value: skyColor.clone() },
        uSunColor: { value: new THREE.Color("#fff1d6") },
      },
    ]),
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  // Reason: share the live world uniforms (time, heightfield, sun) by reference
  Object.assign(mat.uniforms, world);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  mesh.renderOrder = 1;
  mesh.name = "water";
  return mesh;
}

const WAVES_GLSL = /* glsl */ `
float waveHeight(vec2 p, float t) {
  return sin(p.x * 0.16 + t * 0.9) * 0.5
       + sin(p.y * 0.21 - t * 1.1 + p.x * 0.05) * 0.35
       + sin((p.x + p.y) * 0.37 + t * 1.7) * 0.15;
}
`;

const WATER_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
varying float vWave;
${HF_GLSL}
${WAVES_GLSL}
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float depth = wp.y - hfHeight(wp.xz);
  // Reason: calm water near the shore keeps the foam line from swimming around
  float amp = smoothstep(0.3, 4.0, depth);
  float w = waveHeight(wp.xz, uTime);
  wp.y += w * 0.22 * amp;
  vWave = w * amp;
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
uniform vec3 uSunColor;
varying vec3 vWPos;
varying float vWave;
${HF_GLSL}
${NOISE_GLSL}
#include <fog_pars_fragment>

float ripples(vec2 p, float t) {
  return vnoise(p * 0.9 + vec2(t * 0.35, t * 0.2)) * 0.6
       + vnoise(p * 2.1 - vec2(t * 0.25, -t * 0.4)) * 0.3
       + vnoise(p * 5.3 + vec2(-t * 0.6, t * 0.5)) * 0.1;
}

void main() {
  vec2 p = vWPos.xz;
  float ground = hfHeight(p);
  float depth = max(vWPos.y - ground, 0.0);

  // Surface normal from ripple noise derivatives
  float e = 0.08;
  float r0 = ripples(p, uTime);
  float rx = ripples(p + vec2(e, 0.0), uTime);
  float rz = ripples(p + vec2(0.0, e), uTime);
  vec3 N = normalize(vec3(-(rx - r0) / e * 0.22, 1.0, -(rz - r0) / e * 0.22));
  vec3 V = normalize(cameraPosition - vWPos);

  // Depth colour ramp: turquoise shallows → teal → deep blue
  vec3 col = mix(uShallow, uMid, smoothstep(0.0, 2.2, depth));
  col = mix(col, uDeep, smoothstep(2.0, 9.0, depth));
  col *= 0.94 + vWave * 0.06;

  // Sky reflection
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  col = mix(col, uSky, clamp(fres * 0.8, 0.0, 0.6));

  // Sun specular + sparkles (bright enough to bloom)
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0);
  float sparkle = smoothstep(0.9, 0.97, vnoise(p * 7.0 + uTime * vec2(0.9, -0.7))) * pow(max(dot(N, H), 0.0), 60.0);
  col += uSunColor * (spec * 3.0 + sparkle * 2.2);

  // Distance to the shore estimated from depth and the seabed slope, so foam
  // keeps the same width on gentle beaches and steep rocks alike.
  float gx = hfHeight(p + vec2(0.6, 0.0)) - ground;
  float gz = hfHeight(p + vec2(0.0, 0.6)) - ground;
  float grad = max(length(vec2(gx, gz)) / 0.6, 0.04);
  float shoreDist = depth / grad;

  float wobble = vnoise(p * 1.7 + uTime * 0.35);
  // Reason: sandbars just under the surface are "shallow" everywhere; only foam where dry land is really close
  float land = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    land = max(land, smoothstep(-0.02, 0.06, hfHeight(p + vec2(cos(a), sin(a)) * 1.4)));
  }
  float lip = (1.0 - smoothstep(0.12 + wobble * 0.25, 0.45 + wobble * 0.35, shoreDist)) * smoothstep(0.9, 0.25, depth) * land;
  float bands = sin(shoreDist * 1.9 - uTime * 1.7 + fbm3(p * 0.3) * 3.0) * 0.5 + 0.5;
  // Reason: on near-flat lagoon floors shoreDist is unreliable and bands turn into static blobs
  float sloped = smoothstep(0.06, 0.16, grad);
  float bandMask = smoothstep(3.5, 0.8, shoreDist) * smoothstep(0.88, 0.97, bands) * smoothstep(0.8, 0.2, depth) * sloped;
  float breakup = smoothstep(0.3, 0.7, vnoise(p * 2.4 - uTime * 0.25));
  float foam = max(lip, bandMask * breakup * 0.8) * step(0.001, depth);
  col = mix(col, uFoam * 1.05, foam * 0.92);

  float alpha = mix(0.6, 1.0, smoothstep(0.05, 2.5, depth));
  alpha = max(alpha, foam);

  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;
