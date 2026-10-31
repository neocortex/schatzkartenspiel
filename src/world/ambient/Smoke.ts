/**
 * GPU smoke and spark emitters. Every puff/spark is an instanced billboard
 * whose whole life (rise, wind drift, growth, fade) is computed in the vertex
 * shader from the shared `uTime` and a per-particle phase, so emitters cost
 * no CPU time per frame. Puffs are soft normal-blended sprites lit from above;
 * sparks are additive and bright enough to bloom.
 */

import * as THREE from "three";
import { WorldUniforms } from "../Terrain";
import { BILLBOARD_GLSL, particleMaterial, particleMesh, quadGeometry, RENDER_ORDER } from "./particles";
import { glowTexture, puffTexture } from "./textures";

/** Direction the wind blows smoke (matches the grass sway and drifting clouds). */
export const WIND = new THREE.Vector3(0.9, 0, 0.4).normalize();

export type SmokeStyle = "chimney" | "steam" | "campfire" | "smoulder" | "volcano" | "volcanoBurst" | "eruption" | "seaSteam" | "mist";

interface SmokeParams {
  /** Puffs alive per source. */
  puffs: number;
  life: number;
  /** Total height gained over a puff's life. */
  rise: number;
  /** Horizontal spread radius reached by the end of life. */
  spread: number;
  size: [number, number];
  /** Wind drift distance over a full life. */
  wind: number;
  /** Sideways wobble amplitude. */
  turb: number;
  colorA: THREE.ColorRepresentation;
  colorB: THREE.ColorRepresentation;
  opacity: number;
  /** Hot underside glow near the source (volcano). */
  glow?: THREE.ColorRepresentation;
  /** Intermittent bursts (rad/s); 0 = steady stream. */
  pulse?: number;
  /** Puffs closer to the camera than this fade out (0 = never). */
  nearFade?: number;
}

const STYLES: Record<SmokeStyle, SmokeParams> = {
  chimney: { puffs: 16, life: 7, rise: 5.5, spread: 0.7, size: [0.45, 2.6], wind: 4, turb: 0.35, colorA: "#c4c4c4", colorB: "#ececec", opacity: 0.6 },
  steam: { puffs: 12, life: 3.5, rise: 3.2, spread: 0.5, size: [0.5, 2.4], wind: 1.6, turb: 0.25, colorA: "#ffffff", colorB: "#f2f6fa", opacity: 0.45 },
  campfire: { puffs: 14, life: 5, rise: 4.5, spread: 0.45, size: [0.35, 2.2], wind: 2.5, turb: 0.3, colorA: "#5f5a55", colorB: "#c8c4bf", opacity: 0.55 },
  // A burnt beam's last wisp: thin enough to see through, for smoke standing right where Tadeo has to look
  smoulder: { puffs: 6, life: 3.4, rise: 3, spread: 0.2, size: [0.16, 0.85], wind: 1.6, turb: 0.16, colorA: "#54504c", colorB: "#b5b0aa", opacity: 0.34 },
  volcano: {
    puffs: 64, life: 20, rise: 36, spread: 7, size: [5, 22], wind: 34, turb: 3.2,
    colorA: "#2e2a29", colorB: "#d8d3cf", opacity: 0.9, glow: "#ff5a14",
  },
  // A rumble: a dark, faster cloud thrown up through the plume, only ever seen inside a birth window (see `birthWindow`)
  volcanoBurst: {
    puffs: 36, life: 8, rise: 46, spread: 8, size: [6, 25], wind: 18, turb: 3,
    colorA: "#1e1a1a", colorB: "#8d8682", opacity: 0.95, glow: "#ff6a1c",
  },
  // The real thing, seen from far out at sea: a black column, lit from below by the fire it comes out of
  eruption: {
    puffs: 60, life: 15, rise: 235, spread: 42, size: [20, 92], wind: 120, turb: 12,
    colorA: "#3d1d12", colorB: "#141112", opacity: 0.97, glow: "#ff7a24",
  },
  seaSteam: { puffs: 14, life: 6, rise: 8, spread: 2, size: [1.2, 6], wind: 6, turb: 0.8, colorA: "#f4f6f8", colorB: "#ffffff", opacity: 0.32, pulse: 0.35 },
  // Low jungle mist: big faint banks that barely rise and creep along with the wind. They fade out within
  // the follow camera's reach (≈ 15 units), so the mist hangs between the far trees and Tadeo's ground stays clear
  mist: { puffs: 5, life: 18, rise: 0.4, spread: 5, size: [8, 16], wind: 5, turb: 1, colorA: "#eef6ef", colorB: "#ffffff", opacity: 0.08, nearFade: 34 },
};

