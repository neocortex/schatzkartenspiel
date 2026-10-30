/**
 * Island — assembles the whole overworld environment (terrain, water, sky,
 * clouds, lighting) into a THREE.Scene. Gameplay scenes add characters on top.
 */

import * as THREE from "three";
import { Heightfield } from "./Heightfield";
import { createTerrain, WorldUniforms } from "./Terrain";
import { createWater } from "./Water";
import { createSkyDome, Clouds, DAY_SKY } from "./Sky";
import { GrassField } from "./Grass";
import { Colliders } from "./Colliders";
import { Vegetation } from "./Vegetation";
import { Landmarks } from "./Landmarks";
import { Ambient } from "./Ambient";

export class Island {
  readonly scene = new THREE.Scene();
  readonly hf: Heightfield;
  readonly sunDir = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();
  readonly sun: THREE.DirectionalLight;
  readonly uniforms: WorldUniforms;
  readonly colliders = new Colliders();
  private clouds: Clouds;
  private grass: GrassField;
  readonly landmarks: Landmarks;
  readonly ambient: Ambient;
  private focus = new THREE.Vector3();
  private shadowFocus = new THREE.Vector3();

  constructor() {
    this.hf = new Heightfield();
    this.uniforms = {
      uTime: { value: 0 },
      uHeightTex: { value: this.hf.heightTexture },
      uMaskTex: { value: this.hf.maskTexture },
      uRegionTex: { value: this.hf.regionTexture },
      uSunDir: { value: this.sunDir },
    };

    this.scene.fog = new THREE.Fog(DAY_SKY.horizon.clone(), 260, 950);
    this.scene.add(createSkyDome(this.sunDir));
    this.scene.add(createTerrain(this.hf, this.uniforms));
    this.scene.add(createWater(this.uniforms, DAY_SKY.horizon));

    // Reason: landmarks first so their colliders keep trees from growing through them
    this.landmarks = new Landmarks(this.hf, this.colliders, this.uniforms);
    this.scene.add(this.landmarks.group);
    this.scene.add(new Vegetation(this.hf, this.colliders, this.uniforms).group);
    this.ambient = new Ambient(this.hf, this.uniforms, this.colliders);
    this.ambient.addSmoke(this.landmarks.chimneys, "chimney");
    this.ambient.addSmoke(this.landmarks.vents, "steam");
    this.scene.add(this.ambient.group);
    this.grass = new GrassField(this.uniforms);
    this.scene.add(this.grass.group);

    this.clouds = new Clouds();
    this.scene.add(this.clouds.group);

    this.scene.add(new THREE.HemisphereLight("#cfe8ff", "#6b7d45", 1.05));
    this.sun = new THREE.DirectionalLight("#fff1dc", 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.setShadowExtent(42);
    this.scene.add(this.sun, this.sun.target);
  }

  /** Size of the area (half-width) around the focus point that receives sharp shadows. */
  setShadowExtent(half: number): void {
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = 320;
    cam.updateProjectionMatrix();
  }

  /** Centre the detail systems (shadows, grass) on what the camera is looking at. */
  setFocus(target: THREE.Vector3, player: THREE.Vector3 | null = null): void {
    this.focus.copy(target);
    this.focusShadows(target);
    this.grass.update(target, player);
  }

  private focusShadows(target: THREE.Vector3): void {
    // Reason: snap to shadow-map texels so shadow edges don't shimmer while moving
    const cam = this.sun.shadow.camera;
    const texel = (cam.right - cam.left) / this.sun.shadow.mapSize.x;
    this.shadowFocus.set(
      Math.round(target.x / texel) * texel,
      target.y,
      Math.round(target.z / texel) * texel,
    );
    this.sun.target.position.copy(this.shadowFocus);
    this.sun.position.copy(this.shadowFocus).addScaledVector(this.sunDir, 150);
  }

  update(dt: number, time: number): void {
    this.uniforms.uTime.value = time;
    this.clouds.update(dt);
    this.landmarks.update(dt, time);
    this.ambient.update(dt, time, this.focus);
  }
}
