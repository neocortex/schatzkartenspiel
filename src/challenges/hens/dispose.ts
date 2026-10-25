/**
 * GPU clean-up for the hen yard. Every geometry in the scene was made by this
 * challenge and is released; materials and textures only when they were
 * registered as owned (the shared `mat()` cache and the cached sprite
 * textures stay alive for the island). Shader materials are never shared.
 */

import * as THREE from "three";

export interface Disposable {
  dispose(): void;
}

export function disposeScene(scene: THREE.Scene, owned: Disposable[]): void {
  const shaderMats = new Set<THREE.Material>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // Reason: sprites share one module-level quad inside three.js — never dispose it
    if (mesh.geometry && !(o as THREE.Sprite).isSprite) mesh.geometry.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) if (m instanceof THREE.ShaderMaterial) shaderMats.add(m);
    if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
  });
  for (const m of shaderMats) m.dispose();
  for (const item of owned) item.dispose();
  owned.length = 0;
}
