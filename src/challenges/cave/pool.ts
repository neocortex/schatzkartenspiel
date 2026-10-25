/**
 * The underground pool: a translucent turquoise water surface over the
 * basin in the grotto, with drifting caustic light, a glowing shoreline,
 * a warm glint where the torch reflects, and rings spreading from drips.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";
import { part, merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { CaveField } from "./layout";
import { GlowField, glowMaterial, instances, rockMaterial } from "./materials";

export const WATER_LEVEL = -0.3;
const RIPPLES = 4;

const VERT = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec3 vWPos;
void main() {
  vDepth = aDepth;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uTorch;
uniform vec4 uRipples[${RIPPLES}];
varying float vDepth;
varying vec3 vWPos;
${NOISE_GLSL}
void main() {
  float depth = vDepth;
  vec3 shallow = vec3(0.05, 0.28, 0.32);
  vec3 deep = vec3(0.01, 0.05, 0.11);
  vec3 col = mix(shallow, deep, smoothstep(0.0, 0.6, depth));
  float c = caustics(vWPos.xz * 1.1, uTime * 0.8);
  col += vec3(0.2, 0.75, 0.7) * pow(c, 4.0) * 0.5 * (1.0 - smoothstep(0.1, 0.7, depth) * 0.6);
  // Rings from falling drops
  float ring = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 1.5) continue;
    float d = distance(vWPos.xz, r.xy);
    float front = age * 1.3;
    ring += exp(-pow((d - front) * 8.0, 2.0)) * (1.0 - age / 1.5);
  }
  col += vec3(0.25, 0.7, 0.75) * ring;
  // Glowing shoreline (algae light)
  float shore = smoothstep(0.0, 0.04, depth) * (1.0 - smoothstep(0.04, 0.22, depth));
  col += vec3(0.1, 0.5, 0.45) * shore * (0.6 + 0.4 * sin(uTime * 2.0 + vWPos.x * 3.0));
  // Warm torch glint
  float t = distance(vWPos.xz, uTorch.xz);
  col += vec3(1.6, 0.8, 0.3) * exp(-t * t * 0.35) * 0.6 * (0.8 + 0.2 * vnoise(vWPos.xz * 6.0 + uTime * 2.0));
  // Reason: a soft alpha ramp lets the basin floor show through at the edges instead of a hard cut-out
  float alpha = smoothstep(0.0, 0.3, depth) * mix(0.5, 0.9, smoothstep(0.2, 0.7, depth));
  gl_FragColor = vec4(col, alpha);
}`;

export class Pool {
  readonly mesh: THREE.Mesh;
  private ripples: THREE.Vector4[] = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -10, 0));
  private next = 0;
  private uniforms: { uTime: { value: number }; uTorch: { value: THREE.Vector3 }; uRipples: { value: THREE.Vector4[] } };

  constructor(field: CaveField, center: [number, number], size: [number, number], time: { value: number }) {
    const [w, d] = size;
    const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w / 0.25), Math.ceil(d / 0.25)).rotateX(-Math.PI / 2);
    geo.translate(center[0], WATER_LEVEL, center[1]);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const depth = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) depth[i] = WATER_LEVEL - field.heightAt(pos.getX(i), pos.getZ(i));
    geo.setAttribute("aDepth", new THREE.BufferAttribute(depth, 1));
    this.uniforms = { uTime: time, uTorch: { value: new THREE.Vector3() }, uRipples: { value: this.ripples } };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.renderOrder = 1;
  }

  ripple(x: number, z: number): void {
    this.ripples[this.next].set(x, z, this.uniforms.uTime.value, 0);
    this.next = (this.next + 1) % RIPPLES;
  }

  update(torch: THREE.Vector3): void {
    this.uniforms.uTorch.value.copy(torch);
  }
}

/** Floating lily pads, some with a softly glowing blossom, drifting on the pool. */
export class LilyPads {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private pads: THREE.InstancedMesh;
  private flowers: THREE.InstancedMesh;
  private base: { x: number; z: number; yaw: number; s: number; phase: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(field: CaveField, glow: GlowField, center: [number, number], size: number) {
    const rand = mulberry32(17);
    for (let i = 0; i < 300 && this.base.length < 9; i++) {
      const x = center[0] + (rand() - 0.5) * size;
      const z = center[1] + (rand() - 0.5) * size;
      if (field.waterAt(x, z) < 0.35 || this.base.some((b) => Math.hypot(b.x - x, b.z - z) < 1)) continue;
      this.base.push({ x, z, yaw: rand() * Math.PI * 2, s: 0.7 + rand() * 0.5, phase: rand() * 10 });
    }
    // Reason: a circle with a wedge cut out is the universal "lily pad" silhouette
    const pad = merge([part(new THREE.CircleGeometry(0.42, 16, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2), (p) => new THREE.Color("#3f9a5c").lerp(new THREE.Color("#7fd08a"), Math.hypot(p.x, p.z) / 0.42))]);
    const petals: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      petals.push(part(new THREE.SphereGeometry(0.07, 6, 4).scale(1, 0.5, 2), new THREE.Color(1.1, 0.45, 0.9), { pos: [Math.cos(a) * 0.07, 0.05, Math.sin(a) * 0.07], rot: [0.5, -a + Math.PI / 2, 0] }));
    }
    petals.push(part(new THREE.SphereGeometry(0.05, 6, 4), new THREE.Color(1.4, 1.2, 0.5), { pos: [0, 0.08, 0] }));
    const flower = merge(petals);
    const padMat = rockMaterial({ roughness: 0.4, side: THREE.DoubleSide });
    const flowerMat = glowMaterial();
    this.materials.push(padMat, flowerMat);
    const ms = this.base.map(() => new THREE.Matrix4());
    this.pads = instances(pad, padMat, ms, glow, false);
    this.flowers = instances(flower, flowerMat, ms.filter((_, i) => i % 2 === 0), null, false);
    this.group.add(this.pads, this.flowers);
    pad.dispose();
    flower.dispose();
    for (const b of this.base.filter((_, i) => i % 2 === 0)) glow.add(new THREE.Vector3(b.x, WATER_LEVEL + 0.2, b.z), "#ff7ad8", 1.6, 0.6);
  }

  update(time: number): void {
    this.base.forEach((b, i) => {
      const drift = Math.sin(time * 0.3 + b.phase) * 0.12;
      this.q.setFromAxisAngle(this.up, b.yaw + Math.sin(time * 0.2 + b.phase) * 0.25);
      this.m.compose(new THREE.Vector3(b.x + drift, WATER_LEVEL + 0.02, b.z + drift * 0.6), this.q, new THREE.Vector3(b.s, 1, b.s));
      this.pads.setMatrixAt(i, this.m);
      if (i % 2 === 0) this.flowers.setMatrixAt(i / 2, this.m);
    });
    this.pads.instanceMatrix.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true;
  }
}
