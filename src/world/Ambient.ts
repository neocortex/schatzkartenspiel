/**
 * Ambient life — birds, butterflies, fireflies, smoke, embers and other small
 * moving details that make the island feel alive. Fixed effects (volcano
 * plume, forest and swamp fireflies, jungle mist, lake, lagoon and pond life,
 * village animals, dolphins) live at their landmarks; small critters, pollen
 * and leaves spawn around the focus and recycle as it moves (ground critters
 * also shy away from it, since it is usually the player). Each region has its
 * own animals: turtles at the lagoon, parrots in the jungle, frogs in the swamp
 * and sheep on the flower hills. Everything is instanced; particles animate
 * entirely on the GPU.
 */

import * as THREE from "three";
import { Heightfield } from "./Heightfield";
import { Colliders } from "./Colliders";
import { WorldUniforms } from "./Terrain";
import { Butterflies } from "./ambient/Butterflies";
import { Birds } from "./ambient/Birds";
import { SmokeSystem } from "./ambient/Smoke";
import { Volcano } from "./ambient/Volcano";
import { Fireflies } from "./ambient/Fireflies";
import { Motes } from "./ambient/Motes";
import { Lake } from "./ambient/Lake";
import { Crabs } from "./ambient/Crabs";
import { Rabbits } from "./ambient/Rabbits";
import { Village } from "./ambient/Village";
import { Leaves } from "./ambient/Leaves";
import { Turtles } from "./ambient/Turtles";
import { Frogs } from "./ambient/Frogs";
import { Sheep } from "./ambient/Sheep";
import { Parrots } from "./ambient/Parrots";
import { Dolphins } from "./ambient/Dolphins";
import { REGION_INDEX } from "./regions";
import { SPOTS } from "./layout";

export class Ambient {
  readonly group = new THREE.Group();
  private smoke: SmokeSystem;
  private volcano: Volcano;
  private butterflies: Butterflies;
  private birds: Birds;
  private motes: Motes;
  private lake: Lake;
  private crabs: Crabs;
  private rabbits: Rabbits;
  private village: Village;
  private leaves: Leaves;
  private waters: Lake[];
  private turtles: Turtles;
  private frogs: Frogs;
  private sheep: Sheep;
  private parrots: Parrots;
  private dolphins: Dolphins;

  /**
   * @param colliders Optional prop/tree colliders; when given, hens, crabs and
   *   rabbits walk around trees, houses and props instead of through them.
   */
  constructor(
    readonly hf: Heightfield,
    readonly world: WorldUniforms,
    colliders: Colliders | null = null,
  ) {
    this.smoke = new SmokeSystem(world);
    this.volcano = new Volcano(hf, this.smoke);
    this.butterflies = new Butterflies(hf);
    this.birds = new Birds(hf);
    this.motes = new Motes(world);
    this.lake = new Lake(hf, world);
    this.crabs = new Crabs(hf, colliders);
    this.rabbits = new Rabbits(hf, colliders);
    this.village = new Village(hf, colliders);
    this.leaves = new Leaves(hf, world);
    this.waters = [
      new Lake(hf, world, { at: SPOTS.lagoonWater, radius: 14, deep: -0.7 }),
      new Lake(hf, world, { at: SPOTS.swampPond, radius: 14, deep: -1.0 }),
    ];
    this.turtles = new Turtles(hf, colliders);
    this.frogs = new Frogs(hf, colliders);
    this.sheep = new Sheep(hf, colliders);
    this.parrots = new Parrots(hf);
    this.dolphins = new Dolphins(hf);
    const swampFireflies = new Fireflies(hf, world, {
      name: "fireflies:swamp",
      at: SPOTS.swampPond,
      radius: 22,
      count: 140,
      ok: (x, z) => hf.regionAt(x, z, REGION_INDEX.swamp) > 0.5 && hf.heightAt(x, z) > -1.5,
    });
    this.smoke.add(jungleMist(hf), "mist");
    this.group.add(
      swampFireflies.object,
      ...this.waters.map((w) => w.group),
      this.turtles.object,
      this.frogs.object,
      this.sheep.object,
      this.parrots.object,
      this.dolphins.object,
      this.smoke.group,
      this.volcano.group,
      new Fireflies(hf, world).object,
      this.motes.object,
      this.butterflies.object,
      this.birds.group,
      this.lake.group,
      this.crabs.object,
      this.rabbits.object,
      this.village.group,
      this.leaves.object,
    );
  }

  /**
   * Add smoke columns rising from world points (chimney tops, steam vents,
   * campfires — campfires also spit sparks). Returns the created object;
   * remove it from its parent to stop the smoke.
   */
  addSmoke(points: THREE.Vector3[], style: "chimney" | "steam" | "campfire"): THREE.Object3D {
    return this.smoke.add(points, style);
  }

  /** `focus` is the point the camera looks at (usually the player). */
  update(dt: number, time: number, focus: THREE.Vector3): void {
    this.volcano.update(time);
    this.motes.update(focus);
    this.butterflies.update(dt, time, focus);
    this.birds.update(dt, time, focus);
    this.lake.update(dt, time);
    this.crabs.update(dt, focus);
    this.rabbits.update(dt, time, focus);
    this.village.update(dt, time, focus);
    this.leaves.update(time, focus);
    for (const w of this.waters) w.update(dt, time);
    this.turtles.update(dt, focus);
    this.frogs.update(dt, time, focus);
    this.sheep.update(dt, time, focus);
    this.parrots.update(dt, time, focus);
    this.dolphins.update(time);
  }
}

/** Mist sources on a loose grid over the jungle's inland ground. */
function jungleMist(hf: Heightfield): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let x = -54; x <= 54; x += 13) {
    for (let z = 66; z <= 134; z += 13) {
      const h = hf.heightAt(x, z);
      if (hf.regionAt(x, z, REGION_INDEX.jungle) > 0.7 && h > 1) points.push(new THREE.Vector3(x, h + 0.4, z));
    }
  }
  return points;
}
