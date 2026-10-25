/**
 * The enchanted air of the glade: slanted shafts of light falling through
 * the canopy, low drifting mist that pools in the hollows, blinking
 * fireflies and pale spores rising from the moss. Everything animates on
 * the GPU from the shared time uniform.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";
import { mulberry32 } from "../../core/noise";
import { BILLBOARD_GLSL, particleMaterial, particleMesh, quadGeometry, RENDER_ORDER } from "../../world/ambient/particles";
import { GLOW_FRAG } from "../../world/ambient/Smoke";
import { glowTexture } from "../../world/ambient/textures";
import { GlowField } from "../cave/materials";
import { ForestField, MAX_X, MAX_Z, MIN_X, MIN_Z } from "./layout";

/** Direction the light falls in (from the upper left, slightly away from the camera). */
export const SUN_DIR = new THREE.Vector3(0.38, -1, -0.22).normalize();

const SHAFT_VERT = /* glsl */ `
uniform float uHeight;
varying vec3 vN;
varying vec3 vWPos;
varying float vH;
void main() {
  vH = position.y / uHeight + 0.5;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SHAFT_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vN;
varying vec3 vWPos;
varying float vH;
${NOISE_GLSL}
void main() {
  vec3 V = normalize(cameraPosition - vWPos);
  // Reason: bright where the cone faces the viewer, fading at the silhouette — reads as a soft volume
  float edge = pow(abs(dot(vN, V)), 2.0);
  float fade = smoothstep(0.0, 0.3, vH) * smoothstep(1.0, 0.45, vH);
  float dust = 0.7 + 0.3 * vnoise(vec2(vWPos.x * 1.3 + vWPos.z * 0.7, vWPos.y * 0.9 - uTime * 0.35));
  gl_FragColor = vec4(uColor * edge * fade * dust * uStrength, 1.0);
}`;

const MIST_VERT = /* glsl */ `
attribute float aClear;
varying float vClear;
varying vec3 vWPos;
void main() {
  vClear = aClear;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const MIST_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uScale;
varying float vClear;
varying vec3 vWPos;
${NOISE_GLSL}
void main() {
  vec2 p = vWPos.xz * uScale;
  float n = fbm3(p + vec2(uTime * 0.05, uTime * 0.03));
  n = smoothstep(0.35, 0.85, n * 0.7 + fbm3(p * 2.3 - vec2(uTime * 0.04, 0.0)) * 0.45);
  // Reason: fade out where the ground pokes through the layer so there is no hard cut line
  float a = n * uOpacity * smoothstep(0.0, 0.45, vClear);
  gl_FragColor = vec4(uColor, a);
}`;

const FIREFLY_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aBase;  // xyz home, w seed
attribute vec3 aTint;
varying vec2 vUv;
varying vec3 vColor;
${BILLBOARD_GLSL}
void main() {
  float s = aBase.w;
  float t = uTime;
  vec3 p = aBase.xyz + vec3(
    sin(t * (0.22 + 0.12 * hash11(s)) + s * 40.0) * 1.5 + sin(t * 1.3 + s * 9.0) * 0.2,
    sin(t * 0.5 + s * 17.0) * 0.45,
    cos(t * (0.17 + 0.12 * hash11(s + 1.0)) + s * 23.0) * 1.5 + cos(t * 1.1 + s * 5.0) * 0.2
  );
  float cyc = fract(t * (0.25 + 0.25 * hash11(s + 3.0)) + hash11(s + 7.0));
  float blink = smoothstep(0.0, 0.12, cyc) * smoothstep(0.6, 0.2, cyc);
  vColor = aTint * (0.25 + blink * 3.2);
  vUv = uv;
  gl_Position = billboard(p, 0.14 + blink * 0.26);
}`;

const SPORE_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aBase;  // xz home, y ground, w seed
varying vec2 vUv;
varying vec3 vColor;
${BILLBOARD_GLSL}
void main() {
  float s = aBase.w;
  float life = fract(uTime * (0.06 + 0.05 * hash11(s)) + hash11(s + 2.0));
  vec3 p = vec3(aBase.x + sin(uTime * 0.7 + s * 30.0) * 0.4, aBase.y + life * 3.2, aBase.z + cos(uTime * 0.6 + s * 12.0) * 0.4);
  float a = smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.6, life);
  vColor = vec3(0.55, 0.95, 1.0) * a * 0.9;
  vUv = uv;
  gl_Position = billboard(p, 0.06);
}`;

