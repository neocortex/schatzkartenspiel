/**
 * Small toolkit shared by the ogre and sea challenges: a game-time timeline
 * for scripted choreography (tweens and waits that follow slow motion),
 * easing curves, a disposal bin for GPU resources, and helpers that turn the
 * island's painted `Model` parts into meshes with the landmark look.
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { Model } from "../../world/models/shapes";

// ── Easing ──────────────────────────────────────────────────

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOut: (t: number) => t * t * (3 - 2 * t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  /** Overshoots past 1 then settles — cartoon "boing". */
  outBack: (t: number) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
/** 0 → 1 → 0 over t in [0, 1]. */
export const hump = (t: number): number => Math.sin(clamp01(t) * Math.PI);

// ── Timeline ────────────────────────────────────────────────

interface Job {
  elapsed: number;
  duration: number;
  fn: ((k: number) => void) | null;
  resolve: () => void;
}

/**
 * Tweens and waits measured in (scaled) game time. Choreography is written as
 * plain async code: `await tl.tween(0.4, k => ...)`, `await tl.wait(1)`.
 */
export class Timeline {
  private jobs: Job[] = [];

  tween(duration: number, fn: (k: number) => void): Promise<void> {
    return new Promise((resolve) => this.jobs.push({ elapsed: 0, duration: Math.max(duration, 1e-4), fn, resolve }));
  }

  wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.jobs.push({ elapsed: 0, duration: seconds, fn: null, resolve }));
  }

  /** Resolves on the next update (lets a loop yield one frame). */
  frame(): Promise<void> {
    return this.wait(0);
  }

  update(dt: number): void {
    if (!this.jobs.length) return;
    const done: Job[] = [];
    for (const j of this.jobs) {
      j.elapsed += dt;
      const k = Math.min(j.elapsed / j.duration, 1);
      j.fn?.(k);
      if (k >= 1) done.push(j);
    }
    if (!done.length) return;
    this.jobs = this.jobs.filter((j) => !done.includes(j));
    for (const j of done) j.resolve();
  }
}

/** Resolve when `check()` becomes true, polling once per timeline update. */
export async function until(tl: Timeline, check: () => boolean): Promise<void> {
  while (!check()) await tl.frame();
}

// ── Disposal ────────────────────────────────────────────────

/**
 * Collects GPU resources a challenge created so `exit()` can free them.
 * Geometries are found by traversing the scene; materials and textures must
 * be registered explicitly, because `mat()` materials are shared and must
 * survive the challenge.
 */
export class Bin {
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private extra = new Set<{ dispose(): void }>();

  material<T extends THREE.Material>(m: T): T {
    this.materials.add(m);
    return m;
  }

  texture<T extends THREE.Texture>(t: T): T {
    this.textures.add(t);
    return t;
  }

  other<T extends { dispose(): void }>(d: T): T {
    this.extra.add(d);
    return d;
  }

  /** Free every geometry under `root` plus everything registered. */
  dispose(root: THREE.Object3D): void {
    const geos = new Set<THREE.BufferGeometry>();
    root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g) geos.add(g);
      // Reason: blob shadows and similar helpers own a private material + canvas texture
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m && o.userData.ownMaterial) {
        m.map?.dispose();
        m.dispose();
      }
    });
    for (const g of geos) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    for (const d of this.extra) d.dispose();
  }
}

// ── Painted models (island landmark look) ───────────────────

/** Materials for vertex-coloured island models (solid, glowing, wind-swayed cloth). */
export interface ModelMaterials {
  solid: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  cloth: THREE.MeshStandardMaterial;
  time: { value: number };
}

export function modelMaterials(bin: Bin): ModelMaterials {
  const time = { value: 0 };
  const solid = bin.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }));
  const glow = bin.material(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const cloth = bin.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  cloth.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSway;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        // Reason: phase from world position makes ripples travel along sails and flags
        vec4 cw = modelMatrix * vec4(position, 1.0);
        float ph = cw.x * 1.3 + cw.z * 0.9 + cw.y * 0.6;
        transformed.x += sin(uTime * 3.1 + ph) * aSway;
        transformed.z += cos(uTime * 2.6 + ph * 1.4) * aSway * 0.8;
        transformed.y += sin(uTime * 4.3 + ph * 2.1) * aSway * 0.35;`,
      );
  };
  return { solid, glow, cloth, time };
}

/** One merged mesh per material for a painted island `Model`. */
export function modelGroup(model: Model, mats: ModelMaterials, shadows = true): THREE.Group {
  const g = new THREE.Group();
  const add = (geos: THREE.BufferGeometry[], m: THREE.Material, cast: boolean) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(merge(geos), m);
    mesh.castShadow = cast && shadows;
    mesh.receiveShadow = shadows;
    g.add(mesh);
  };
  add(model.solid, mats.solid, true);
  add(model.cloth, mats.cloth, true);
  add(model.glow, mats.glow, false);
  add(model.pulse, mats.glow, false);
  return g;
}

/** Soft round contact shadow (owns its material; the Bin frees it). */
export function contactShadow(radius: number, opacity = 0.5): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(0,0,0,${opacity})`);
  grad.addColorStop(0.6, `rgba(0,0,0,${opacity * 0.45})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  m.userData.ownMaterial = true;
  m.renderOrder = 2;
  return m;
}
