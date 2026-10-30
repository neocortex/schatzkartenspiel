/**
 * Site — collects the models of one landmark in world space. Knows the
 * terrain (to ground props), the collider set and the sign atlas, so set-piece
 * code can simply say "put this crate here".
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { Colliders } from "../Colliders";
import { WorldUniforms } from "../Terrain";
import { Model, emptyModel, addModel, placeAt } from "./shapes";
import { SignAtlas } from "./signs";
import { LandmarkMaterials } from "./effects";

/** A straight walkable plank surface (pier or bridge) above terrain or water. */
export interface Deck {
  /** Start point (x, z) and unit direction of the deck's centre line. */
  start: THREE.Vector2;
  dir: THREE.Vector2;
  length: number;
  /** Half width at along-distance s. */
  halfWidth: (s: number) => number;
  /** Walk-surface height at along-distance s. */
  height: (s: number) => number;
}

/** What the set-piece builders can register with the landmark system. */
export interface LandmarkContext {
  readonly hf: Heightfield;
  readonly colliders: Colliders;
  readonly atlas: SignAtlas;
  readonly world: WorldUniforms;
  readonly materials: LandmarkMaterials;
  readonly vents: THREE.Vector3[];
  /** Create a site whose model is merged into meshes once building is done. */
  site(name: string): Site;
  /** Register a walkable deck (also opens the heightfield underneath). */
  deck(d: Deck): void;
  /** Add a separately animated boat (bobbing on the water). */
  boat(name: string, model: Model, x: number, z: number, rotY: number): void;
  /** Add a boat lying on land (model in world space, no bobbing); `setBoatVisible` puts up its colliders and takes them away. */
  beached(name: string, model: Model, blockers: [number, number, number][]): void;
  /** Add a custom object (lava, waterfall, ...). */
  add(obj: THREE.Object3D): void;
  /** Run every frame. */
  animate(fn: (time: number, dt: number) => void): void;
}

export class Site {
  readonly model: Model = emptyModel();

  constructor(
    readonly name: string,
    readonly hf: Heightfield,
    readonly colliders: Colliders,
    readonly atlas: SignAtlas,
  ) {}

  ground(x: number, z: number): number {
    return this.hf.heightAt(x, z);
  }

  /** Lowest terrain point under a disc, so wide props sink in rather than float on slopes. */
  groundMin(x: number, z: number, r: number): number {
    let h = this.ground(x, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      h = Math.min(h, this.ground(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return h;
  }

  /** Place a model on the ground at (x, z); `r` = footprint radius used to find the ground. */
  put(m: Model, x: number, z: number, rotY = 0, scale = 1, r = 0.4, lift = 0): void {
    this.putAt(m, x, this.groundMin(x, z, r) + lift, z, rotY, scale);
  }

  putAt(m: Model, x: number, y: number, z: number, rotY = 0, scale = 1): void {
    addModel(this.model, m, placeAt(x, y, z, rotY, scale));
  }

  /** Add a solid circle collider and clear grass around it. */
  block(x: number, z: number, r: number): void {
    this.colliders.add(x, z, r);
    this.hf.clearGrass(x, z, r);
  }

  /** World position of a local offset (lx, lz) from (x, z) rotated by rotY. */
  static local(x: number, z: number, rotY: number, lx: number, lz: number): [number, number] {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    return [x + lx * c + lz * s, z - lx * s + lz * c];
  }

  /** Clear grass in a disc (under floors and props). */
  clearGrass(x: number, z: number, r: number): void {
    this.hf.clearGrass(x, z, r);
  }

  /** Clear grass along a segment. */
  clearGrassLine(a: THREE.Vector2, b: THREE.Vector2, r: number): void {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / (r * 0.8)));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      this.hf.clearGrass(p.x, p.y, r);
    }
  }
}
