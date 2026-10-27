/**
 * Fireflies in the enchanted forest (and over the swamp pond): glowing
 * additive sprites that drift on slow looping paths and blink on their own
 * rhythms, bright enough to bloom. Positions are scattered once over the
 * swarm's area; all the motion happens in the vertex shader.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { LANDMARKS, P2 } from "../layout";
import { WorldUniforms } from "../Terrain";
import { BILLBOARD_GLSL, particleMaterial, particleMesh, quadGeometry, RENDER_ORDER } from "./particles";
import { GLOW_FRAG } from "./Smoke";
import { glowTexture } from "./textures";
import { rnd } from "./spawn";

const COUNT = 280;
const RADIUS = 30;

const VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aBase;  // xyz home position, w seed
varying vec2 vUv;
varying vec3 vColor;
${BILLBOARD_GLSL}
void main() {
  float s = aBase.w;
  float t = uTime;
  vec3 p = aBase.xyz + vec3(
    sin(t * (0.2 + 0.12 * hash11(s)) + s * 40.0) * 1.7 + sin(t * 1.3 + s * 9.0) * 0.25,
    sin(t * 0.45 + s * 17.0) * 0.55,
    cos(t * (0.16 + 0.12 * hash11(s + 1.0)) + s * 23.0) * 1.7 + cos(t * 1.1 + s * 5.0) * 0.25
  );
  // Each firefly blinks on its own rhythm: a quick glow-up, a slower fade, then a dim pause
  float cyc = fract(t * (0.22 + 0.25 * hash11(s + 3.0)) + hash11(s + 7.0));
  float blink = smoothstep(0.0, 0.12, cyc) * smoothstep(0.55, 0.2, cyc);
  vec3 tint = mix(vec3(0.45, 1.0, 0.12), vec3(1.0, 0.85, 0.15), hash11(s + 5.0));
  vColor = tint * (0.3 + blink * 4.5);
  vUv = uv;
  gl_Position = billboard(p, 0.22 + blink * 0.4);
}
`;

/** Where a swarm lives: object name, centre, scatter radius, size, and which spots qualify. */
export interface FireflyArea {
  name: string;
  at: P2;
  radius: number;
  count: number;
  ok: (x: number, z: number) => boolean;
}

export class Fireflies {
  readonly object: THREE.Mesh;

  /** Without an `area` the swarm fills the enchanted forest. */
  constructor(hf: Heightfield, world: WorldUniforms, area?: FireflyArea) {
    const { name, at, radius, count, ok } = area ?? {
      name: "fireflies",
      at: LANDMARKS.forest,
      radius: RADIUS,
      count: COUNT,
      ok: (x: number, z: number) => hf.maskAt(x, z, 1) >= 0.45 && hf.heightAt(x, z) >= 0.4,
    };
    const base = new Float32Array(count * 4);
    let n = 0;
    for (let tries = 0; n < count && tries < count * 40; tries++) {
      const x = at[0] + rnd(-radius, radius);
      const z = at[1] + rnd(-radius, radius);
      if (!ok(x, z)) continue;
      // Reason: over water the swarm hovers above the surface, not the lake bed
      base.set([x, Math.max(hf.heightAt(x, z), 0) + rnd(0.4, 2.8), z, Math.random() * 100], n * 4);
      n++;
    }
    const mat = particleMaterial({
      uniforms: { uTime: world.uTime, uTex: { value: glowTexture() } },
      vertexShader: VERT,
      fragmentShader: GLOW_FRAG,
      additive: true,
    });
    this.object = particleMesh(quadGeometry(n, { aBase: [base, 4] }), mat, RENDER_ORDER.glow);
    this.object.name = name;
  }
}
