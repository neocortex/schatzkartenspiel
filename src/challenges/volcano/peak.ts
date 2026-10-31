/**
 * The erupting crater: a towering smoke plume, an ember fountain, a pulsing
 * hot glow and an orange light on the cone that flares up whenever the
 * volcano spits out a lava bomb.
 */

import * as THREE from "three";
import { SmokeSystem } from "../../world/ambient/Smoke";
import { glowTexture } from "../../world/ambient/textures";
import { Bursts } from "./kit/bursts";
import { VOLCANO } from "./course";

/** Young and old smoke when the plume is ash: sooty brown at the vent, near black higher up. */
const ASH_YOUNG = new THREE.Color("#3d1d12");
const ASH_OLD = new THREE.Color("#141112");

export class Peak {
  readonly group = new THREE.Group();
  /** Where bombs leave the crater. */
  readonly vent = new THREE.Vector3(VOLCANO.x, VOLCANO.rim + 1.5, VOLCANO.z);
  readonly glowMaterial: THREE.SpriteMaterial;
  /** How far the volcano has gone to rest: 0 is a full eruption, 1 a thin thread of smoke and a faint glow. */
  rest = 0;
  private glow: THREE.Sprite;
  private light: THREE.PointLight;
  private flare = 0;
  private plume: THREE.ShaderMaterial;
  private paleYoung: THREE.Color;
  private paleOld: THREE.Color;
  private fountain: THREE.ShaderMaterial;

  constructor(smoke: SmokeSystem, private bursts: Bursts) {
    const floor = this.vent.clone().setY(VOLCANO.rim - 7.5);
    const plume = smoke.add([floor], "volcano");
    this.plume = (plume.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material;
    this.paleYoung = this.plume.uniforms.uColorA.value.clone();
    this.paleOld = this.plume.uniforms.uColorB.value.clone();
    const fountain = smoke.sparks([floor.clone().setY(VOLCANO.rim - 4)], { perSource: 160, life: 3.4, up: [10, 21], lateral: 5.5, gravity: 9, size: 1.1, intensity: 7, wind: 2.5 });
    this.fountain = fountain.material as THREE.ShaderMaterial;
    this.group.add(fountain);

    this.glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color("#ff5a14").multiplyScalar(1.1),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.glow = new THREE.Sprite(this.glowMaterial);
    this.glow.position.copy(this.vent).setY(VOLCANO.rim - 1);
    this.glow.renderOrder = 3;
    this.group.add(this.glow);

    this.light = new THREE.PointLight("#ff6a1f", 2600, 0, 2);
    this.light.position.copy(this.vent).setY(VOLCANO.rim + 4);
    this.group.add(this.light);
  }

  /** How dark the plume is: 0 the pale smoke of the rescue run, 1 black ash. */
  set ash(k: number) {
    const { uColorA, uColorB } = this.plume.uniforms;
    uColorA.value.lerpColors(this.paleYoung, ASH_YOUNG, k);
    uColorB.value.lerpColors(this.paleOld, ASH_OLD, k);
  }

  /** Launch flash: sparks, a dark smoke puff and a flare of the crater light. */
  erupt(strength = 1): void {
    this.flare = Math.min(this.flare + strength, 2);
    this.bursts.sparks(this.vent, Math.round(18 * strength), 16 * strength, new THREE.Color(3.4, 1.2, 0.2), 1.1, 0.75);
    this.bursts.puffs(this.vent, 3, "#3b3432", [4, 11], 3, 5, 2.6, 0.75);
  }

  update(dt: number, time: number): void {
    this.flare = Math.max(0, this.flare - dt * 2.2);
    // Reason: two out-of-phase sines read as an irregular, breathing glow rather than a metronome
    const pulse = 0.8 + 0.12 * Math.sin(time * 1.7) + 0.08 * Math.sin(time * 4.3);
    const fire = 1 - this.rest;
    this.glowMaterial.opacity = Math.min(1, pulse + this.flare * 0.3) * (0.18 + 0.82 * fire);
    this.glow.scale.setScalar(16 + pulse * 3 + this.flare * 8);
    this.light.intensity = (2600 * pulse + this.flare * 4000) * (0.06 + 0.94 * fire);
    this.fountain.uniforms.uIntensity.value = 7 * fire;
    this.plume.uniforms.uOpacity.value = 0.9 * (0.12 + 0.88 * fire);
  }
}
