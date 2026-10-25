/**
 * Particles — small CPU-simulated bursts drawn as one InstancedMesh each:
 * confetti, sand grains, ice shards, coins, glowing sparkles, music notes.
 * Each particle has velocity, gravity, drag, spin, an optional flutter
 * (confetti) and can bounce and come to rest on a floor. Instances fade out
 * by shrinking or by dimming their colour (for additive glows).
 */

import * as THREE from "three";

export interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  color: THREE.Color;
  /** Seconds left / total lifetime. */
  life: number;
  max: number;
  size: number;
  /** Random number in [0, 1) for per-particle variation. */
  seed: number;
  resting: boolean;
}

export interface ParticleOptions {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  max: number;
  gravity?: number;
  /** Air drag per second (velocity *= exp(-drag * dt)). */
  drag?: number;
  /** Always face the camera (sprites); `rot.z` rolls them in screen space. */
  billboard?: boolean;
  /** Ground height below a point: particles bounce on it and come to rest. */
  floor?: ((x: number, z: number) => number) | null;
  bounce?: number;
  /** How particles disappear at the end of their life. */
  fade?: "scale" | "color";
  /** Sideways paper-like flutter (confetti). */
  flutter?: number;
  castShadow?: boolean;
  renderOrder?: number;
}

const tmpQ = new THREE.Quaternion();
const rollQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pool: Particle[] = [];
  private alive = 0;
  private o: Required<Omit<ParticleOptions, "floor">> & { floor: ParticleOptions["floor"] };

  constructor(options: ParticleOptions) {
    this.o = {
      gravity: 9,
      drag: 0.4,
      billboard: false,
      bounce: 0.35,
      fade: "scale",
      flutter: 0,
      castShadow: false,
      renderOrder: 0,
      ...options,
      floor: options.floor ?? null,
    };
    const mesh = new THREE.InstancedMesh(options.geometry, options.material, options.max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(options.max * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    // Reason: particles fly all over the stage; culling against the template's bounds would hide them
    mesh.frustumCulled = false;
    mesh.castShadow = this.o.castShadow;
    mesh.renderOrder = this.o.renderOrder;
    this.mesh = mesh;
    for (let i = 0; i < options.max; i++) {
      this.pool.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        color: new THREE.Color(1, 1, 1),
        life: 0,
        max: 1,
        size: 1,
        seed: 0,
        resting: false,
      });
    }
  }

  get count(): number {
    return this.alive;
  }

  /** Spawn `count` particles; `init` sets position, velocity, colour, life and size. */
  emit(count: number, init: (p: Particle, k: number) => void): void {
    for (let k = 0; k < count; k++) {
      // Reason: when the pool is full, recycle a random live particle instead of dropping the new one
      const i = this.alive < this.pool.length ? this.alive++ : Math.floor(Math.random() * this.pool.length);
      const p = this.pool[i];
      p.pos.set(0, 0, 0);
      p.vel.set(0, 0, 0);
      p.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      p.spin.set(0, 0, 0);
      p.color.setRGB(1, 1, 1);
      p.life = p.max = 1;
      p.size = 1;
      p.seed = Math.random();
      p.resting = false;
      init(p, k);
      p.max = p.life;
    }
  }

  /** Remove every particle. */
  clear(): void {
    this.alive = 0;
    this.mesh.count = 0;
  }

  update(dt: number, camera: THREE.Camera, time: number): void {
    const o = this.o;
    const damp = Math.exp(-o.drag * dt);
    let i = 0;
    while (i < this.alive) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // Swap-remove keeps the live particles packed at the front of the pool
        this.alive--;
        const last = this.pool[this.alive];
        this.pool[this.alive] = p;
        this.pool[i] = last;
        continue;
      }
      if (!p.resting) {
        p.vel.y -= o.gravity * dt;
        p.vel.multiplyScalar(damp);
        if (o.flutter) {
          p.vel.x += Math.sin(time * 5 + p.seed * 40) * o.flutter * dt;
          p.vel.z += Math.cos(time * 4 + p.seed * 25) * o.flutter * dt;
        }
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        if (o.floor) {
          const fy = o.floor(p.pos.x, p.pos.z) + p.size * 0.35;
          if (p.pos.y < fy) {
            p.pos.y = fy;
            if (Math.abs(p.vel.y) > 1.2) {
              p.vel.y = -p.vel.y * o.bounce;
              p.vel.x *= 0.55;
              p.vel.z *= 0.55;
              p.spin.multiplyScalar(0.5);
            } else {
              p.resting = true;
              p.vel.set(0, 0, 0);
              // Reason: settle flat on the ground so coins and shards lie down instead of standing on edge
              p.rot.x = Math.round(p.rot.x / Math.PI) * Math.PI;
              p.rot.z = Math.round(p.rot.z / Math.PI) * Math.PI;
            }
          }
        }
      }
      this.write(i, p, camera);
      i++;
    }
    this.mesh.count = this.alive;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private write(i: number, p: Particle, camera: THREE.Camera): void {
    // Fade over the last quarter of life (and at most the last 0.6 s)
    const k = Math.min(1, p.life / Math.min(p.max * 0.25, 0.6));
    const fade = k * k * (3 - 2 * k);
    const scale = this.o.fade === "scale" ? p.size * fade : p.size;
    if (this.o.billboard) {
      tmpQ.copy(camera.quaternion).multiply(rollQ.setFromAxisAngle(Z_AXIS, p.rot.z));
    } else {
      tmpQ.setFromEuler(p.rot);
    }
    tmpM.compose(p.pos, tmpQ, tmpS.setScalar(scale));
    this.mesh.setMatrixAt(i, tmpM);
    tmpC.copy(p.color);
    if (this.o.fade === "color") tmpC.multiplyScalar(fade);
    this.mesh.setColorAt(i, tmpC);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/** Patch a standard material so it adds a fraction of its albedo as glow (vivid in shade). */
export function selfLit<T extends THREE.MeshStandardMaterial>(m: T, amount: number): T {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${amount.toFixed(3)};`,
    );
  };
  m.customProgramCacheKey = () => `selfLit-${amount.toFixed(3)}`;
  return m;
}

export const CONFETTI_COLORS = ["#ff4d6d", "#ffd23f", "#3fb8ff", "#5ee06b", "#ff8c3a", "#c86bff", "#ffffff"];

/** Paper confetti: double-sided little rectangles that tumble and flutter down. */
export function createConfetti(max = 700, floor: ParticleOptions["floor"] = null): Particles {
  const geo = new THREE.PlaneGeometry(0.13, 0.075);
  const material = selfLit(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55 }), 0.35);
  return new Particles({ geometry: geo, material, max, gravity: 3.2, drag: 1.6, flutter: 5, floor, bounce: 0 });
}

/** Spray confetti from a point in a cone around `dir`. */
export function confettiBurst(ps: Particles, at: THREE.Vector3, dir: THREE.Vector3, count: number, speed = 9, spread = 0.55): void {
  const d = dir.clone().normalize();
  ps.emit(count, (p) => {
    p.pos.copy(at);
    p.vel
      .copy(d)
      .add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(spread))
      .normalize()
      .multiplyScalar(speed * (0.55 + Math.random() * 0.6));
    p.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    p.color.set(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]);
    p.life = 3.5 + Math.random() * 2.5;
    p.size = 0.8 + Math.random() * 0.6;
  });
}
