/**
 * Juicy effects for the challenges: CPU-simulated billboard particles drawn as
 * one instanced mesh per blend mode (soft puffs, cartoon stars, rings and
 * velocity-stretched sparks), flat shockwave rings on the ground or water,
 * and presets for hits, dust clouds, splashes and healing sparkles.
 */

import * as THREE from "three";
import { Bin, rand } from "./kit";

export const SHAPE = { dot: 0, star: 1, ring: 2, spark: 3 } as const;

export interface Emit {
  at: THREE.Vector3;
  count: number;
  /** Initial speed range. */
  speed: [number, number];
  /** Preferred direction (normalised internally); omitted = all directions. */
  dir?: THREE.Vector3;
  /** 0 = exactly along `dir`, 1 = anywhere in the hemisphere around it, 2 = full sphere. */
  spread?: number;
  /** Random start offset radius. */
  jitter?: number;
  gravity?: number;
  /** Velocity damping per second. */
  drag?: number;
  life: [number, number];
  size: [number, number];
  color: THREE.ColorRepresentation | THREE.ColorRepresentation[];
  colorEnd?: THREE.ColorRepresentation;
  alpha?: number;
  shape?: number;
  spin?: number;
  /** Multiply colour (HDR glow for bloom). */
  intensity?: number;
}

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iColor;
attribute vec3 iMisc; // size, rotation, shape
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
void main() {
  vUv = uv;
  vColor = iColor;
  vShape = iMisc.z;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 p = position.xy * iMisc.x;
  if (iMisc.z > 2.5) {
    // Reason: sparks stretch along their screen-space velocity so they read as streaks
    vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
    float len = length(vv.xy);
    vec2 ax = len > 1e-3 ? vv.xy / len : vec2(0.0, 1.0);
    vec2 side = vec2(-ax.y, ax.x);
    p = side * position.x * iMisc.x * 0.35 + ax * position.y * iMisc.x * (1.0 + len * 0.09);
  } else {
    float c = cos(iMisc.y), s = sin(iMisc.y);
    p = mat2(c, s, -s, c) * p;
  }
  mv.xy += p;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float a;
  if (vShape < 0.5) {
    a = pow(clamp(1.0 - r, 0.0, 1.0), 1.6);
  } else if (vShape < 1.5) {
    float ang = atan(c.y, c.x);
    float star = 0.42 + 0.58 * pow(abs(cos(ang * 2.5)), 6.0);
    a = smoothstep(star, star - 0.12, r) + pow(clamp(1.0 - r, 0.0, 1.0), 3.0) * 0.6;
  } else if (vShape < 2.5) {
    a = smoothstep(0.16, 0.0, abs(r - 0.78)) * step(r, 1.0);
  } else {
    a = pow(clamp(1.0 - r, 0.0, 1.0), 1.2);
  }
  a = clamp(a, 0.0, 1.0) * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}
