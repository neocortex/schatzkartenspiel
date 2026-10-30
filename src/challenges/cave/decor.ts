/**
 * Cave decor: scatters boulders along the wall feet, stalagmites, stalactites
 * hanging from the rock lips, pebbles, wet puddles, glowing crystal clusters
 * and mushroom clusters. Placement happens first (so the glowing things can
 * register as glow sources before the terrain is baked); `build()` then turns
 * the placements into a handful of instanced meshes.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { Colliders } from "../../world/Colliders";
import { CaveField, CELL, COLS, ROWS, cellPos } from "./layout";
import { GlowField, crystalMaterial, glowMaterial, instances, rockMaterial } from "./materials";
import { CRYSTAL_TINTS, boulder, crystalBase, crystalCluster, mushroomCluster, pebble, stalagmite } from "./models";

type Kind = "teal" | "violet";

interface Spot {
  m: THREE.Matrix4;
  pos: THREE.Vector3;
}

/** Big crystal clusters at hand-picked spots (cell coords); the first ones get a real light. */
export const HERO_CRYSTALS: { cell: [number, number]; kind: Kind; scale: number }[] = [
  { cell: [3.1, 5.0], kind: "violet", scale: 1.5 },
  { cell: [12.9, 7.1], kind: "violet", scale: 1.5 },
  { cell: [4.7, 13.6], kind: "teal", scale: 1.4 },
  { cell: [11.4, 10.0], kind: "violet", scale: 1.4 },
  { cell: [1.0, 12.3], kind: "violet", scale: 1.2 },
  { cell: [15.0, 12.3], kind: "teal", scale: 1.2 },
  { cell: [6.0, 1.0], kind: "teal", scale: 1.3 },
  { cell: [10.0, 1.0], kind: "violet", scale: 1.3 },
  { cell: [9.6, 16.4], kind: "violet", scale: 1.0 },
  // Reason: nothing near the test may look like its green crystal, so the hall is violet only
  { cell: [12.9, 5.0], kind: "violet", scale: 1.1 },
  { cell: [3.1, 7.1], kind: "violet", scale: 1.1 },
];

export const CRYSTAL_HEX: Record<Kind, string> = { teal: "#3ff2d8", violet: "#b77bff" };
// Reason: all cool colours, so the mole's golden mushrooms are the only warm ones in the cave and can't be mixed up
const MUSHROOM_CAPS = [new THREE.Color(0.08, 0.55, 0.85), new THREE.Color(0.35, 0.25, 0.95), new THREE.Color(0.08, 0.7, 0.62)];

export class CaveDecor {
  readonly group = new THREE.Group();
  /** World positions of the hero crystals (for real-time lights). */
  readonly heroes: { pos: THREE.Vector3; kind: Kind }[] = [];
  private rand = mulberry32(31);
  private crystals: Record<Kind, Spot[]> = { teal: [], violet: [] };
  private mushrooms: Spot[][] = [[], [], []];
  private boulders: Spot[] = [];
  private stalagmites: Spot[] = [];
  private stalactites: Spot[] = [];
  private pebbles: Spot[] = [];
  private puddles: Spot[] = [];

  constructor(
    private field: CaveField,
    private glow: GlowField,
    private colliders: Colliders,
    private keepOut: { x: number; z: number; r: number }[],
  ) {
    this.placeCrystals();
    this.placeMushrooms();
    this.placeRocks();
  }

  // ── Placement ──────────────────────────────────────────────

