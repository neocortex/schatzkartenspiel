/**
 * Builds the whole enchanted-forest scene: twilight lighting, the ground,
 * brook, trees, plants, grass, thorn bushes, the five berries, the air full
 * of light shafts, mist and fireflies, and the walkability grid. Owns
 * everything static or self-animating; the challenge (index.ts) owns the
 * rules and the fox's behaviour.
 */

import * as THREE from "three";
import { Colliders } from "../../world/Colliders";
import { glowTexture } from "../../world/ambient/textures";
import { Bursts } from "../shared/bursts";
import { GlowField } from "../cave/materials";
import { Atmosphere, SUN_DIR } from "./atmosphere";
import { Berry, createBerrySpots } from "./berries";
import { Brook } from "./brook";
import { createForestGround } from "./ground";
import { Grass } from "./grass";
import { ForestField } from "./layout";
import { NavGrid } from "./nav";
import { ForestPlants } from "./plants";
import { Thorns } from "./thorns";
import { ForestTrees } from "./trees";

export class ForestWorld {
  readonly scene = new THREE.Scene();
  readonly time = { value: 0 };
  readonly field = new ForestField();
  readonly glow = new GlowField();
  readonly colliders = new Colliders();
  readonly thorns: Thorns;
  readonly berries: Berry[];
  readonly nav: NavGrid;
  /** Additive sparkles (berries, fox tail) and soft leaf/petal puffs (thorn bumps). */
  readonly sparks: Bursts;
  readonly leaves: Bursts;
  /** Materials created here (disposed on exit; `mat()` materials are shared and kept). */
  readonly owned: THREE.Material[] = [];
  private grass: Grass;
  private sun: THREE.DirectionalLight;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color("#101b36");
    s.fog = new THREE.Fog("#16223f", 22, 50);
    s.add(new THREE.HemisphereLight("#8ea8dc", "#33284a", 0.85));

    // Low golden sun slanting through the canopy, matching the light shafts
    this.sun = new THREE.DirectionalLight("#ffdca6", 1.6);
    this.sun.position.copy(SUN_DIR).multiplyScalar(-40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -34;
    cam.right = cam.top = 34;
    cam.near = 1;
    cam.far = 90;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun, this.sun.target);

    const tex = glowTexture();
    const field = this.field;
    this.thorns = new Thorns(field, this.colliders);
    const plants = new ForestPlants(field, this.glow, this.colliders);
    const brook = new Brook(field, this.glow, this.time);
    const atmosphere = new Atmosphere(field, this.glow, this.time);
    const trees = new ForestTrees(field, this.colliders);

    // Every glow source is known now: bake ground, trees and plants
    const ground = createForestGround(field, this.glow);
    this.owned.push(ground.material as THREE.Material);
    trees.build(this.glow, this.time);
    plants.build(this.time);
    this.grass = new Grass(field, this.time);
    s.add(ground, brook.group, trees.group, plants.group, this.thorns.group, this.grass.mesh, atmosphere.group);

    this.berries = createBerrySpots(field, atmosphere, tex, this.time, this.owned);
    for (const b of this.berries) s.add(b.group, b.beam);
    this.owned.push(...brook.materials, ...trees.materials, ...plants.materials, ...atmosphere.materials, this.thorns.material, this.grass.material);

    this.nav = new NavGrid(field, this.colliders, this.thorns.spots);
    this.sparks = new Bursts(tex, true);
    this.leaves = new Bursts(tex, false);
    s.add(this.sparks.mesh, this.leaves.mesh);
  }

  update(dt: number, time: number, player: THREE.Vector3): void {
    this.time.value = time;
    for (const b of this.berries) b.update(dt, time, this.sparks);
    this.thorns.update(dt, time);
    this.sparks.update(dt);
    this.leaves.update(dt);
    this.grass.update(player);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const m of this.owned) m.dispose();
    for (const b of this.berries) b.dispose();
    this.sparks.dispose();
    this.leaves.dispose();
    this.sun.dispose();
  }
}