const SMOKE_VERT = /* glsl */ `
uniform float uTime;
uniform float uLife;
uniform float uRise;
uniform float uSpread;
uniform vec2 uSize;
uniform vec3 uWind;
uniform float uTurb;
uniform float uPulse;
uniform float uNearFade;
uniform vec2 uBorn;
attribute vec4 aSource;  // xyz origin, w seed
attribute vec4 aParams;  // x phase, y size multiplier, z spin, w spread angle
varying vec2 vUv;
varying vec2 vCorner;
varying float vAge;
varying float vAlpha;
${BILLBOARD_GLSL}
void main() {
  float age = fract(uTime / uLife + aParams.x);
  float seed = aSource.w;
  vec3 p = aSource.xyz;
  // Fast start that slows down as the puff cools
  p.y += uRise * (1.0 - pow(1.0 - age, 1.7));
  p.xz += vec2(cos(aParams.w), sin(aParams.w)) * uSpread * (0.25 + 0.75 * sqrt(age));
  // Reason: wind grows with height, so the column bends over instead of shifting sideways
  p += uWind * pow(age, 1.6);
  p.xz += vec2(sin(uTime * 0.6 + seed * 12.0 + age * 5.0), cos(uTime * 0.5 + seed * 7.0 + age * 4.0)) * uTurb * age;
  float size = mix(uSize.x, uSize.y, pow(age, 0.65)) * aParams.y;

  vAlpha = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.45, 1.0, age));
  float born = uTime - age * uLife;
  if (uPulse > 0.0) {
    // Intermittent sources: fade puffs by the moment they were emitted
    vAlpha *= smoothstep(0.3, 0.8, sin(born * uPulse + seed * 6.28));
  }
  vAlpha *= step(uBorn.x, born) * step(born, uBorn.y);
  vAge = age;
  vCorner = position.xy;
  // Reason: keep the spin small so the baked top-lighting of the puff stays roughly on top
  vUv = rotateUv(uv, aParams.z + age * 0.5 * sign(aParams.z));

  vec4 mv = viewMatrix * vec4(p, 1.0);
  // Reason: big puffs right in front of the camera read as flat grey discs, so close ones fade out
  if (uNearFade > 0.0) vAlpha *= smoothstep(uNearFade * 0.35, uNearFade, -mv.z);
  mv.xy += position.xy * size;
  // Reason: nudge big puffs towards the camera so they don't slice into nearby terrain
  mv.z += size * 0.3;
  gl_Position = projectionMatrix * mv;
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uGlow;
uniform float uOpacity;
varying vec2 vUv;
varying vec2 vCorner;
varying float vAge;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uTex, vUv);
  float a = tex.a * vAlpha * uOpacity;
  if (a < 0.004) discard;
  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 0.65, vAge));
  // Baked lobe lighting plus a soft top-to-bottom gradient across the puff
  col *= tex.rgb * (0.8 + 0.4 * (vCorner.y + 0.5));
  // Hot underside right above the vent (volcano only)
  col += uGlow * smoothstep(0.16, 0.0, vAge) * clamp(0.35 - vCorner.y, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

/** Ballistic spark settings. */
export interface SparkParams {
  perSource: number;
  life: number;
  /** Launch speed range (vertical). */
  up: [number, number];
  /** Max sideways launch speed. */
  lateral: number;
  gravity: number;
  size: number;
  /** Peak HDR brightness (>1 blooms). */
  intensity: number;
  wind: number;
}

export const VOLCANO_SPARKS: SparkParams = { perSource: 150, life: 2.8, up: [6, 14], lateral: 4, gravity: 7, size: 0.45, intensity: 7, wind: 2 };
const CAMPFIRE_SPARKS: SparkParams = { perSource: 10, life: 1.6, up: [1.2, 2.6], lateral: 0.4, gravity: 0.4, size: 0.12, intensity: 5, wind: 0.6 };

const SPARK_VERT = /* glsl */ `
uniform float uTime;
uniform float uLife;
uniform vec2 uUp;
uniform float uLateral;
uniform float uGravity;
uniform float uSize;
uniform float uIntensity;
uniform vec3 uWind;
attribute vec4 aSource;  // xyz origin, w seed
attribute vec4 aParams;  // x phase, y speed mix, z launch angle, w lateral mix
varying vec2 vUv;
varying vec3 vColor;
${BILLBOARD_GLSL}
void main() {
  float seed = aSource.w;
  float life = uLife * (0.6 + 0.8 * hash11(seed));
  float age = fract(uTime / life + aParams.x);
  float t = age * life;
  vec3 v = vec3(cos(aParams.z) * aParams.w * uLateral, mix(uUp.x, uUp.y, aParams.y), sin(aParams.z) * aParams.w * uLateral);
  vec3 p = aSource.xyz + v * t + uWind * t * t * 0.5;
  p.y -= 0.5 * uGravity * t * t;
  float heat = 1.0 - age;
  float flicker = 0.65 + 0.35 * sin(uTime * 23.0 + seed * 91.0);
  vColor = mix(vec3(1.0, 0.18, 0.03), vec3(1.0, 0.75, 0.3), heat * heat) * uIntensity * heat * flicker;
  vUv = uv;
  gl_Position = billboard(p, uSize * (0.45 + 0.75 * heat));
}
`;

/** Additive glow sprite (three's additive blending multiplies rgb by alpha). */
export const GLOW_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, texture2D(uTex, vUv).a);
}
`;

