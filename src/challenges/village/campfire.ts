/**
 * The ceremony campfire: a ring of stones, a log teepee over a bed of glowing
 * embers, a cluster of flickering flame tongues, a soft halo, rising smoke
 * with a fountain of sparks, and a warm flickering point light that casts
 * the characters' shadows outwards. `flare()` makes it roar up for a cheer.
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { rockBlob, stoneFn, pole, ball } from "../../world/models/shapes";
import { createMaterials, flameGeometry } from "../../world/models/effects";
import { SmokeSystem } from "../../world/ambient/Smoke";
import { glowTexture } from "../../world/ambient/textures";
import { WorldUniforms } from "../../world/Terrain";
import { Particles } from "../shared/particles";
import { Owned } from "../shared/dispose";

const FLAMES: [number, number, number, number, number][] = [
  // x, z, scale, height stretch, phase
  [0, 0, 2.3, 1.15, 0],
  [0.2, 0.12, 1.5, 1.0, 1.3],
  [-0.22, 0.08, 1.6, 0.95, 2.1],
  [0.05, -0.22, 1.4, 1.05, 3.4],
  [-0.12, -0.15, 1.1, 0.9, 4.2],
  [0.28, -0.1, 1.0, 0.85, 5.0],
];

export class Campfire {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private flames: THREE.InstancedMesh;
  private halo: THREE.Sprite;
  private haloMat: THREE.SpriteMaterial;
  private embers: Particles;
  private roar = 0;
  private mtx = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor(
    readonly at: THREE.Vector3,
    world: WorldUniforms,
    smoke: SmokeSystem,
    owned: Owned,
  ) {
    const rand = mulberry32(77);
    const mats = createMaterials(world);
    Object.values(mats).forEach((m) => owned.add(m));
    // Reason: tint the white-hot shared flame colours towards orange for a cosier campfire
    mats.flame.color.setRGB(1, 0.78, 0.55);
    this.group.position.copy(at);

    // Stone ring and logs
    const solid: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rand() * 0.2;
      solid.push(rockBlob(i + 3, [0.24, 0.17, 0.2], stoneFn("#8a837c", 0, rand)).translate(Math.cos(a) * 0.82, 0.08, Math.sin(a) * 0.82));
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      solid.push(pole([Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62], [Math.cos(a) * 0.06, 0.78, Math.sin(a) * 0.06], 0.085, "#6b4426", 7, 0.06));
    }
    // Two cut logs lying beside the fire, ready to be thrown in
    solid.push(pole([1.25, 0.12, 0.55], [1.55, 0.12, -0.25], 0.12, "#7a4e2c", 8));
    solid.push(pole([1.35, 0.32, 0.25], [1.62, 0.3, -0.45], 0.11, "#83552f", 8));
    const ringMesh = new THREE.Mesh(merge(solid), mats.solid);
    ringMesh.castShadow = true;
    ringMesh.receiveShadow = true;
    // Bed of embers glowing between the logs
    const embers: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.5;
      const hot = new THREE.Color(2.6, 0.75 + rand() * 0.5, 0.12);
      embers.push(ball(0.06 + rand() * 0.06, hot, [Math.cos(a) * r, 0.05, Math.sin(a) * r], 0, [1, 0.6, 1]));
    }
    const emberMesh = new THREE.Mesh(merge(embers), mats.pulse);
    this.group.add(ringMesh, emberMesh);

    this.flames = new THREE.InstancedMesh(flameGeometry(), mats.flame, FLAMES.length);
    this.flames.frustumCulled = false;
    this.group.add(this.flames);

    this.haloMat = owned.add(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.6, 0.6, 0.15), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.position.y = 0.7;
    this.halo.scale.setScalar(3.4);
    this.halo.renderOrder = 3;
    this.group.add(this.halo);

    // Smoke and sparks live in the smoke system's group (world-space emitters)
    const top = at.clone().add(new THREE.Vector3(0, 1.0, 0));
    smoke.add([top], "campfire");
    smoke.group.add(smoke.sparks([top], { perSource: 46, life: 2.4, up: [1.6, 3.8], lateral: 0.7, gravity: 0.25, size: 0.13, intensity: 6, wind: 0.55 }));

    this.light = new THREE.PointLight("#ff9a45", 26, 0, 2);
    this.light.position.set(0, 1.25, 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -0.002;
    this.light.shadow.radius = 4;
    this.light.shadow.camera.near = 0.3;
    this.light.shadow.camera.far = 30;
    this.group.add(this.light);

    // Bursts of embers when the fire roars up
    const emberMat = owned.add(new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.embers = new Particles({ geometry: new THREE.PlaneGeometry(0.22, 0.22), material: emberMat, max: 160, gravity: 1.2, drag: 0.7, billboard: true, fade: "color", renderOrder: 4 });
    this.group.add(this.embers.mesh);
  }

  /** Make the fire roar up with a burst of embers (celebrations). */
  flare(): void {
    this.roar = 1;
    this.embers.emit(70, (p) => {
      const a = Math.random() * Math.PI * 2;
      p.pos.set(Math.cos(a) * 0.2, 0.8, Math.sin(a) * 0.2);
      p.vel.set(Math.cos(a) * (1 + Math.random() * 2.5), 4 + Math.random() * 5, Math.sin(a) * (1 + Math.random() * 2.5));
      p.color.setRGB(5, 1.8 + Math.random() * 1.5, 0.3);
      p.life = 1.2 + Math.random() * 1.3;
      p.size = 0.6 + Math.random() * 0.9;
    });
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    this.roar = Math.max(0, this.roar - dt * 0.6);
    const r = this.roar;
    const flick = Math.sin(time * 11.3) * 0.5 + Math.sin(time * 17.1 + 1.7) * 0.3 + Math.sin(time * 6.1) * 0.2;
    this.light.intensity = 24 + flick * 4 + r * 40;
    this.light.position.x = Math.sin(time * 7.3) * 0.06;
    this.light.position.z = Math.cos(time * 5.9) * 0.06;
    const boost = 1 + r * 0.9;
    FLAMES.forEach(([x, z, sc, st, ph], i) => {
      const k = sc * boost * (1 + Math.sin(time * 9 + ph * 3) * 0.06);
      this.p.set(x, 0.05, z);
      this.q.setFromAxisAngle(this.p.clone().set(0, 1, 0), ph + time * 0.7);
      this.s.set(k, k * st * (1 + Math.sin(time * 13 + ph) * 0.08), k);
      this.flames.setMatrixAt(i, this.mtx.compose(this.p, this.q, this.s));
    });
    this.flames.instanceMatrix.needsUpdate = true;
    this.halo.scale.setScalar(3.2 + flick * 0.25 + r * 2.5);
    this.haloMat.color.setRGB(1.5 + r * 1.5, 0.55 + r * 0.6, 0.14);
    this.embers.update(dt, camera, time);
  }
}
