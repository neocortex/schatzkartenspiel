/**
 * Twinkling light in the dark: glow-worms hanging on silk threads under the
 * rock lips, mineral sparkles on the walls, and dust motes that only light up
 * when they drift through the torch's glow. All points are camera-facing
 * additive quads animated in the vertex shader (one draw call per set).
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { CaveField, CELL, COLS, ROWS } from "./layout";
import { GlowField } from "./materials";

const POINT_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aPoint;  // xyz, size
attribute vec4 aTint;   // rgb, twinkle speed
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float s = aTint.a;
  float tw = 0.55 + 0.45 * sin(uTime * s + aPoint.x * 3.1 + aPoint.z * 1.7);
  vColor = aTint.rgb * (0.4 + tw * tw * 1.2);
  vUv = uv;
  vec4 mv = viewMatrix * vec4(aPoint.xyz, 1.0);
  mv.xy += position.xy * aPoint.w * (0.75 + tw * 0.4);
  gl_Position = projectionMatrix * mv;
}`;

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uTorch;
uniform float uWindow;
attribute vec4 aSeed;  // xz in window, y fraction, seed
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float s = aSeed.w;
  vec2 xz = aSeed.xy + vec2(sin(uTime * 0.21 + s * 13.0), cos(uTime * 0.17 + s * 7.0)) * 1.4;
  // Reason: wrap into the window around the player so a few motes cover the whole cave
  xz += uWindow * floor((uCenter.xz - xz) / uWindow + 0.5);
  vec3 p = vec3(xz.x, 0.25 + aSeed.z * 2.6 + sin(uTime * 0.4 + s * 20.0) * 0.3, xz.y);
  float lit = exp(-pow(distance(p, uTorch) / 2.6, 2.0));
  vColor = vec3(1.0, 0.7, 0.4) * lit * 1.6;
  vUv = uv;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * 0.05;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, texture2D(uTex, vUv).a);
}`;

function quads(count: number, attrs: Record<string, Float32Array>): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute("position", base.attributes.position);
  geo.setAttribute("uv", base.attributes.uv);
  for (const [k, v] of Object.entries(attrs)) geo.setAttribute(k, new THREE.InstancedBufferAttribute(v, 4));
  geo.instanceCount = count;
  return geo;
}

function additive(uniforms: Record<string, THREE.IUniform>, vertexShader: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export class Sparkles {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private dustUniforms: { uCenter: { value: THREE.Vector3 }; uTorch: { value: THREE.Vector3 } };

  constructor(field: CaveField, glow: GlowField, tex: THREE.Texture, time: { value: number }, keepOut: (x: number, z: number) => boolean) {
    const rand = mulberry32(9);
    const points: number[] = [];
    const tints: number[] = [];
    const threads: THREE.Matrix4[] = [];
    const w = COLS * CELL;
    const d = ROWS * CELL;

    // Glow-worm colonies under the rock lips
    for (let colony = 0; colony < 34; colony++) {
      let cx = 0;
      let cz = 0;
      let found = false;
      for (let t = 0; t < 300 && !found; t++) {
        cx = (rand() - 0.5) * w;
        cz = (rand() - 0.5) * d;
        const o = field.openAt(cx, cz);
        found = o > -1.15 && o < -0.75 && !keepOut(cx, cz);
      }
      if (!found) continue;
      const n = 5 + Math.floor(rand() * 7);
      for (let i = 0; i < n; i++) {
        const x = cx + (rand() - 0.5) * 1.8;
        const z = cz + (rand() - 0.5) * 1.8;
        const o = field.openAt(x, z);
        if (o > -0.6 || o < -1.4) continue;
        const top = field.heightAt(x, z);
        const len = 0.4 + rand() * 1.5;
        threads.push(new THREE.Matrix4().compose(new THREE.Vector3(x, top - len / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, len, 1)));
        const c = rand() < 0.75 ? [0.15, 0.8, 1.05] : [0.35, 1.0, 0.45];
        points.push(x, top - len, z, 0.11 + rand() * 0.06);
        tints.push(c[0], c[1], c[2], 1 + rand() * 2.5);
      }
      glow.add(new THREE.Vector3(cx, field.heightAt(cx, cz) - 0.8, cz), "#5fd8e6", 3.2, 0.45);
    }

    // Mineral sparkles on the wall faces
    for (let i = 0; i < 520; i++) {
      const x = (rand() - 0.5) * w;
      const z = (rand() - 0.5) * d;
      const o = field.openAt(x, z);
      if (o > -0.15 || o < -1.6) continue;
      // Reason: nudge the point out of the rock along the field gradient so it isn't buried
      const gx = field.openAt(x + 0.2, z) - field.openAt(x - 0.2, z);
      const gz = field.openAt(x, z + 0.2) - field.openAt(x, z - 0.2);
      const gl = Math.hypot(gx, gz) || 1;
      const px = x + (gx / gl) * 0.15;
      const pz = z + (gz / gl) * 0.15;
      const warm = rand() < 0.3;
      points.push(px, field.heightAt(x, z) + 0.05, pz, 0.06 + rand() * 0.07);
      tints.push(warm ? 1.6 : 0.7, warm ? 1.1 : 1.0, warm ? 0.5 : 2.0, 2 + rand() * 4);
    }

    const pointMat = additive({ uTime: time, uTex: { value: tex } }, POINT_VERT);
    const pointMesh = new THREE.Mesh(
      quads(points.length / 4, { aPoint: new Float32Array(points), aTint: new Float32Array(tints) }),
      pointMat,
    );
    pointMesh.frustumCulled = false;
    pointMesh.renderOrder = 3;

    const threadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 0.85), transparent: true, opacity: 0.35, depthWrite: false });
    const threadGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 3);
    const threadMesh = new THREE.InstancedMesh(threadGeo, threadMat, Math.max(threads.length, 1));
    threadMesh.count = threads.length;
    threads.forEach((m, i) => threadMesh.setMatrixAt(i, m));
    threadMesh.computeBoundingSphere();

    // Dust motes around the player
    const DUST = 140;
    const WINDOW = 14;
    const seeds = new Float32Array(DUST * 4);
    for (let i = 0; i < DUST; i++) seeds.set([(rand() - 0.5) * WINDOW, (rand() - 0.5) * WINDOW, rand(), rand() * 100], i * 4);
    this.dustUniforms = { uCenter: { value: new THREE.Vector3() }, uTorch: { value: new THREE.Vector3() } };
    const dustMat = additive({ uTime: time, uTex: { value: tex }, uWindow: { value: WINDOW }, ...this.dustUniforms }, DUST_VERT);
    const dustMesh = new THREE.Mesh(quads(DUST, { aSeed: seeds }), dustMat);
    dustMesh.frustumCulled = false;
    dustMesh.renderOrder = 3;

    this.materials.push(pointMat, threadMat, dustMat);
    this.group.add(pointMesh, threadMesh, dustMesh);
  }

  update(player: THREE.Vector3, torch: THREE.Vector3): void {
    this.dustUniforms.uCenter.value.copy(player);
    this.dustUniforms.uTorch.value.copy(torch);
  }
}
