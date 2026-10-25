/**
 * Bursts — short-lived particle effects (sparks, embers, dust, smoke and snow
 * puffs) simulated on the CPU and drawn as instanced camera-facing quads.
 * Two pools: additive "glow" particles (bright enough to bloom) and soft
 * normal-blended "puff" particles. One draw call per pool.
 */

import * as THREE from "three";
import { glowTexture, puffTexture } from "../../../world/ambient/textures";

export type BurstKind = "glow" | "puff";

export interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  size: [number, number];
  /** Start colour (HDR allowed for glow) and alpha. */
  color: THREE.Color;
  colorEnd?: THREE.Color;
  alpha?: number;
  gravity?: number;
  /** Velocity damping per second (0 = none). */
  drag?: number;
  spin?: number;
}

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute float aSize;
attribute vec4 aColor;
attribute float aRot;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aRot), s = sin(aRot);
  vec2 q = mat2(c, s, -s, c) * position.xy;
  mv.xy += q * aSize;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vColor = aColor;
}
`;

const GLOW_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  gl_FragColor = vec4(vColor.rgb, texture2D(uTex, vUv).a * vColor.a);
}
`;

const PUFF_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uTex, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * (0.55 + 0.45 * t.rgb), a);
}
`;

class Pool {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private aPos: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aRot: THREE.InstancedBufferAttribute;
  private live: (Particle & { age: number; rot: number })[] = [];
  private c = new THREE.Color();

  constructor(private capacity: number, kind: BurstKind) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute("position", base.attributes.position);
    this.geo.setAttribute("uv", base.attributes.uv);
    const attr = (size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = attr(3);
    this.aSize = attr(1);
    this.aColor = attr(4);
    this.aRot = attr(1);
    this.geo.setAttribute("aPos", this.aPos);
    this.geo.setAttribute("aSize", this.aSize);
    this.geo.setAttribute("aColor", this.aColor);
    this.geo.setAttribute("aRot", this.aRot);
    this.geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: kind === "glow" ? glowTexture() : puffTexture() } },
      vertexShader: VERT,
      fragmentShader: kind === "glow" ? GLOW_FRAG : PUFF_FRAG,
      transparent: true,
      depthWrite: false,
      blending: kind === "glow" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === "glow" ? 4 : 3;
  }

  add(p: Particle): void {
    if (this.live.length >= this.capacity) this.live.shift();
    this.live.push({ ...p, pos: p.pos.clone(), vel: p.vel.clone(), age: 0, rot: Math.random() * Math.PI * 2 });
  }

  update(dt: number): void {
    const list = this.live;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vel.y -= (p.gravity ?? 0) * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      p.rot += (p.spin ?? 0) * dt;
      list[n++] = p;
    }
    list.length = n;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const t = p.age / p.life;
      this.aPos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      this.aSize.setX(i, p.size[0] + (p.size[1] - p.size[0]) * Math.sqrt(t));
      this.c.copy(p.color);
      if (p.colorEnd) this.c.lerp(p.colorEnd, t);
      // Reason: quick fade-in and a soft fade-out reads better than a hard pop
      const a = (p.alpha ?? 1) * Math.min(1, t * 12) * (1 - t * t);
      this.aColor.setXYZW(i, this.c.r, this.c.g, this.c.b, a);
      this.aRot.setX(i, p.rot);
    }
    this.geo.instanceCount = n;
    for (const a of [this.aPos, this.aSize, this.aColor, this.aRot]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Bursts {
  readonly group = new THREE.Group();
  private glow = new Pool(900, "glow");
  private puff = new Pool(500, "puff");

  constructor() {
    this.group.add(this.puff.mesh, this.glow.mesh);
  }

  add(kind: BurstKind, p: Particle): void {
    (kind === "glow" ? this.glow : this.puff).add(p);
  }

  /** Fountain of bright sparks flying out from `at` (mostly upwards). */
  sparks(at: THREE.Vector3, count: number, speed: number, color: THREE.Color, size = 0.25, up = 0.6): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = Math.random();
      const v = new THREE.Vector3(Math.cos(a) * (1 - h * up), up + h * (1 - up) * 1.4, Math.sin(a) * (1 - h * up));
      v.normalize().multiplyScalar(speed * rnd(0.4, 1));
      this.glow.add({
        pos: at.clone(),
        vel: v,
        life: rnd(0.5, 1.2),
        size: [size * rnd(0.7, 1.3), size * 0.2],
        color: color.clone().multiplyScalar(rnd(0.7, 1.3)),
        gravity: 9,
        drag: 0.6,
      });
    }
  }

  /** Soft cloud puffs (smoke, dust, snow) billowing out of `at`. */
  puffs(at: THREE.Vector3, count: number, color: THREE.ColorRepresentation, size: [number, number], spread = 1, rise = 1.2, life = 1.4, alpha = 0.8): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.puff.add({
        pos: at.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.4, Math.random() * 0.3, Math.sin(a) * r * 0.4)),
        vel: new THREE.Vector3(Math.cos(a) * r * 1.6, rise * rnd(0.6, 1.4), Math.sin(a) * r * 1.6),
        life: life * rnd(0.7, 1.3),
        size: [size[0] * rnd(0.8, 1.2), size[1] * rnd(0.8, 1.2)],
        color: c.clone().multiplyScalar(rnd(0.9, 1.1)),
        alpha,
        drag: 1.8,
        spin: rnd(-0.6, 0.6),
      });
    }
  }

  /** Twinkling star sparkles (respawn, checkpoints, rewards). */
  twinkle(at: THREE.Vector3, count: number, radius: number, color: THREE.Color, size = 0.35): void {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize();
      this.glow.add({
        pos: at.clone().addScaledVector(dir, radius * Math.random() * 0.3),
        vel: dir.multiplyScalar(radius * rnd(1, 2.2)),
        life: rnd(0.6, 1.3),
        size: [size * rnd(0.6, 1.4), 0],
        color: color.clone(),
        drag: 2.5,
        gravity: -0.5,
      });
    }
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.puff.update(dt);
  }

  dispose(): void {
    this.glow.dispose();
    this.puff.dispose();
  }
}
