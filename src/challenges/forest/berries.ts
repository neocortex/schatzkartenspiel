/**
 * The five magic berries. Each sprig sits on a little leafy bush in its own
 * violet beam of light, bobbing and pulsing with a glowing halo on the
 * ground and sparkles drifting up, so it can be spotted from far away.
 * Collecting one makes it hop up, spin and burst into sparkles while its
 * light fades out.
 */

import * as THREE from "three";
import { createBerries } from "../../world/models/items";
import * as flora from "../../world/models/flora";
import { Bursts } from "../shared/bursts";
import { Atmosphere } from "./atmosphere";
import { BERRIES, ForestField } from "./layout";

const BERRY_HEX = "#b26bff";
const SPRIG = 1.8;

export class Berry {
  readonly group = new THREE.Group();
  readonly sprig = createBerries();
  readonly light = new THREE.PointLight(BERRY_HEX, 4, 6, 1.4);
  collected = false;
  private halo: THREE.Mesh;
  private haloMat: THREE.MeshBasicMaterial;
  readonly beam: THREE.Mesh;
  private pop = -1;
  private phase = Math.random() * 10;

  constructor(
    readonly at: THREE.Vector3,
    bush: THREE.Mesh,
    tex: THREE.Texture,
    beam: THREE.Mesh,
  ) {
    this.group.position.copy(at);
    this.group.add(bush);
    this.sprig.scale.setScalar(SPRIG);
    this.sprig.position.y = 0.95;
    this.group.add(this.sprig);
    this.haloMat = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(BERRY_HEX).multiplyScalar(1.9),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), this.haloMat);
    this.halo.position.y = 0.06;
    this.halo.renderOrder = 3;
    this.group.add(this.halo);
    this.light.position.set(0, 2.2, 0);
    this.group.add(this.light);
    this.beam = beam;
  }

  /** Where the sprig is (for sparkles and the fox). */
  get top(): THREE.Vector3 {
    return this.sprig.getWorldPosition(new THREE.Vector3());
  }

  collect(): void {
    this.collected = true;
    this.pop = 0;
  }

  update(dt: number, time: number, sparks: Bursts): void {
    const t = time + this.phase;
    const strength = this.beam.material as THREE.ShaderMaterial;
    if (this.pop < 0) {
      // Idle: bob, turn and pulse
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      this.sprig.position.y = 0.95 + Math.sin(t * 1.8) * 0.08;
      this.sprig.rotation.y = t * 0.6;
      this.sprig.scale.setScalar(SPRIG + pulse * 0.1);
      this.haloMat.opacity = 0.45 + pulse * 0.35;
      this.halo.scale.setScalar(0.9 + pulse * 0.15);
      this.light.intensity = 3 + pulse * 2;
      if (Math.random() < dt * 5) {
        sparks.emit(this.top.add(new THREE.Vector3(0, 0.3, 0)), {
          count: 1,
          color: new THREE.Color(1.6, 0.9, 2.6),
          speed: [0.2, 0.5],
          up: 0.8,
          life: [0.9, 1.6],
          size: [0.06, 0.12],
          spread: 0.5,
          gravity: -0.3,
        });
      }
      return;
    }
    if (this.pop >= 1) return;
    // Collected: hop up spinning, then burst; light and beam fade
    this.pop = Math.min(1, this.pop + dt / 0.75);
    const k = this.pop;
    this.sprig.position.y = 0.95 + Math.sin(k * Math.PI * 0.7) * 1.7;
    this.sprig.rotation.y += dt * 14;
    this.sprig.scale.setScalar(SPRIG * (k < 0.6 ? 1 + k * 0.6 : (1 - k) * 3.4));
    this.haloMat.opacity = 0.8 * (1 - k);
    this.light.intensity = 5 * (1 - k);
    strength.uniforms.uStrength.value *= 1 - Math.min(1, dt * 4);
    if (k >= 1) {
      this.sprig.visible = false;
      this.halo.visible = false;
      this.light.intensity = 0;
      sparks.emit(this.top, {
        count: 46,
        color: new THREE.Color(1.8, 0.8, 3.0),
        speed: [2, 5],
        up: 1.5,
        life: [0.5, 1.1],
        size: [0.08, 0.18],
        gravity: 3,
      });
    }
  }

  dispose(): void {
    this.halo.geometry.dispose();
    this.haloMat.dispose();
    this.light.dispose();
  }
}

/** Build the five berry spots, each with a bush and a violet beam. */
export function createBerrySpots(field: ForestField, atmosphere: Atmosphere, tex: THREE.Texture, time: { value: number }, owned: THREE.Material[]): Berry[] {
  const bushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  owned.push(bushMat);
  return BERRIES.map((b, i) => {
    const y = field.terrainAt(b.x, b.z);
    const model = flora.bush(60 + i);
    const bush = new THREE.Mesh(model.geometry, bushMat);
    bush.scale.set(0.75, 0.6, 0.75);
    bush.castShadow = true;
    bush.receiveShadow = true;
    // Reason: a tint pass gives the berry bushes their own deep teal so they stand apart from normal bushes
    const col = model.geometry.attributes.color as THREE.BufferAttribute;
    for (let k = 0; k < col.count; k++) col.setXYZ(k, col.getX(k) * 0.55, col.getY(k) * 0.95, col.getZ(k) * 1.25 + 0.05);
    const beam = atmosphere.shaft(new THREE.Vector3(b.x, y, b.z), 0.9, "#c48bff", 0.27, time);
    return new Berry(new THREE.Vector3(b.x, y, b.z), bush, tex, beam);
  });
}