  private free(x: number, z: number, pad = 0): boolean {
    return !this.keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad);
  }

  /** Random point whose open-distance lies in [lo, hi] (negative = inside rock). */
  private spot(lo: number, hi: number, pad = 0, tries = 400): [number, number] | null {
    const w = COLS * CELL;
    const d = ROWS * CELL;
    for (let i = 0; i < tries; i++) {
      const x = (this.rand() - 0.5) * w;
      const z = (this.rand() - 0.5) * d;
      const o = this.field.openAt(x, z);
      if (o >= lo && o <= hi && this.field.waterAt(x, z) < -0.3 && this.free(x, z, pad)) return [x, z];
    }
    return null;
  }

  /** Nearest point to (x, z) that sits at a wall foot. */
  private snapToWall(x: number, z: number): [number, number] {
    let best: [number, number] = [x, z];
    let bestD = Infinity;
    for (let a = 0; a < 24; a++) {
      for (let r = 0; r <= 3; r += 0.25) {
        const px = x + Math.cos((a / 24) * Math.PI * 2) * r;
        const pz = z + Math.sin((a / 24) * Math.PI * 2) * r;
        const o = this.field.openAt(px, pz);
        if (o > -0.25 && o < 0.15 && r < bestD) {
          bestD = r;
          best = [px, pz];
        }
      }
    }
    return best;
  }

  private matrix(x: number, y: number, z: number, scale: number | THREE.Vector3, yaw = this.rand() * Math.PI * 2, tilt = 0): THREE.Matrix4 {
    const s = typeof scale === "number" ? new THREE.Vector3(scale, scale, scale) : scale;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * (this.rand() - 0.5), yaw, tilt * (this.rand() - 0.5)));
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, s);
  }

  private addCrystal(x: number, z: number, kind: Kind, scale: number, hero: boolean): void {
    const y = this.field.heightAt(x, z) - 0.05;
    const m = this.matrix(x, y, z, scale, undefined, 0.5);
    const pos = new THREE.Vector3(x, y, z);
    this.crystals[kind].push({ m, pos });
    const lift = new THREE.Vector3(x, y + 0.8 * scale, z);
    this.glow.add(lift, CRYSTAL_HEX[kind], hero ? 5.5 * scale : 3.6 * scale, hero ? 1.4 : 0.9);
    if (hero) this.heroes.push({ pos: lift, kind });
    if (this.field.openAt(x, z) > 0.1) this.colliders.add(x, z, 0.35 * scale);
  }

  private placeCrystals(): void {
    for (const h of HERO_CRYSTALS) {
      const [x, z] = this.snapToWall(...cellPos(...h.cell));
      this.addCrystal(x, z, h.kind, h.scale, true);
    }
    for (let i = 0; i < 26; i++) {
      const s = this.spot(-0.3, 0.12, 0.8);
      if (s) this.addCrystal(s[0], s[1], this.rand() < 0.5 ? "teal" : "violet", 0.45 + this.rand() * 0.5, false);
    }
  }

  private placeMushrooms(): void {
    for (let i = 0; i < 30; i++) {
      const s = this.spot(0.0, 0.5, 0.6);
      if (!s) continue;
      const kind = Math.floor(this.rand() * 3);
      const [x, z] = s;
      const scale = 0.8 + this.rand() * 0.7;
      const pos = new THREE.Vector3(x, this.field.heightAt(x, z), z);
      this.mushrooms[kind].push({ m: this.matrix(x, pos.y - 0.02, z, scale), pos });
      const c = MUSHROOM_CAPS[kind];
      this.glow.add(pos.clone().setY(pos.y + 0.4), new THREE.Color(c.r, c.g, c.b).multiplyScalar(0.6), 2.6, 1.0);
    }
  }

  private placeRocks(): void {
    // A few boulders poking out of the pool
    for (let i = 0, placed = 0; i < 400 && placed < 5; i++) {
      const x = (this.rand() - 0.5) * COLS * CELL;
      const z = (this.rand() - 0.5) * ROWS * CELL;
      if (this.field.waterAt(x, z) < 0.5) continue;
      this.boulders.push(this.spotAt(x, -0.62, z, 0.75 + this.rand() * 0.5));
      placed++;
    }
    for (let i = 0; i < 170; i++) {
      const s = this.spot(-0.45, 0.2);
      if (!s) continue;
      const [x, z] = s;
      const scale = 0.4 + this.rand() * 0.75;
      this.boulders.push(this.spotAt(x, this.field.heightAt(x, z) - 0.12 * scale, z, scale));
    }
    for (let i = 0; i < 26; i++) {
      const s = this.spot(0.4, 1.0, 1.4);
      if (!s) continue;
      const [x, z] = s;
      const scale = 0.6 + this.rand() * 0.6;
      this.stalagmites.push(this.spotAt(x, this.field.heightAt(x, z) - 0.05, z, scale));
      this.colliders.add(x, z, 0.38 * scale);
    }
    for (let i = 0; i < 70; i++) {
      const s = this.spot(-1.1, -0.55);
      if (!s) continue;
      const [x, z] = s;
      const scale = 0.5 + this.rand() * 0.6;
      // Reason: hang from the rock lip (the geometry is a stalagmite turned upside down)
      const y = this.field.heightAt(x, z) + 0.15;
      const m = this.matrix(x, y, z, new THREE.Vector3(scale * 0.8, scale * 1.3, scale * 0.8));
      this.stalactites.push({ m, pos: new THREE.Vector3(x, y - scale, z) });
    }
    for (let i = 0; i < 320; i++) {
      const s = this.spot(0.2, 4);
      if (!s) continue;
      const [x, z] = s;
      this.pebbles.push(this.spotAt(x, this.field.heightAt(x, z), z, 0.6 + this.rand() * 1.2));
    }
    for (let i = 0; i < 14; i++) {
      const s = this.spot(0.8, 4, 0.5);
      if (!s) continue;
      const [x, z] = s;
      const m = this.matrix(x, this.field.heightAt(x, z) + 0.035, z, new THREE.Vector3(0.6 + this.rand() * 1.1, 1, 0.4 + this.rand() * 0.7));
      this.puddles.push({ m, pos: new THREE.Vector3(x, 0, z) });
    }
  }

  private spotAt(x: number, y: number, z: number, scale: number): Spot {
    return { m: this.matrix(x, y, z, scale), pos: new THREE.Vector3(x, y, z) };
  }

  // ── Meshes ─────────────────────────────────────────────────

  /** Build the instanced meshes (call after all glow sources are registered). */
  build(time: { value: number }, materials: THREE.Material[]): void {
    const rock = rockMaterial({ xray: true });
    const crystal = crystalMaterial(2.3, time);
    const caps = glowMaterial();
    // Reason: a soft glimmer, below the bloom; only the mole's golden mushrooms may catch the eye
    caps.color.setScalar(0.5);
    const puddle = new THREE.MeshStandardMaterial({ color: "#3a4d6e", emissive: "#1d2c48", roughness: 0.06, transparent: true, opacity: 0.6, depthWrite: false });
    materials.push(rock, crystal, caps, puddle);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, spots: Spot[], glow = true, shadows = true) => {
      if (!spots.length) return;
      const mesh = instances(geo, mat, spots.map((s) => s.m), glow ? this.glow : null, shadows);
      this.group.add(mesh);
      geo.dispose();
    };
    // Reason: split each list across a few model variants so repeated shapes don't read as copies
    const variants = <T>(list: T[], n: number) => Array.from({ length: n }, (_, v) => list.filter((_, i) => i % n === v));

    for (const kind of ["teal", "violet"] as const) {
      variants(this.crystals[kind], 3).forEach((spots, v) => {
        add(crystalCluster(v * 7 + (kind === "teal" ? 1 : 2), CRYSTAL_TINTS[kind]), crystal, spots, false);
        add(crystalBase(v + 3), rock, spots);
      });
    }
    this.mushrooms.forEach((spots, k) => {
      const geo = mushroomCluster(k * 11 + 4, MUSHROOM_CAPS[k]);
      add(geo.stems, rock, spots, true, false);
      add(geo.caps, caps, spots, false, false);
    });
    variants(this.boulders, 3).forEach((spots, v) => add(boulder(v + 1), rock, spots));
    variants(this.stalagmites, 2).forEach((spots, v) => add(stalagmite(v + 1, 1.6), rock, spots));
    variants(this.stalactites, 2).forEach((spots, v) => add(stalagmite(v + 5, 1.2).rotateX(Math.PI), rock, spots));
    variants(this.pebbles, 2).forEach((spots, v) => add(pebble(v), rock, spots, true, false));
    add(new THREE.CircleGeometry(0.5, 18).rotateX(-Math.PI / 2), puddle, this.puddles, false, false);
  }
}
