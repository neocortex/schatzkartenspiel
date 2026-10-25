/**
 * Helpers for building challenge sets from the island's landmark kit: merge a
 * painted `Model` into one mesh per material, and dispose everything a
 * challenge created when it ends (geometries in the scene graph plus any
 * materials/textures registered as owned — never the shared `mat()` cache).
 */

import * as THREE from "three";
import { merge } from "../../../core/geo";
import { Model } from "../../../world/models/shapes";
import { LandmarkMaterials } from "../../../world/models/effects";

/** One merged mesh per material used by the model (text parts are not supported). */
export function meshesFromModel(model: Model, mats: LandmarkMaterials, name = "set"): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  const make = (geos: THREE.BufferGeometry[], material: THREE.Material, shadows: boolean) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(merge(geos), material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    g.add(mesh);
  };
  make(model.solid, mats.solid, true);
  make(model.cloth, mats.cloth, true);
  make(model.glow, mats.glow, false);
  make(model.pulse, mats.pulse, false);
  make(model.dark, mats.dark, false);
  return g;
}

/** Tracks GPU resources a challenge owns so `exit()` can release them in one call. */
export class Disposer {
  private owned = new Set<{ dispose(): void }>();

  /** Register a material, texture or render target owned by the challenge; returns it. */
  own<T extends { dispose(): void }>(thing: T): T {
    this.owned.add(thing);
    return thing;
  }

  ownAll(things: { dispose(): void }[]): void {
    for (const t of things) this.owned.add(t);
  }

  /** Register every material below `root` (for objects built with private `new` materials, e.g. Beacon). */
  ownMaterials(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) this.owned.add(x);
    });
  }

  /**
   * Dispose every geometry below `root`, every textured material below it
   * whose texture is not in `sharedTextures` (e.g. character blob shadows),
   * plus all owned resources.
   */
  disposeAll(root: THREE.Object3D, sharedTextures: THREE.Texture[] = []): void {
    const shared = new Set(sharedTextures);
    const geos = new Set<THREE.BufferGeometry>();
    root.traverse((o) => {
      // Reason: all sprites share one module-level quad geometry inside three.js
      if ((o as THREE.Sprite).isSprite) return;
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) geos.add(mesh.geometry);
      const m = mesh.material as THREE.MeshBasicMaterial | undefined;
      if (m && !Array.isArray(m) && m.map && !shared.has(m.map)) {
        this.owned.add(m.map);
        this.owned.add(m);
      }
    });
    for (const g of geos) g.dispose();
    for (const t of this.owned) t.dispose();
    this.owned.clear();
  }
}
