/**
 * Sky, sun and atmosphere of the treasure island, with a smooth transition
 * from a bright tropical afternoon to the ash-red sky of the eruption (sky
 * dome, sun direction and colour, sky fill light, fog, the water's sky
 * reflection and the clouds all blend together).
 */

import * as THREE from "three";
import { createSkyDome, Clouds, SkyPalette } from "../../world/Sky";
import { Owned } from "../shared/dispose";
import { VOLCANO_AT } from "./eruption";

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
  fogFar: number;
  waterSky: string;
  waterTint: string;
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
  fogFar: 900,
  waterSky: "#a6dcf2",
  waterTint: "#ffffff",
  glint: "#fff1d6",
  cloud: "#b8c8e6",
};

const ERUPTION: Look = {
  zenith: "#120a1c",
  horizon: "#5c1a16",
  sunGlow: "#a8460c",
  // Reason: the sun sinks right behind the volcano (its bearing, low enough to stay hidden by the cone), so the cone is a black shape against the brightest part of the sky
  sunDir: VOLCANO_AT.clone().setY(36),
  sun: "#ff7038",
  sunIntensity: 1.1,
  hemiSky: "#5a3f70",
  hemiGround: "#6e3526",
  hemiIntensity: 0.5,
  fog: "#4a1a14",
  fogFar: 1700,
  waterSky: "#b8401c",
  waterTint: "#9c5a44",
  glint: "#ff8a3a",
  cloud: "#26121a",
};

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class Daylight {
  readonly group = new THREE.Group();
  readonly sunDir = DAY.sunDir.clone().normalize();
  /** Colour of the sky reflected in the water, and of the sun glints (shared with the lagoon shader). */
  readonly waterSky = new THREE.Color(DAY.waterSky);
  readonly waterTint = new THREE.Color(DAY.waterTint);
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

  /** Blend towards the eruption's sky (1 = all the way, 0 = bright day) over `seconds`. */
  fade(to: number, seconds: number): void {
    this.from = this.mix;
    this.to = to;
    this.t = 0;
    this.duration = Math.max(seconds, 0.01);
  }

  /** The clouds go for good: the blast's halo would slice them and the red sky would turn them into black lumps. */
  hideClouds(): void {
    this.clouds.group.visible = false;
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
    c(DAY.zenith, ERUPTION.zenith, this.palette.zenith);
    c(DAY.horizon, ERUPTION.horizon, this.palette.horizon);
    c(DAY.sunGlow, ERUPTION.sunGlow, this.palette.sunGlow);
    c(DAY.sun, ERUPTION.sun, this.sun.color);
    c(DAY.hemiSky, ERUPTION.hemiSky, this.hemi.color);
    c(DAY.hemiGround, ERUPTION.hemiGround, this.hemi.groundColor);
    c(DAY.fog, ERUPTION.fog, this.fog.color);
    c(DAY.waterSky, ERUPTION.waterSky, this.waterSky);
    c(DAY.waterTint, ERUPTION.waterTint, this.waterTint);
    c(DAY.glint, ERUPTION.glint, this.glint);
    c(DAY.cloud, ERUPTION.cloud, this.cloudMat.emissive);
    this.fog.far = THREE.MathUtils.lerp(DAY.fogFar, ERUPTION.fogFar, k);
    this.sun.intensity = THREE.MathUtils.lerp(DAY.sunIntensity, ERUPTION.sunIntensity, k);
    this.hemi.intensity = THREE.MathUtils.lerp(DAY.hemiIntensity, ERUPTION.hemiIntensity, k);
    // Reason: the sun has to be behind the cone before the camera turns there; a white disc sliding down past the fire looks wrong
    // Reason: it starts above 0.32, the heart's dimming, or the shadows would sweep out for the heart and back for the gold
    this.sunDir.copy(DAY.sunDir).normalize().lerp(ERUPTION.sunDir.clone().normalize(), THREE.MathUtils.smoothstep(k, 0.35, 0.5)).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 40);
  }
}
