/**
 * Pollen and dust motes hanging in the sunlight around the focus: tiny warm
 * sparkles drifting with the breeze that now and then catch the sun and
 * twinkle. They live in a window that wraps around the focus (like the
 * grass), so a fixed set of sprites covers the whole island.
 */

import * as THREE from "three";
import { HF_GLSL } from "../Heightfield";
import { WorldUniforms } from "../Terrain";
import { BILLBOARD_GLSL, particleMaterial, particleMesh, quadGeometry, RENDER_ORDER } from "./particles";
import { GLOW_FRAG, WIND } from "./Smoke";
import { glowTexture } from "./textures";

const COUNT = 300;
const WINDOW = 46;

const VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uCenter;
uniform float uWindow;
uniform vec2 uWind;
attribute vec4 aSeed;  // xy position in window, z height fraction, w seed
varying vec2 vUv;
varying vec3 vColor;
${HF_GLSL}
${BILLBOARD_GLSL}
void main() {
  float s = aSeed.w;
  vec2 xz = aSeed.xy + uWind * uTime * (0.3 + 0.4 * hash11(s))
          + vec2(sin(uTime * 0.31 + s * 20.0), cos(uTime * 0.27 + s * 13.0)) * 1.3;
  // Reason: wrap into the window around the focus so the motes never run out
  xz += uWindow * floor((uCenter - xz) / uWindow + 0.5);
  float ground = max(hfHeight(xz), 0.0);
  float y = ground + 0.35 + aSeed.z * aSeed.z * 5.0 + sin(uTime * 0.5 + s * 30.0) * 0.35;
  float edge = 1.0 - smoothstep(uWindow * 0.3, uWindow * 0.5, length(xz - uCenter));
  float twinkle = pow(0.5 + 0.5 * sin(uTime * (1.0 + 2.2 * hash11(s + 2.0)) + s * 50.0), 12.0);
  vColor = vec3(1.0, 0.86, 0.55) * (0.08 + twinkle * 2.6);
  vUv = uv;
  gl_Position = billboard(vec3(xz.x, y, xz.y), (0.06 + 0.1 * twinkle) * edge);
}
`;

export class Motes {
  readonly object: THREE.Mesh;
  private center = new THREE.Vector2();

  constructor(world: WorldUniforms) {
    const seeds = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      seeds.set([(Math.random() - 0.5) * WINDOW, (Math.random() - 0.5) * WINDOW, Math.random(), Math.random() * 100], i * 4);
    }
    const mat = particleMaterial({
      uniforms: {
        uTime: world.uTime,
        uHeightTex: world.uHeightTex,
        uMaskTex: world.uMaskTex,
        uCenter: { value: this.center },
        uWindow: { value: WINDOW },
        uWind: { value: new THREE.Vector2(WIND.x, WIND.z) },
        uTex: { value: glowTexture() },
      },
      vertexShader: VERT,
      fragmentShader: GLOW_FRAG,
      additive: true,
    });
    this.object = particleMesh(quadGeometry(COUNT, { aSeed: [seeds, 4] }), mat, RENDER_ORDER.glow);
    this.object.name = "motes";
  }

  update(focus: THREE.Vector3): void {
    this.center.set(focus.x, focus.z);
  }
}
