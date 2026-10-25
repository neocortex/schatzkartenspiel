/**
 * Bursts — a tiny CPU particle system for juicy one-shot effects (lever
 * sparks, gate dust, torch embers, berry sparkles, thorn leaves). Particles
 * are drawn as camera-facing instanced quads in a single draw call; their
 * position, size, colour and alpha are re-uploaded each frame.
 * Shared by several challenges (cave, forest, hens, fishing).
 */

import * as THREE from "three";

const MAX = 600;

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  size0: number;
  size1: number;
  color: THREE.Color;
  gravity: number;
  drag: number;
}

export interface BurstOptions {
  count: number;
  color: THREE.ColorRepresentation;
  /** Random speed range. */
  speed?: [number, number];
  /** Extra upward velocity. */
  up?: number;
  life?: [number, number];
  size?: [number, number];
  /** Size at the end of life relative to the start. */
  grow?: number;
  gravity?: number;
  drag?: number;
  /** Random start offset radius. */
  spread?: number;
  /** Restrict directions to the horizontal plane. */
  flat?: boolean;
}

const VERT = /* glsl */ `
attribute vec4 aPos;   // xyz, size
attribute vec4 aColor; // rgb, alpha
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = aColor;
  vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0);
  mv.xy += position.xy * aPos.w;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uTex, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a);
}`;

export class Bursts {
  readonly mesh: THREE.Mesh;
  private parts: Particle[] = [];
  private pos = new Float32Array(MAX * 4);
  private col = new Float32Array(MAX * 4);
  private posAttr: THREE.InstancedBufferAttribute;
  private colAttr: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(texture: THREE.Texture, additive = true) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute("position", quad.attributes.position);
    this.geo.setAttribute("uv", quad.attributes.uv);
    this.posAttr = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aPos", this.posAttr);
    this.geo.setAttribute("aColor", this.colAttr);
    this.geo.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  emit(at: THREE.Vector3, o: BurstOptions): void {
    const [s0, s1] = o.speed ?? [1, 3];
    const [l0, l1] = o.life ?? [0.5, 1];
    const [z0, z1] = o.size ?? [0.1, 0.2];
    const color = new THREE.Color(o.color);
    for (let i = 0; i < o.count && this.parts.length < MAX; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, o.flat ? 0 : Math.random() - 0.5, Math.random() - 0.5).normalize();
      const v = dir.multiplyScalar(s0 + Math.random() * (s1 - s0));
      v.y += o.up ?? 0;
      const spread = o.spread ?? 0;
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.5, (Math.random() - 0.5) * spread));
      const size = z0 + Math.random() * (z1 - z0);
      this.parts.push({
        p,
        v,
        age: 0,
        life: l0 + Math.random() * (l1 - l0),
        size0: size,
        size1: size * (o.grow ?? 0.2),
        color: color.clone().multiplyScalar(0.8 + Math.random() * 0.4),
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 1.5,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    const keep: Particle[] = [];
    for (const q of this.parts) {
      q.age += dt;
      if (q.age >= q.life) continue;
      q.v.y -= q.gravity * dt;
      q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      const t = q.age / q.life;
      const size = q.size0 + (q.size1 - q.size0) * t;
      // Reason: quick fade-in, long fade-out reads as a spark rather than a popping square
      const alpha = Math.min(t * 8, 1) * (1 - t) * (1 - t);
      this.pos.set([q.p.x, q.p.y, q.p.z, size], n * 4);
      this.col.set([q.color.r, q.color.g, q.color.b, alpha], n * 4);
      keep.push(q);
      n++;
    }
    this.parts = keep;
    this.geo.instanceCount = n;
    if (n) {
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
