/**
 * GPU clean-up for challenge scenes. Every geometry in a challenge scene is
 * created by the challenge, so all of them are released. Materials and
 * textures are only released when the challenge registered them as its own:
 * the shared `mat()` cache and the cached sprite textures stay alive for the
 * island. Shader materials are never cached, so they are always released.
 */

import * as THREE from "three";

export class Owned {
  private items = new Set<{ dispose(): void }>();

  /** Register a material, texture or render target created by this challenge. */
  add<T extends { dispose(): void }>(item: T): T {
    this.items.add(item);
    return item;
  }

  /** Release the scene's geometries, its shader materials and everything registered here. */
  disposeScene(scene: THREE.Scene): void {
    const shaderMats = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // Reason: all sprites share one module-level quad geometry inside three.js — never dispose it
      if (mesh.geometry && !(o as THREE.Sprite).isSprite) mesh.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) if (m instanceof THREE.ShaderMaterial) shaderMats.add(m);
      if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
    });
    for (const m of shaderMats) m.dispose();
    for (const item of this.items) item.dispose();
    this.items.clear();
  }
}