export class Atmosphere {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];

  constructor(field: ForestField, glow: GlowField, time: { value: number }) {
    const rand = mulberry32(303);
    const tex = glowTexture();

    // Light shafts falling into the clearings
    const shafts: [number, number, string, number][] = [
      [-2.5, 10.5, "#ffe2a6", 0.18],
      [5.5, 3.5, "#fff0c4", 0.16],
      [-6, -6, "#bff6ff", 0.15],
      [-13.5, -2.5, "#ffe2a6", 0.15],
      [13.5, -8.5, "#d8c8ff", 0.16],
      [6, -18.5, "#bff6ff", 0.14],
      [-12, -16, "#ffe2a6", 0.14],
    ];
    for (const [x, z, color, strength] of shafts) {
      this.group.add(this.shaft(new THREE.Vector3(x, field.terrainAt(x, z), z), 1.1 + rand() * 0.6, color, strength, time));
      glow.add(new THREE.Vector3(x, 0.8, z), color, 3.2, 0.35);
    }

    // Two layers of ground mist
    this.group.add(this.mist(field, 0.3, 0.1, 0.11, "#8fb4e8", time));
    this.group.add(this.mist(field, 0.85, 0.06, 0.12, "#c2b0ff", time));

    // Fireflies over the glade
    const count = 240;
    const base = new Float32Array(count * 4);
    const tint = new Float32Array(count * 3);
    let n = 0;
    for (let tries = 0; n < count && tries < count * 50; tries++) {
      const x = MIN_X + rand() * (MAX_X - MIN_X);
      const z = MIN_Z + rand() * (MAX_Z - MIN_Z);
      if (field.openAt(x, z) < -4) continue;
      base.set([x, field.terrainAt(x, z) + 0.5 + rand() * 2.6, z, rand() * 100], n * 4);
      const r = rand();
      tint.set(r < 0.6 ? [0.75, 1.0, 0.25] : r < 0.85 ? [0.3, 1.0, 0.95] : [1.0, 0.55, 0.95], n * 3);
      n++;
    }
    const fireflyMat = particleMaterial({ uniforms: { uTime: time, uTex: { value: tex } }, vertexShader: FIREFLY_VERT, fragmentShader: GLOW_FRAG, additive: true });
    this.group.add(particleMesh(quadGeometry(n, { aBase: [base, 4], aTint: [tint, 3] }), fireflyMat, RENDER_ORDER.glow));

    // Spores rising from the moss
    const spores = 220;
    const sb = new Float32Array(spores * 4);
    let m = 0;
    for (let tries = 0; m < spores && tries < spores * 50; tries++) {
      const x = MIN_X + 6 + rand() * (MAX_X - MIN_X - 12);
      const z = MIN_Z + 6 + rand() * (MAX_Z - MIN_Z - 12);
      if (field.openAt(x, z) < -1) continue;
      sb.set([x, field.terrainAt(x, z), z, rand() * 100], m * 4);
      m++;
    }
    const sporeMat = particleMaterial({ uniforms: { uTime: time, uTex: { value: tex } }, vertexShader: SPORE_VERT, fragmentShader: GLOW_FRAG, additive: true });
    this.group.add(particleMesh(quadGeometry(m, { aBase: [sb, 4] }), sporeMat, RENDER_ORDER.glow));
    this.materials.push(fireflyMat, sporeMat);
  }

  /** A slanted, open cone of soft light from high above down to `foot`. */
  shaft(foot: THREE.Vector3, radius: number, color: THREE.ColorRepresentation, strength: number, time: { value: number }): THREE.Mesh {
    const height = 16;
    const geo = new THREE.CylinderGeometry(radius * 1.5, radius, height, 20, 1, true);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uHeight: { value: height }, uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(geo, material);
    // Reason: tilt the cone along the light direction so all shafts fall in parallel
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SUN_DIR.clone().negate());
    mesh.position.copy(foot).addScaledVector(SUN_DIR, -height / 2);
    mesh.renderOrder = 4;
    return mesh;
  }

  private mist(field: ForestField, y: number, scale: number, opacity: number, color: string, time: { value: number }): THREE.Mesh {
    const w = MAX_X - MIN_X;
    const d = MAX_Z - MIN_Z;
    const geo = new THREE.PlaneGeometry(w, d, Math.round(w), Math.round(d)).rotateX(-Math.PI / 2);
    geo.translate((MIN_X + MAX_X) / 2, y, (MIN_Z + MAX_Z) / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const clear = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) clear[i] = y - field.terrainAt(pos.getX(i), pos.getZ(i));
    geo.setAttribute("aClear", new THREE.BufferAttribute(clear, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uScale: { value: scale } },
      vertexShader: MIST_VERT,
      fragmentShader: MIST_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 2;
    return mesh;
  }
}
