/**
 * The volcano's living crater: a towering plume of billowing smoke that bends
 * over in the wind, embers spraying out of the vent, a pulsing hot glow over
 * the crater, and intermittent steam where its slopes meet the sea.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { LANDMARKS } from "../layout";
import { SmokeSystem, VOLCANO_SPARKS } from "./Smoke";
import { glowTexture } from "./textures";

export class Volcano {
  readonly group = new THREE.Group();
  /** Bottom of the crater bowl (world space). */
  readonly vent: THREE.Vector3;
  private glow: THREE.Sprite;

  constructor(hf: Heightfield, smoke: SmokeSystem) {
    const [vx, vz] = LANDMARKS.volcano;
    const floor = hf.heightAt(vx, vz);
    let rim = floor;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      rim = Math.max(rim, hf.heightAt(vx + Math.cos(a) * 6.5, vz + Math.sin(a) * 6.5));
    }
    this.vent = new THREE.Vector3(vx, floor + 1, vz);

    smoke.add([this.vent], "volcano");
    const embers = smoke.sparks([this.vent.clone().setY(floor + 2)], VOLCANO_SPARKS);
    embers.name = "volcano-embers";
    this.group.add(embers);

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

  update(time: number): void {
    // Reason: two out-of-phase sines read as an irregular, breathing glow rather than a metronome
    const pulse = 0.8 + 0.12 * Math.sin(time * 1.7) + 0.08 * Math.sin(time * 4.3);
    this.glow.material.opacity = pulse;
    this.glow.scale.setScalar(10 + pulse * 2);
  }
}
