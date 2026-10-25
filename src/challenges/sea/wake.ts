/**
 * The boat's foamy wake: a ribbon that remembers where the stern has been,
 * widens and fades with age, and rides on the swell (its vertices use the
 * same wave function as the ocean). Bright foam lines on both edges and a
 * churned middle right behind the boat.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";
import { SEA_GLSL } from "./ocean";

const N = 64;

const VERT = /* glsl */ `
uniform float uTime;
attribute float aAge;
attribute float aSide;
varying float vAge;
varying float vSide;
varying vec2 vP;
${SEA_GLSL}
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 g;
  wp.y = seaHeight(wp.xz, uTime, 1.0, g) + 0.05;
  vAge = aAge;
  vSide = aSide;
  vP = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
varying float vAge;
varying float vSide;
varying vec2 vP;
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  float side = abs(vSide);
  float n = vnoise(vP * 1.6 + vec2(0.0, uTime * 0.6)) * 0.6 + vnoise(vP * 4.0 - uTime * 0.4) * 0.4;
  // Two foam lines on the edges, churned water in the middle when fresh
  float edge = smoothstep(0.7, 0.88, side) * (1.0 - smoothstep(0.93, 1.0, side));
  float churn = (1.0 - smoothstep(0.0, 0.3, vAge)) * (1.0 - side * 0.7);
  float foam = max(edge * 0.95 * smoothstep(0.3, 0.6, n + (1.0 - vAge) * 0.25), churn * 0.6 * smoothstep(0.4, 0.75, n));
  float a = foam * pow(max(1.0 - vAge, 0.0), 1.4) * smoothstep(0.0, 0.04, vAge);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0), a * 0.8);
  #include <fog_fragment>
}
`;

export class Wake {
  readonly mesh: THREE.Mesh;
  private points: { x: number; z: number; dx: number; dz: number; age: number }[] = [];
  private pos: Float32Array;
  private age: Float32Array;
  private timer = 0;

  constructor(time: { value: number }, private life = 3.2) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.age = new Float32Array(N * 2).fill(1);
    const side = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
    }
    const index: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    g.setIndex(index);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAge", new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), uTime: time },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    // Reason: the wake owns its shader material; the challenge's Bin frees flagged materials
    this.mesh.userData.ownMaterial = true;
  }

  /** Feed the stern position and travel direction; `strength` 0 stops new foam (boat at rest). */
  update(dt: number, x: number, z: number, dirX: number, dirZ: number, strength: number): void {
    this.timer -= dt;
    for (const p of this.points) p.age += dt / this.life;
    if (this.timer <= 0 && strength > 0.05) {
      this.timer = 0.07;
      this.points.unshift({ x, z, dx: dirX, dz: dirZ, age: 0 });
      if (this.points.length > N) this.points.pop();
    }
    this.points = this.points.filter((p) => p.age < 1);
    // The newest point always sits right at the stern
    const head = { x, z, dx: dirX, dz: dirZ, age: 0 };
    const pts = [head, ...this.points].slice(0, N);
    for (let i = 0; i < N; i++) {
      // Reason: unused rows collapse onto the last point with its own width; widening them
      // would stretch zero-area triangles into a visible line across the sea
      const p = pts[Math.min(i, pts.length - 1)];
      const age = i < pts.length ? p.age : 1;
      const width = 0.7 + Math.sqrt(p.age) * 5.5;
      // Side vector perpendicular to the travel direction
      const sx = -p.dz;
      const sz = p.dx;
      for (const s of [0, 1]) {
        const k = (i * 2 + s) * 3;
        const sign = s ? 1 : -1;
        this.pos[k] = p.x + sx * width * sign;
        this.pos[k + 1] = 0;
        this.pos[k + 2] = p.z + sz * width * sign;
        this.age[i * 2 + s] = age;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAge.needsUpdate = true;
  }
}
