/**
 * The volcano's living crater: a towering plume of billowing smoke that bends
 * over in the wind, embers spraying out of the vent, a pulsing hot glow over
 * the crater, and intermittent steam where its slopes meet the sea. A rumble
 * throws a dark cloud up through the plume, with higher embers and a hotter glow.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { LANDMARKS } from "../layout";
import { SmokeSystem, VOLCANO_SPARKS } from "./Smoke";
import { glowTexture } from "./textures";

/** How long a burst's cloud rises out of the vent, and how long its last puff stays in the air. */
const BURST_SECONDS: [number, number] = [1.2, 3.6];
const BURST_LIFE = 8;

export class Volcano {
  readonly group = new THREE.Group();
  /** Bottom of the crater bowl (world space). */
  readonly vent: THREE.Vector3;
  /** The cloud of a burst (hidden between bursts, when it would only cost fill rate). */
  readonly plume: THREE.Object3D;
  private glow: THREE.Sprite;
  private embers: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private time = 0;
  private burstStart = -Infinity;
  private burstEnd = -Infinity;
  private strength = 0;

  constructor(hf: Heightfield, private smoke: SmokeSystem) {
    const [vx, vz] = LANDMARKS.volcano;
    const floor = hf.heightAt(vx, vz);
    let rim = floor;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      rim = Math.max(rim, hf.heightAt(vx + Math.cos(a) * 6.5, vz + Math.sin(a) * 6.5));
    }
    this.vent = new THREE.Vector3(vx, floor + 1, vz);

    smoke.add([this.vent], "volcano");
    this.plume = smoke.add([this.vent], "volcanoBurst");
    this.plume.visible = false;
    this.embers = smoke.sparks([this.vent.clone().setY(floor + 2)], VOLCANO_SPARKS) as typeof this.embers;
    this.embers.name = "volcano-embers";
    this.group.add(this.embers);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color("#ff5a14").multiplyScalar(0.9),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.glow.position.set(vx, (floor + rim) / 2 + 1, vz);
    this.glow.renderOrder = 3;
    this.group.add(this.glow);

    const shore = this.seawardShore(hf, vx, vz);
    if (shore.length) smoke.add(shore, "seaSteam");
  }

  /** A few points where the volcano's western slopes run into the sea. */
  private seawardShore(hf: Heightfield, vx: number, vz: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (const a of [Math.PI * 0.82, Math.PI * 1.18]) {
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let r = 12;
      while (r < 48 && hf.heightAt(vx + dx * r, vz + dz * r) > 0.05) r += 0.5;
      if (r < 48) points.push(new THREE.Vector3(vx + dx * (r + 0.5), 0.2, vz + dz * (r + 0.5)));
    }
    return points;
  }

  /** How strong the last burst was (0 before the first one, and again once its smoke has gone). */
  get burstLevel(): number {
    return this.strength;
  }

  /** Throw a cloud of smoke out of the crater; `strength` from 0 to 1 sets its size, its embers and its glow. */
  burst(strength: number): void {
    // Reason: a burst during a burst carries on from the same start, otherwise the cloud in the air would vanish
    if (!this.plume.visible) this.burstStart = this.time;
    this.burstEnd = this.time + THREE.MathUtils.lerp(BURST_SECONDS[0], BURST_SECONDS[1], strength);
    this.strength = strength;
    this.smoke.birthWindow(this.plume, this.burstStart, this.burstEnd);
    this.plume.visible = true;
  }

  update(time: number): void {
    this.time = time;
    // Reason: two out-of-phase sines read as an irregular, breathing glow rather than a metronome
    const pulse = 0.8 + 0.12 * Math.sin(time * 1.7) + 0.08 * Math.sin(time * 4.3);
    // Reason: the crater flares up fast with the burst and settles while the cloud drifts off
    const flare = this.plume.visible ? this.strength * Math.min((time - this.burstStart) * 3, 1) * (1 - THREE.MathUtils.smoothstep(time, this.burstEnd, this.burstEnd + BURST_LIFE * 0.6)) : 0;
    this.glow.material.opacity = pulse + flare;
    this.glow.scale.setScalar(10 + pulse * 2 + flare * 10);
    const embers = this.embers.material.uniforms;
    embers.uUp.value.set(VOLCANO_SPARKS.up[0] * (1 + flare), VOLCANO_SPARKS.up[1] * (1 + flare));
    embers.uIntensity.value = VOLCANO_SPARKS.intensity * (1 + flare);
    if (this.plume.visible && time > this.burstEnd + BURST_LIFE) {
      this.plume.visible = false;
      this.strength = 0;
    }
  }
}
