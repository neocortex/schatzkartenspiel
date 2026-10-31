/**
 * The ogre's gorge as a set: sky, sunlight with soft shadows, the ravine
 * terrain, the flowing river and the upper stream, the waterfall with foam,
 * mist and a rainbow, the island's arched wooden bridge, and (via
 * `dressGorge`) rocks, plants, vines, the ogre's camp and ambient critters.
 */

import * as THREE from "three";
import { createSkyDome, Clouds, DAY_SKY } from "../../world/Sky";
import { bridge } from "../../world/models/structures";
import { Bin, ModelMaterials, modelMaterials, modelGroup } from "./kit";
import { Fx } from "./fx";
import { BRIDGE, FALLS, UPPER_WATER, deckAt, heightAt, riverX, bakeHeights, createTerrain } from "./gorgeShape";
import { riverMaterial, fallMaterial, fallRibbon, foamMaterial, rainbow, RiverUniforms } from "./river";
import { dressGorge, Dressing } from "./gorgeDressing";
import { Critters } from "./critters";

export class Gorge {
  readonly sunDir = new THREE.Vector3(-0.38, 0.8, 0.46).normalize();
  readonly sun: THREE.DirectionalLight;
  /** The bridge (bounces when the ogre slams the deck). */
  readonly bridge = new THREE.Group();
  readonly mats: ModelMaterials;
  readonly uniforms: RiverUniforms;
  private clouds = new Clouds(16, 21);
  private critters: Critters;
  private dressing: Dressing;
  private mistTimer = 0;
  private fallBase: THREE.Vector3;

  constructor(
    private scene: THREE.Scene,
    private fx: Fx,
    private bin: Bin,
  ) {
    this.mats = modelMaterials(bin);
    this.uniforms = { uTime: { value: 0 }, uSunDir: { value: this.sunDir } };

    scene.fog = new THREE.Fog(DAY_SKY.horizon.clone(), 70, 300);
    const sky = createSkyDome(this.sunDir);
    // Reason: sky and cloud materials are created per call, so this challenge owns (and frees) them
    sky.userData.ownMaterial = true;
    this.clouds.group.traverse((o) => (o.userData.ownMaterial = true));
    scene.add(sky, this.clouds.group);
    scene.add(new THREE.HemisphereLight("#d6ecff", "#6b7d45", 1.1));
    this.sun = new THREE.DirectionalLight("#fff1dc", 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const cam = this.sun.shadow.camera;
    cam.left = -26;
    cam.right = 26;
    cam.top = 26;
    cam.bottom = -26;
    cam.near = 1;
    cam.far = 160;
    this.sun.target.position.set(0, 3, -6);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 70);
    scene.add(this.sun, this.sun.target);

    scene.add(createTerrain(-90, -130, 180, 175, 0.6));
    this.fallBase = new THREE.Vector3(riverX(FALLS.z), 0, FALLS.z + 3.4);
    this.buildWater();
    this.buildBridge();
    this.dressing = dressGorge(scene, this.mats, bin);
    this.critters = new Critters(fx, bin);
    scene.add(this.critters.group);
  }

  update(dt: number, time: number): void {
    this.uniforms.uTime.value = time;
    this.mats.time.value = time;
    this.clouds.update(dt);
    this.critters.update(dt);
    this.dressing.update(dt, time, this.fx);
    // Spray rising from the plunge pool
    this.mistTimer -= dt;
    if (this.mistTimer < 0) {
      this.mistTimer = 0.07;
      const b = this.fallBase;
      this.fx.puff.emit({
        at: new THREE.Vector3(b.x + (Math.random() - 0.5) * 5, 0.3, b.z + (Math.random() - 0.5) * 2),
        count: 1,
        speed: [0.6, 1.6],
        dir: new THREE.Vector3(0, 1, 0.5),
        spread: 0.6,
        drag: 0.6,
        gravity: -0.3,
        life: [2.2, 3.4],
        size: [1.4, 4.2],
        color: "#ffffff",
        alpha: 0.32,
        spin: 0.4,
      });
    }
  }

  private buildWater(): void {
    const bake = bakeHeights(-60, -110, 140);
    this.bin.texture(bake.texture);
    const pool = new THREE.Vector2(this.fallBase.x, this.fallBase.z);
    const lowerGeo = new THREE.PlaneGeometry(140, 150, 140, 150).rotateX(-Math.PI / 2);
    lowerGeo.translate(0, 0, FALLS.z + 2 + 75);
    const lower = new THREE.Mesh(lowerGeo, this.bin.material(riverMaterial(this.uniforms, bake, DAY_SKY.horizon, pool, 1.7)));
    lower.renderOrder = 1;
    this.scene.add(lower);
    const upperGeo = new THREE.PlaneGeometry(140, 80, 70, 40).rotateX(-Math.PI / 2);
    upperGeo.translate(0, UPPER_WATER, FALLS.z - 1.5 - 40);
    const upper = new THREE.Mesh(upperGeo, this.bin.material(riverMaterial(this.uniforms, bake, DAY_SKY.horizon, new THREE.Vector2(999, 999), 2.2)));
    upper.renderOrder = 1;
    this.scene.add(upper);

    // Main fall plus two thinner side cascades
    const fall = this.bin.material(fallMaterial(this.uniforms));
    const lipZ = FALLS.z - 1.6;
    const x = this.fallBase.x;
    const ribbons: [number, number, number, number][] = [
      [x, 5.4, 2.8, 0],
      [x - 3.6, 1.4, 2.2, -0.35],
      [x + 3.4, 1.1, 2.0, 0.3],
    ];
    for (const [fx, width, reach, top] of ribbons) {
      const lip = new THREE.Vector3(fx, UPPER_WATER + 0.05 + top, lipZ);
      const m = new THREE.Mesh(fallRibbon(lip, -0.1, width, reach), fall);
      m.renderOrder = 2;
      this.scene.add(m);
    }
    const foamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const foamMat = this.bin.material(foamMaterial(this.uniforms));
    for (const [dx, dz, s] of [[0, 0, 9], [-3.4, -0.6, 4], [3.3, -0.6, 4], [0.5, 4, 6]]) {
      const foam = new THREE.Mesh(foamGeo, foamMat);
      foam.scale.set(s, 1, s * 0.75);
      foam.position.set(x + dx, 0.06, this.fallBase.z + dz);
      foam.renderOrder = 2;
      this.scene.add(foam);
    }
    const bow = rainbow(7.5, 1.3, this.uniforms);
    bow.position.set(x + 1.5, -2.2, this.fallBase.z + 3.5);
    bow.rotation.y = -0.12;
    this.scene.add(bow);
  }

  private buildBridge(): void {
    const model = bridge({ span: BRIDGE.span, width: BRIDGE.width, deckAt, ground: heightAt, seed: 6 });
    this.bridge.add(modelGroup(model, this.mats));
    this.scene.add(this.bridge);
  }
}