/** Factory for smoke columns and spark fountains at arbitrary world points. */
export class SmokeSystem {
  readonly group = new THREE.Group();

  constructor(private world: WorldUniforms) {}

  /** Add a smoke column above each point. Returns the created object (remove it to stop the smoke). */
  add(points: THREE.Vector3[], style: SmokeStyle): THREE.Object3D {
    const holder = new THREE.Group();
    holder.name = `smoke-${style}`;
    const s = STYLES[style];
    const n = points.length * s.puffs;
    const source = new Float32Array(n * 4);
    const params = new Float32Array(n * 4);
    points.forEach((pt, j) => {
      const seed = Math.random() * 100;
      for (let k = 0; k < s.puffs; k++) {
        const i = j * s.puffs + k;
        source.set([pt.x, pt.y, pt.z, seed], i * 4);
        // Reason: evenly staggered phases give a continuous stream; a little jitter hides the rhythm
        const phase = (k + Math.random() * 0.6) / s.puffs;
        params.set([phase, 0.75 + Math.random() * 0.5, (Math.random() - 0.5) * 0.7, Math.random() * Math.PI * 2], i * 4);
      }
    });
    const mat = particleMaterial({
      uniforms: {
        uTime: this.world.uTime,
        uLife: { value: s.life },
        uRise: { value: s.rise },
        uSpread: { value: s.spread },
        uSize: { value: new THREE.Vector2(...s.size) },
        uWind: { value: WIND.clone().multiplyScalar(s.wind) },
        uTurb: { value: s.turb },
        uPulse: { value: s.pulse ?? 0 },
        uNearFade: { value: s.nearFade ?? 0 },
        uBorn: { value: new THREE.Vector2(-1e9, 1e9) },
        uTex: { value: puffTexture() },
        uColorA: { value: new THREE.Color(s.colorA) },
        uColorB: { value: new THREE.Color(s.colorB) },
        uGlow: { value: s.glow ? new THREE.Color(s.glow).multiplyScalar(1.2) : new THREE.Color(0) },
        uOpacity: { value: s.opacity },
      },
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
    });
    const mesh = particleMesh(quadGeometry(n, { aSource: [source, 4], aParams: [params, 4] }), mat, RENDER_ORDER.smoke);
    holder.add(mesh);
    if (style === "campfire") holder.add(this.sparks(points, CAMPFIRE_SPARKS));
    this.group.add(holder);
    return holder;
  }

  /** Show only the puffs born between two times of `uTime`, so a column starts at its source and runs out. */
  birthWindow(smoke: THREE.Object3D, from: number, to: number): void {
    const mesh = smoke.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    mesh.material.uniforms.uBorn.value.set(from, to);
  }

  /** Fountain of glowing sparks/embers shooting up from each point (not added to the scene). */
  sparks(points: THREE.Vector3[], s: SparkParams): THREE.Mesh {
    const n = points.length * s.perSource;
    const source = new Float32Array(n * 4);
    const params = new Float32Array(n * 4);
    points.forEach((pt, j) => {
      for (let k = 0; k < s.perSource; k++) {
        const i = j * s.perSource + k;
        source.set([pt.x, pt.y, pt.z, Math.random() * 100], i * 4);
        params.set([Math.random(), Math.random(), Math.random() * Math.PI * 2, Math.sqrt(Math.random())], i * 4);
      }
    });
    const mat = particleMaterial({
      uniforms: {
        uTime: this.world.uTime,
        uLife: { value: s.life },
        uUp: { value: new THREE.Vector2(...s.up) },
        uLateral: { value: s.lateral },
        uGravity: { value: s.gravity },
        uSize: { value: s.size },
        uIntensity: { value: s.intensity },
        uWind: { value: WIND.clone().multiplyScalar(s.wind) },
        uTex: { value: glowTexture() },
      },
      vertexShader: SPARK_VERT,
      fragmentShader: GLOW_FRAG,
      additive: true,
    });
    const mesh = particleMesh(quadGeometry(n, { aSource: [source, 4], aParams: [params, 4] }), mat, RENDER_ORDER.glow);
    mesh.name = "sparks";
    return mesh;
  }
}
