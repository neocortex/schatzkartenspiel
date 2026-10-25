/**
 * Sky, sun and atmosphere of the treasure island, with a smooth transition
 * from a bright tropical afternoon to a glowing sunset for the finale (sky
 * dome, sun direction and colour, sky fill light, fog, the water's sky
 * reflection and the clouds all blend together).
 */

import * as THREE from "three";
import { createSkyDome, Clouds, SkyPalette } from "../../world/Sky";
import { Owned } from "../shared/dispose";

interface Look {
  zenith: string;
  horizon: string;
  sunGlow: string;
  sunDir: THREE.Vector3;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  waterSky: string;
  glint: string;
  cloud: string;
}

const DAY: Look = {
  zenith: "#3f8fe0",
  horizon: "#cdeaf5",
  sunGlow: "#ffe6b3",
  sunDir: new THREE.Vector3(-0.42, 0.78, 0.46),
  sun: "#fff0d8",
  sunIntensity: 2.6,
  hemiSky: "#cfe6ff",
  hemiGround: "#f2dcb0",
  hemiIntensity: 1.15,
  fog: "#cfe7f2",
  waterSky: "#a6dcf2",
  glint: "#fff1d6",
  cloud: "#b8c8e6",
};

const SUNSET: Look = {
  zenith: "#272a74",
  horizon: "#ff9a68",
  sunGlow: "#ffb15e",
  sunDir: new THREE.Vector3(-0.5, 0.16, -0.85),
  sun: "#ffad6a",
  sunIntensity: 2.0,
  hemiSky: "#9a90e6",
  hemiGround: "#e0a678",
  hemiIntensity: 1.05,
  fog: "#f2a585",
  waterSky: "#ffb48e",
  glint: "#ffc47e",
  cloud: "#ff9f86",
};

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class Daylight {
  readonly group = new THREE.Group();
  readonly sunDir = DAY.sunDir.clone().normalize();
  /** Colour of the sky reflected in the water, and of the sun glints (shared with the lagoon shader). */
  readonly waterSky = new THREE.Color(DAY.waterSky);
  readonly glint = new THREE.Color(DAY.glint);
  readonly fog = new THREE.Fog(DAY.fog, 70, 900);
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private palette: SkyPalette;
  private clouds: Clouds;
  private cloudMat: THREE.MeshStandardMaterial;
  private mix = 0;
  private from = 0;
  private to = 0;
  private t = 1;
  private duration = 1;

  constructor(owned: Owned, focus: THREE.Vector3) {
    // Reason: own colour objects — the shared DAY_SKY palette must never be mutated by the transition
    this.palette = { zenith: new THREE.Color(DAY.zenith), horizon: new THREE.Color(DAY.horizon), sunGlow: new THREE.Color(DAY.sunGlow) };
    this.group.add(createSkyDome(this.sunDir, this.palette));

    this.hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiIntensity);
    this.sun = new THREE.DirectionalLight(DAY.sun, DAY.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -17;
    sc.right = sc.top = 17;
    sc.near = 1;
    sc.far = 80;
    this.sun.target.position.copy(focus);
    this.group.add(this.hemi, this.sun, this.sun.target);

    this.clouds = new Clouds(16, 21);
    this.cloudMat = (this.clouds.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    owned.add(this.cloudMat);
    this.group.add(this.clouds.group);
    this.apply();
  }

  /** Blend to the sunset (1) or back to day (0) over `seconds`. */
  fade(to: 0 | 1, seconds: number): void {
    this.from = this.mix;
    this.to = to;
    this.t = 0;
    this.duration = Math.max(seconds, 0.01);
  }

  update(dt: number): void {
    this.clouds.update(dt);
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    this.mix = THREE.MathUtils.lerp(this.from, this.to, smoother(this.t));
    this.apply();
  }

  private apply(): void {
    const k = this.mix;
    const c = (a: string, b: string, out: THREE.Color) => out.set(a).lerp(new THREE.Color(b), k);
    c(DAY.zenith, SUNSET.zenith, this.palette.zenith);
    c(DAY.horizon, SUNSET.horizon, this.palette.horizon);
    c(DAY.sunGlow, SUNSET.sunGlow, this.palette.sunGlow);
    c(DAY.sun, SUNSET.sun, this.sun.color);
    c(DAY.hemiSky, SUNSET.hemiSky, this.hemi.color);
    c(DAY.hemiGround, SUNSET.hemiGround, this.hemi.groundColor);
    c(DAY.fog, SUNSET.fog, this.fog.color);
    c(DAY.waterSky, SUNSET.waterSky, this.waterSky);
    c(DAY.glint, SUNSET.glint, this.glint);
    c(DAY.cloud, SUNSET.cloud, this.cloudMat.emissive);
    this.sun.intensity = THREE.MathUtils.lerp(DAY.sunIntensity, SUNSET.sunIntensity, k);
    this.hemi.intensity = THREE.MathUtils.lerp(DAY.hemiIntensity, SUNSET.hemiIntensity, k);
    this.sunDir.copy(DAY.sunDir).normalize().lerp(SUNSET.sunDir.clone().normalize(), k).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 40);
  }
}