`;

/** A pool of billboard particles rendered in one draw call. */
export class Particles {
  readonly mesh: THREE.Mesh;
  private n = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private misc: Float32Array;
  // Simulation state (struct of arrays)
  private age: Float32Array;
  private life: Float32Array;
  private sz: Float32Array; // start, end
  private c0: Float32Array; // start rgb + alpha
  private c1: Float32Array; // end rgb
  private phys: Float32Array; // gravity, drag, spin
  private attrs: THREE.InstancedBufferAttribute[];
  private geo: THREE.InstancedBufferGeometry;

  constructor(
    private max: number,
    additive: boolean,
    bin: Bin,
  ) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.misc = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.sz = new Float32Array(max * 2);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 3);
    this.phys = new Float32Array(max * 3);
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute("position", base.attributes.position);
    this.geo.setAttribute("uv", base.attributes.uv);
    this.attrs = [
      new THREE.InstancedBufferAttribute(this.pos, 3),
      new THREE.InstancedBufferAttribute(this.vel, 3),
      new THREE.InstancedBufferAttribute(this.col, 4),
      new THREE.InstancedBufferAttribute(this.misc, 3),
    ];
    ["iPos", "iVel", "iColor", "iMisc"].forEach((name, i) => {
      this.attrs[i].setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, this.attrs[i]);
    });
    this.geo.instanceCount = 0;
    const mat = bin.material(
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
  }

  emit(e: Emit): void {
    const colors = (Array.isArray(e.color) ? e.color : [e.color]).map((c) => new THREE.Color(c));
    const end = e.colorEnd !== undefined ? new THREE.Color(e.colorEnd) : null;
    const dir = e.dir ? e.dir.clone().normalize() : null;
    const spread = e.spread ?? 1;
    const v = new THREE.Vector3();
    const k = e.intensity ?? 1;
    for (let c = 0; c < e.count; c++) {
      if (this.n >= this.max) return;
      const i = this.n++;
      // Random direction, biased towards `dir` by `spread`
      v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      if (v.lengthSq() < 1e-4) v.set(0, 1, 0);
      v.normalize();
      if (dir) {
        if (spread <= 1 && v.dot(dir) < 0) v.reflect(dir);
        v.lerp(dir, 1 - Math.min(spread, 1)).normalize();
      }
      const speed = rand(e.speed[0], e.speed[1]);
      const j = e.jitter ?? 0;
      this.pos.set([e.at.x + rand(-j, j), e.at.y + rand(-j, j) * 0.5, e.at.z + rand(-j, j)], i * 3);
      this.vel.set([v.x * speed, v.y * speed, v.z * speed], i * 3);
      this.age[i] = 0;
      this.life[i] = rand(e.life[0], e.life[1]);
      this.sz[i * 2] = e.size[0] * rand(0.75, 1.25);
      this.sz[i * 2 + 1] = e.size[1];
      const col = colors[Math.floor(Math.random() * colors.length)];
      this.c0.set([col.r * k, col.g * k, col.b * k, e.alpha ?? 1], i * 4);
      const ce = end ?? col;
      this.c1.set([ce.r * k, ce.g * k, ce.b * k], i * 3);
      this.phys.set([e.gravity ?? 0, e.drag ?? 0, (e.spin ?? 0) * rand(-1, 1)], i * 3);
      this.misc.set([this.sz[i * 2], Math.random() * 6.28, e.shape ?? SHAPE.dot], i * 3);
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      const t = this.age[i] / this.life[i];
      const g = this.phys[i * 3];
      const drag = Math.exp(-this.phys[i * 3 + 1] * dt);
      const o = i * 3;
      this.vel[o] *= drag;
      this.vel[o + 1] = this.vel[o + 1] * drag - g * dt;
      this.vel[o + 2] *= drag;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.misc[o] = this.sz[i * 2] + (this.sz[i * 2 + 1] - this.sz[i * 2]) * t;
      this.misc[o + 1] += this.phys[o + 2] * dt;
      // Reason: quick fade-in avoids popping, smooth fade-out at the end of life
      const fade = Math.min(this.age[i] / 0.05, 1) * (1 - t * t);
      const c = i * 4;
      for (let ch = 0; ch < 3; ch++) this.col[c + ch] = this.c0[c + ch] + (this.c1[o + ch] - this.c0[c + ch]) * t;
      this.col[c + 3] = this.c0[c + 3] * fade;
      i++;
    }
    this.geo.instanceCount = this.n;
    for (const a of this.attrs) a.needsUpdate = true;
  }

  /** Move the last particle into slot i. */
  private kill(i: number): void {
    const last = --this.n;
    if (i === last) return;
    const copy = (arr: Float32Array, size: number) => arr.copyWithin(i * size, last * size, last * size + size);
    copy(this.pos, 3);
    copy(this.vel, 3);
    copy(this.col, 4);
    copy(this.misc, 3);
    copy(this.c0, 4);
    copy(this.c1, 3);
    copy(this.phys, 3);
    copy(this.sz, 2);
    this.age[i] = this.age[last];
    this.life[i] = this.life[last];
  }
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  size: number;
}

/** Particle presets plus expanding flat rings, all in one group. */
export class Fx {
  readonly group = new THREE.Group();
  readonly glow: Particles;
  readonly puff: Particles;
  private rings: Ring[] = [];
  private ringGeo = new THREE.RingGeometry(0.82, 1, 48, 1).rotateX(-Math.PI / 2);

  constructor(private bin: Bin) {
    this.glow = new Particles(1400, true, bin);
    this.puff = new Particles(900, false, bin);
    this.group.add(this.glow.mesh, this.puff.mesh);
    bin.other(this.ringGeo);
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.puff.update(dt);
    this.rings = this.rings.filter((r) => {
      r.age += dt;
      const t = Math.min(r.age / r.life, 1);
      const s = r.size * (0.15 + (1 - Math.pow(1 - t, 3)) * 0.85);
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (1 - t);
      if (t >= 1) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }

  /** Flat ring expanding on the ground / water. */
  ring(at: THREE.Vector3, size: number, color: THREE.ColorRepresentation = "#ffffff", life = 0.6, additive = false): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(at);
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.rings.push({ mesh, age: 0, life, size });
  }

  /** Big cartoon hit: white flash, hot sparks, golden stars. */
  hit(at: THREE.Vector3, color: THREE.ColorRepresentation = "#ffd23f", power = 1): void {
    this.glow.emit({ at, count: 1, speed: [0, 0], life: [0.16, 0.16], size: [2.6 * power, 4.2 * power], color: "#ffffff", intensity: 3 });
    this.glow.emit({ at, count: Math.round(26 * power), speed: [5, 12 * power], spread: 2, drag: 3, gravity: 9, life: [0.25, 0.55], size: [0.32, 0.05], color: [color, "#ffffff", "#ffb347"], intensity: 4, shape: SHAPE.spark });
    this.glow.emit({ at, count: Math.round(8 * power), speed: [2.5, 5.5], spread: 2, drag: 2.5, gravity: 3, life: [0.45, 0.8], size: [0.55, 0.1], color: ["#ffe066", "#ffffff"], intensity: 2.2, shape: SHAPE.star, spin: 8 });
  }

  /** Soft beige dust clouds rolling out from a point on the ground. */
  dust(at: THREE.Vector3, radius = 1, count = 14, color: THREE.ColorRepresentation = "#e8d6b0"): void {
    this.puff.emit({ at, count, speed: [1.5 * radius, 3.5 * radius], dir: new THREE.Vector3(0, 0.35, 0), spread: 1, drag: 3.2, gravity: -0.6, life: [0.6, 1.1], size: [0.6 * radius, 1.6 * radius], color, alpha: 0.75, spin: 1.5 });
  }

  /** Water splash: droplets arcing up and falling, white foam puffs, ring on the surface. */
  splash(at: THREE.Vector3, scale = 1): void {
    this.puff.emit({ at, count: Math.round(34 * scale), speed: [3 * scale, 7.5 * scale], dir: new THREE.Vector3(0, 1, 0), spread: 0.55, gravity: 16, drag: 0.6, life: [0.6, 1.1], size: [0.28 * scale, 0.12 * scale], color: ["#ffffff", "#d9f6ff", "#a8e7f5"], alpha: 0.95, jitter: 0.4 * scale });
    this.puff.emit({ at, count: Math.round(10 * scale), speed: [1, 2.5 * scale], dir: new THREE.Vector3(0, 0.4, 0), spread: 1, drag: 2.5, gravity: -0.3, life: [0.5, 0.9], size: [0.8 * scale, 2.2 * scale], color: "#ffffff", alpha: 0.7 });
    const ring = at.clone();
    ring.y += 0.05;
    this.ring(ring, 3.2 * scale, "#ffffff", 0.9);
  }

  /** Healing: purple and green sparkles spiralling up, a soft glow. */
  heal(at: THREE.Vector3): void {
    this.glow.emit({ at, count: 30, speed: [0.6, 1.8], dir: new THREE.Vector3(0, 1, 0), spread: 0.8, gravity: -2.2, drag: 1.2, jitter: 0.5, life: [0.8, 1.5], size: [0.28, 0.06], color: ["#c58bff", "#7dff9a", "#ffffff"], intensity: 2.2, shape: SHAPE.star, spin: 3 });
    this.glow.emit({ at, count: 1, speed: [0, 0], life: [0.7, 0.7], size: [1.5, 3.2], color: "#b77bff", intensity: 1.3 });
  }

  /** Dizzy / win sparkles: a few golden stars popping out. */
  stars(at: THREE.Vector3, count = 10): void {
    this.glow.emit({ at, count, speed: [2, 4], dir: new THREE.Vector3(0, 1, 0), spread: 0.9, gravity: 5, drag: 1, life: [0.6, 1.0], size: [0.45, 0.15], color: ["#ffe066", "#fff4b0"], intensity: 2, shape: SHAPE.star, spin: 6 });
  }
}
