/**
 * Ambient life — birds, butterflies, fireflies, smoke, embers and other small
 * moving details that make the island feel alive. Fixed effects (volcano
 * plume, forest fireflies, lake, village animals) live at their landmarks;
 * small critters, pollen and leaves spawn around the focus and recycle as it
 * moves (ground critters also shy away from it, since it is usually the
 * player). Everything is instanced; particles animate entirely on the GPU.
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
    this.group.add(
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
  }
}
