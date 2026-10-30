/**
 * VolcanoSet — everything that dresses the course: bridges, checkpoint
 * cairns and flags, the goal arch with its golden beacon, obsidian and fire
 * crystals, ember vents, smoke, steam and floating embers,
 * plus the instanced scatter and the sea.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { part } from "../../core/geo";
import { Model, emptyModel, addModel, placeAt, rockBlob, stoneFn } from "../../world/models/shapes";
import { createMaterials, LandmarkMaterials } from "../../world/models/effects";
import { ventRing } from "../../world/models/props";
import { SmokeSystem } from "../../world/ambient/Smoke";
import { createWater } from "../../world/Water";
import { Colliders } from "../../world/Colliders";
import { Beacon } from "../../game/Beacon";
import { WorldUniforms } from "../../world/Terrain";
import { meshesFromModel } from "./kit/models";
import { Course, RIVER_HALF } from "./course";
import { bridgeModel, cairnModel, createFlag, goalArch, CheckpointFlag } from "./props";
import { Scatter } from "./scatter";

export class VolcanoSet {
  readonly group = new THREE.Group();
  readonly flags: CheckpointFlag[] = [];
  readonly beacon = new Beacon();
  readonly smoke: SmokeSystem;
  readonly materials: LandmarkMaterials;
  /** Glowing lantern points on the goal arch. */
  readonly goalAt: THREE.Vector3;
  private rand = mulberry32(99);

  constructor(private course: Course, world: WorldUniforms, horizon: THREE.Color, readonly colliders: Colliders) {
    this.materials = createMaterials(world);
    this.smoke = new SmokeSystem(world);
    const model = emptyModel();

    course.bridges.forEach((b, i) => addModel(model, bridgeModel(b, 40 + i * 13)));

    course.checkpoints.forEach((cp, i) => {
      // Reason: the cairn stands at the trail edge, not in the middle where Tadeo respawns
      const t = course.tangentAt(cp.s);
      const off = course.halfWidth(cp.s) - 1.9;
      const x = cp.pos.x + t.y * off;
      const z = cp.pos.y - t.x * off;
      const y = course.ground(x, z);
      addModel(model, cairnModel(x - 1.05, y, z, 7 + i));
      const flag = createFlag(x - 1.05, y, z, this.materials.cloth);
      this.flags.push(flag);
      this.group.add(flag.mesh, flag.ring);
      this.colliders.add(x, z - 0.1, 0.6);
    });

    const arch = goalArch(course, course.goalS + 2, 5);
    addModel(model, arch.model);
    const archT = course.tangentAt(course.goalS + 2, 5);
    const archP = course.pointAt(course.goalS + 2);
    for (const side of [-1, 1]) this.colliders.add(archP.x - archT.y * side * 4.2, archP.y + archT.x * side * 4.2, 0.7);
    this.goalAt = new THREE.Vector3(archP.x, course.trailHeight(course.goalS + 2), archP.y);
    this.beacon.set(this.goalAt);

    this.decorations(model);
    this.group.add(meshesFromModel(model, this.materials, "volcano-set"));

    this.group.add(new Scatter(course, this.materials.solid, colliders).group);
    this.group.add(this.smoke.group, this.beacon.group);
    const water = createWater(world, horizon);
    this.group.add(water);
  }

  /** Off-trail spot at distance band [a, b] beyond the trail edge (null when blocked). */
  private spotNear(s: number, a: number, b: number): THREE.Vector3 | null {
    const c = this.course;
    const p = c.pointAt(s);
    const t = c.tangentAt(s);
    const side = this.rand() < 0.5 ? -1 : 1;
    const off = (c.halfWidth(s) + a + this.rand() * (b - a)) * side;
    const x = p.x - t.y * off;
    const z = p.y + t.x * off;
    if (c.riverDist(x, z) < RIVER_HALF + 2 || c.natural(x, z) < 0.8 || c.bridgeAt(x, z)) return null;
    return new THREE.Vector3(x, c.terrain(x, z), z);
  }

  private decorations(model: Model): void {
    const c = this.course;
    const r = this.rand;
    // Obsidian shard clusters with little glowing fire crystals
    for (let i = 0; i < 26; i++) {
      const at = this.spotNear(r() * (c.goalS - 6), 1.4, 9);
      if (at) addModel(model, crystalCluster(i * 17 + 3), placeAt(at.x, at.y - 0.1, at.z, r() * 6.28, 0.8 + r() * 0.6));
    }
    // Ember vents puffing steam
    const vents: THREE.Vector3[] = [];
    for (let i = 0; i < 40 && vents.length < 9; i++) {
      const at = this.spotNear(6 + r() * (c.goalS - 12), 2.2, 7);
      if (!at || vents.some((v) => v.distanceTo(at) < 9)) continue;
      addModel(model, ventRing(i * 5 + 2, 1.0 + r() * 0.4), placeAt(at.x, at.y - 0.12, at.z, r() * 6.28));
      vents.push(at.clone().setY(at.y + 0.3));
    }
    if (vents.length) this.smoke.add(vents, "steam");

    // Floating embers above the lava rivers near the trail
    const embers: THREE.Vector3[] = [];
    c.rivers.forEach((rv, i) => {
      const ys = c.riverProfile(i);
      for (let k = 0; k < rv.pts.length; k += 28) {
        const p = rv.pts[k];
        if (c.trailDist(p.x, p.y) > 40 || c.natural(p.x, p.y) < 0.3) continue;
        embers.push(new THREE.Vector3(p.x, ys[k] + 0.2, p.y));
      }
    });
    this.group.add(
      this.smoke.sparks(embers, { perSource: 14, life: 2.6, up: [0.8, 2.4], lateral: 0.9, gravity: -0.3, size: 0.16, intensity: 6, wind: 0.6 }),
    );
  }

  update(dt: number, time: number, player: THREE.Vector3, camera: THREE.Camera): void {
    this.beacon.update(dt, time, player.distanceTo(this.goalAt), camera);
    for (const f of this.flags) {
      if (!f.active) continue;
      const m = f.ring.material as THREE.MeshBasicMaterial;
      m.opacity = 0.55 + 0.35 * Math.sin(time * 4);
    }
  }
}

/** Cluster of obsidian shards on a rock with a few glowing fire crystals. */
function crystalCluster(seed: number): Model {
  const rand = mulberry32(seed);
  const m = emptyModel();
  const base = rockBlob(seed, [0.7, 0.35, 0.6], stoneFn("#3f343b", 0, rand), 1);
  m.solid.push(base);
  const n = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const g = new THREE.OctahedronGeometry(0.2 + rand() * 0.14, 0);
    g.scale(1, 2.6 + rand() * 1.8, 1);
    const a = rand() * 6.28;
    const col = new THREE.Color().setHSL(0.74 + rand() * 0.06, 0.45, 0.16 + rand() * 0.12);
    m.solid.push(part(g, col, { pos: [Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.3], rot: [Math.cos(a) * 0.45, rand() * 3, Math.sin(a) * 0.45] }));
  }
  for (let i = 0; i < 2; i++) {
    const a = rand() * 6.28;
    const g = new THREE.OctahedronGeometry(0.1 + rand() * 0.05, 0);
    g.scale(1, 1.8, 1);
    m.pulse.push(part(g, new THREE.Color(3.4, 1.2, 0.2), { pos: [Math.cos(a) * 0.55, 0.22, Math.sin(a) * 0.55], rot: [0.4, a, 0.2] }));
  }
  return m;
}
