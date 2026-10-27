/**
 * Stage — the shared scene setup for challenge scenes, mirroring the island:
 * gradient sky dome, hemisphere + sun light with soft shadows that follow the
 * action, distance fog, and a `WorldUniforms` bundle (time, sun, heightfield
 * texture) so island shaders such as the water or the smoke can be reused.
 *
 * The heightfield texture uses the island's world mapping (±WORLD_HALF on a
 * HF_N grid), so the island water shader finds shores and depths in it.
 */

import * as THREE from "three";
import { createSkyDome, SkyPalette } from "../../../world/Sky";
import { WorldUniforms } from "../../../world/Terrain";
import { HF_N } from "../../../world/Heightfield";
import { WORLD_HALF, WORLD_SIZE } from "../../../world/layout";

export interface StageOptions {
  sky: SkyPalette;
  sunDir: THREE.Vector3;
  sunColor: THREE.ColorRepresentation;
  sunIntensity: number;
  hemiSky: THREE.ColorRepresentation;
  hemiGround: THREE.ColorRepresentation;
  hemiIntensity: number;
  fog: { color: THREE.ColorRepresentation; near: number; far: number };
  /** Half-size of the sharp-shadow area around the focus point. */
  shadowExtent: number;
  /** Terrain height at (x, z); sampled into the heightfield texture. */
  height: (x: number, z: number) => number;
  /** Build into an existing scene (lets a challenge hand the engine its scene before the heavy setup). */
  scene?: THREE.Scene;
}

const CELL = WORLD_SIZE / (HF_N - 1);

export class Stage {
  readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly world: WorldUniforms;
  readonly sunDir: THREE.Vector3;
  private heightTex: THREE.DataTexture;
  private maskTex: THREE.DataTexture;
  private sky: THREE.Mesh;
  private shadowFocus = new THREE.Vector3();

  constructor(o: StageOptions) {
    this.scene = o.scene ?? new THREE.Scene();
    this.sunDir = o.sunDir.clone().normalize();
    this.heightTex = heightTexture(o.height);
    // Reason: island shaders declare a mask sampler too; one neutral texel satisfies it
    this.maskTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.maskTex.needsUpdate = true;
    this.world = {
      uTime: { value: 0 },
      uHeightTex: { value: this.heightTex },
      uMaskTex: { value: this.maskTex },
      // Reason: the same neutral texel means "no island region" for the shared terrain shader
      uRegionTex: { value: this.maskTex },
      uSunDir: { value: this.sunDir },
    };

    this.scene.fog = new THREE.Fog(o.fog.color, o.fog.near, o.fog.far);
    this.sky = createSkyDome(this.sunDir, o.sky);
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(o.hemiSky, o.hemiGround, o.hemiIntensity);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(o.sunColor, o.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -o.shadowExtent;
    cam.right = cam.top = o.shadowExtent;
    cam.near = 1;
    cam.far = 300;
    cam.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);
  }

  /** Keep the sharp-shadow area centred on what the camera looks at. */
  focus(target: THREE.Vector3): void {
    // Reason: snap to shadow-map texels so shadow edges don't shimmer while moving
    const cam = this.sun.shadow.camera;
    const texel = (cam.right - cam.left) / this.sun.shadow.mapSize.x;
    this.shadowFocus.set(Math.round(target.x / texel) * texel, target.y, Math.round(target.z / texel) * texel);
    this.sun.target.position.copy(this.shadowFocus);
    this.sun.position.copy(this.shadowFocus).addScaledVector(this.sunDir, 120);
  }

  update(time: number): void {
    this.world.uTime.value = time;
  }

  dispose(): void {
    this.heightTex.dispose();
    this.maskTex.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.sun.shadow.map?.dispose();
  }
}

/** Sample a height function on the island's heightfield grid into a float texture. */
function heightTexture(height: (x: number, z: number) => number): THREE.DataTexture {
  const data = new Float32Array(HF_N * HF_N);
  for (let r = 0; r < HF_N; r++) {
    const z = -WORLD_HALF + r * CELL;
    for (let c = 0; c < HF_N; c++) data[r * HF_N + c] = height(-WORLD_HALF + c * CELL, z);
  }
  const tex = new THREE.DataTexture(data, HF_N, HF_N, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
