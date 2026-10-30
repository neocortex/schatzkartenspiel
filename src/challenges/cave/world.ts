/**
 * Builds the whole natural cave scene: lights, fog, terrain, decor, the puzzle
 * pieces, the mole, the cave paintings, pool, chamber and the ambient life. Owns
 * everything static or self-animating; the challenge (index.ts) owns the rules.
 */

import * as THREE from "three";
import { createMole, Mole } from "../../characters/Mole";
import { Colliders } from "../../world/Colliders";
import { glowTexture } from "../../world/ambient/textures";
import { CaveDecor, CRYSTAL_HEX } from "./decor";
import { Bursts } from "../shared/bursts";
import { CaveField, CRYSTAL_ORDER, CRYSTAL_WALL_CELL, CRYSTALS, MOLE_CELLS, MUSHROOMS, ROCKFALL_CELLS, START_CELL, SWORD_CELL, cellPos } from "./layout";
import { GlowField, instances, rockMaterial } from "./materials";
import { CrystalButton, CrystalWall, MoleWish, Mushroom, Rockfall, TEST_HEX } from "./mechanisms";
import { crystalBase } from "./models";
import { TestPaintings, wayPaintings } from "./paintings";
import { LilyPads, Pool } from "./pool";
import { Chamber } from "./chamber";
import { Bats, Drips } from "./life";
import { Sparkles } from "./sparkles";
import { createCaveTerrain } from "./terrain";

const v3 = (cell: [number, number], y = 0) => {
  const [x, z] = cellPos(...cell);
  return new THREE.Vector3(x, y, z);
};

// Reason: the ways between the stops stay free of boulders and stalagmites
const WALK_LINES: [number, number][] = [
  [6.45, 17.05], [7.2, 16.7], [7.85, 16], [7.9, 15.25],
  [2, 9.5], [2.1, 11.4], [3.2, 12.1], [4.6, 12.0], [5.35, 11.0], [5.7, 10.2], [7.0, 9.7], [7.75, 9.1], [7.85, 8.3],
  [14, 9.5], [13.9, 11.4], [12.8, 12.1], [11.4, 12.0], [10.65, 11.0], [10.3, 10.2], [9.0, 9.7], [8.25, 9.1], [8.15, 8.3],
  [5.25, 6.0], [6.2, 5.3], [7.6, 4.4], [8, 6.1], [8, 4.4], [10.75, 6.0], [9.8, 5.3], [8.4, 4.4],
];

/** Where the pictures along the way hang, on rock facing the camera, and how wide the wall behind them is. */
const WAY_PAINTINGS = {
  heart: { at: cellPos(5.98, 16.55), width: 4.4 },
  thorns: { at: cellPos(5.55, 9.58), width: 5.8 },
  hammer: { at: cellPos(10.45, 9.58), width: 5.8 },
};

/** The opening under the middle test picture. */
const DOOR = { half: 1.95, height: 2.95 };

export class CaveWorld {
  readonly scene = new THREE.Scene();
  readonly time = { value: 0 };
  readonly field = new CaveField();
  readonly glow = new GlowField();
  readonly colliders = new Colliders();
  readonly mushrooms: Mushroom[] = [];
  readonly rockfalls: Rockfall[] = [];
  readonly crystals: CrystalButton[] = [];
  readonly wall: CrystalWall;
  readonly paintings: TestPaintings;
  readonly mole: Mole;
  readonly wish: MoleWish;
  readonly chamber: Chamber;
  readonly pool: Pool;
  readonly sparks: Bursts;
  readonly dust: Bursts;
  readonly sparkles: Sparkles;
  /** Materials created here (disposed on exit; `mat()` materials are shared and kept). */
  readonly owned: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private fog: THREE.Fog;
  private bats: Bats;
  private lilies: LilyPads;
  private drips: Drips;
  private crystalLights: { light: THREE.PointLight; base: number; phase: number }[] = [];

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color("#040308");
    this.fog = new THREE.Fog("#06050c", 13, 32);
    s.fog = this.fog;
    s.add(new THREE.HemisphereLight("#5a6cb8", "#1a1222", 0.24));
    const tex = glowTexture();
    this.sparks = new Bursts(tex, true);
    this.dust = new Bursts(tex, false);

    // Reason: keep decor away from the puzzle pieces and the walking line between them
    const keep: { x: number; z: number; r: number }[] = [];
    const keepCell = (c: number, r: number, rad: number) => {
      const [x, z] = cellPos(c, r);
      keep.push({ x, z, r: rad });
    };
    for (const c of MUSHROOMS) keepCell(...c, 2.1);
    for (const c of CRYSTALS) keepCell(...c.cell, 2.1);
    for (const c of MOLE_CELLS) keepCell(...c, 1.7);
    for (const t of WALK_LINES) keepCell(...t, 0.7);
    for (const g of ROCKFALL_CELLS) keepCell(g[0], g[1] + 0.3, 3.4);
    keepCell(...CRYSTAL_WALL_CELL, 2.4);
    keepCell(...START_CELL, 2);
    keepCell(...SWORD_CELL, 3.4);
    keepCell(8, 11.5, 0.5);
    // Reason: nothing may stand in front of the pictures
    for (let c = 4.5; c <= 11.5; c += 1) keepCell(c, 4.9, 2.2);
    for (const { at, width } of Object.values(WAY_PAINTINGS)) keep.push({ x: at[0], z: at[1] + 0.6, r: width / 2 });
    const keepOut = (x: number, z: number) => keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r);

    // Glow sources first (decor, pool, daylight), then bake the terrain with them
    const decor = new CaveDecor(this.field, this.glow, this.colliders, keep);
    this.glow.add(v3([8, 12], 0.2), "#36d6c8", 6.5, 0.9);
    this.glow.add(v3([8, 20.4], 2.2), "#bcd6ff", 7.5, 1.7);
    this.glow.add(v3(SWORD_CELL, 3), "#ffd68a", 6, 0.7);
    this.glow.add(v3(SWORD_CELL, 1.4), "#7fc8ff", 8.5, 0.75);
    for (const c of MUSHROOMS) this.glow.add(v3(c, 0.7), "#ffb43a", 5.4, 0.95);
    for (const c of CRYSTALS) this.glow.add(v3(c.cell, 1.1), TEST_HEX[c.color], 5.2, 0.55);
    // Reason: a cool glimmer on the fallen rock, so it can be told apart from the dark walls behind it
    for (const c of ROCKFALL_CELLS) this.glow.add(v3(c, 2.6).setZ(v3(c).z + 2.6), "#b6b8ff", 6.4, 0.85);
    // Reason: a faint warm light on the old paintings' rock, so the hall has a clear head end from afar
    this.glow.add(new THREE.Vector3(0, 4.5, cellPos(8, 4.9)[1]), "#ffcf9a", 13, 0.42);
    for (const { at } of Object.values(WAY_PAINTINGS)) this.glow.add(new THREE.Vector3(at[0], 2, at[1] + 1.2), "#ffcf9a", 5, 0.35);
    this.sparkles = new Sparkles(this.field, this.glow, tex, this.time, keepOut);
    this.lilies = new LilyPads(this.field, this.glow, cellPos(8, 12), 10);
    const terrain = createCaveTerrain(this.field, this.glow);
    this.owned.push(terrain.material as THREE.Material);
    s.add(terrain);
    decor.build(this.time, this.owned);
    s.add(decor.group, this.sparkles.group);
    this.owned.push(...this.sparkles.materials);

    // Real-time lights at the biggest crystals of each room
    decor.heroes.slice(0, 4).forEach((h, i) => {
      const light = new THREE.PointLight(CRYSTAL_HEX[h.kind], 7, 8, 1.6);
      light.position.copy(h.pos).add(new THREE.Vector3(0, 0.6, 0));
      s.add(light);
      this.crystalLights.push({ light, base: 7, phase: i * 1.7 });
    });

    // Puzzle pieces
    for (const c of MUSHROOMS) {
      const mushroom = new Mushroom(tex, this.sparks);
      const p = v3(c);
      mushroom.group.position.set(p.x, this.field.heightAt(p.x, p.z), p.z);
      this.colliders.add(p.x, p.z, 0.5);
      this.mushrooms.push(mushroom);
      s.add(mushroom.group);
    }
    ROCKFALL_CELLS.forEach((cell, i) => {
      const rockfall = new Rockfall(v3(cell), 71 + i, this.glow, this.owned);
      this.rockfalls.push(rockfall);
      s.add(rockfall.group);
    });
    const baseRock = rockMaterial({ xray: true });
    this.owned.push(baseRock);
    const bases: THREE.Matrix4[] = [];
    for (const spec of CRYSTALS) {
      const crystal = new CrystalButton(spec.color, tex, this.time, this.owned);
      const p = v3(spec.cell);
      p.y = this.field.heightAt(p.x, p.z);
      crystal.group.position.copy(p);
      this.colliders.add(p.x, p.z, 0.72);
      this.crystals.push(crystal);
      s.add(crystal.group);
      bases.push(new THREE.Matrix4().compose(p.clone().setY(p.y + 0.02), new THREE.Quaternion(), new THREE.Vector3(2.2, 1.9, 2.2)));
    }
    const baseGeo = crystalBase(3);
    s.add(instances(baseGeo, baseRock, bases, this.glow, false));
    baseGeo.dispose();

    const wallZ = cellPos(8, 4.5)[1];
    this.wall = new CrystalWall(CRYSTAL_ORDER, this.time, this.owned);
    this.wall.group.position.copy(v3(CRYSTAL_WALL_CELL));
    s.add(this.wall.group);
    this.paintings = new TestPaintings(wallZ, DOOR, this.glow, this.colliders, this.owned);
    s.add(this.paintings.group);
    s.add(wayPaintings(WAY_PAINTINGS, this.glow, this.owned, this.textures));

    // The mole, beside the first rockfall
    this.mole = createMole();
    s.add(this.mole.root);
    this.wish = new MoleWish();
    s.add(this.wish.sprite);

    // Pool, chamber, life
    const [px, pz] = cellPos(8, 12);
    this.pool = new Pool(this.field, [px, pz], [12, 12], this.time);
    s.add(this.pool.mesh, this.lilies.group);
    this.owned.push(...this.lilies.materials);
    this.chamber = new Chamber(v3(SWORD_CELL), this.time, this.glow);
    s.add(this.chamber.group, this.chamber.spot, this.chamber.spot.target);
    this.colliders.add(this.chamber.center.x, this.chamber.center.z, 1.5);
    this.owned.push(...this.chamber.materials);

    this.bats = new Bats([
      { at: v3([8, 12], 3.4), radius: 3.2 },
      { at: v3([6, 11], 3.8), radius: 2.2 },
      { at: v3([8, 6], 3.6), radius: 3.5 },
      { at: v3([2, 10.5], 3.5), radius: 1.2 },
      { at: v3([8, 17.5], 3.6), radius: 1.6 },
    ]);
    s.add(this.bats.group);
    s.add(this.sparks.mesh, this.dust.mesh);
    this.drips = new Drips(this.dripSpots(), this.sparks);
    this.drips.onPoolDrop = (x, z) => this.pool.ripple(x, z);
    s.add(this.drips.group);
  }

  /** Drip points: under rock lips next to the floor, plus two above the pool. */
  private dripSpots(): { from: THREE.Vector3; floor: number; pool: boolean }[] {
    const spots: { from: THREE.Vector3; floor: number; pool: boolean }[] = [];
    for (const c of [[7.4, 11.6], [8.7, 12.6]] as [number, number][]) {
      const p = v3(c);
      spots.push({ from: new THREE.Vector3(p.x, 3.6, p.z), floor: -0.3, pool: true });
    }
    for (const c of [[7.2, 17.6], [3.0, 11.2], [12.4, 6.6], [13.6, 10.4], [5.6, 14.3], [4.0, 5.6]] as [number, number][]) {
      const p = v3(c);
      spots.push({ from: new THREE.Vector3(p.x, 3.4, p.z), floor: this.field.heightAt(p.x, p.z), pool: false });
    }
    return spots;
  }

  /** Push the fog back while the camera stands further away in the painted hall (0 normal, 1 far). */
  setFogDepth(k: number): void {
    this.fog.near = 13 + k * 7;
    this.fog.far = 32 + k * 9;
  }

  update(dt: number, time: number, player: THREE.Vector3, torch: THREE.Vector3): void {
    this.time.value = time;
    for (const m of this.mushrooms) m.update(dt, time);
    for (const r of this.rockfalls) r.update(dt);
    for (const c of this.crystals) c.update(dt, time);
    this.wall.update(dt, time);
    this.paintings.update(dt, time);
    this.mole.update(dt);
    this.chamber.update(dt, time);
    this.bats.update(time);
    this.drips.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    this.pool.update(torch);
    this.lilies.update(time);
    this.sparkles.update(player, torch);
    for (const c of this.crystalLights) c.light.intensity = c.base * (0.8 + 0.2 * Math.sin(time * 1.7 + c.phase));
  }

  /** Dust puffing up along something heavy that moves. */
  rumbleDust(at: THREE.Vector3, dt: number): void {
    if (Math.random() >= dt * 22) return;
    this.dust.emit(new THREE.Vector3(at.x + (Math.random() - 0.5) * 3, 0.15, at.z + 0.6), {
      count: 2,
      color: "#8a7f96",
      speed: [0.3, 1.2],
      up: 0.6,
      life: [0.8, 1.5],
      size: [0.4, 0.8],
      grow: 2.2,
      drag: 2,
      flat: true,
    });
  }

  /** Whether a rockfall or the closed crystal wall blocks (x, z). */
  blocked(x: number, z: number): boolean {
    for (const r of this.rockfalls) if (r.blocksLocal(x - r.at.x, z - r.at.z)) return true;
    const w = this.wall.group.position;
    return this.wall.blocksLocal(x - w.x, z - w.z);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const m of this.owned) m.dispose();
    for (const t of this.textures) t.dispose();
    this.bats.dispose();
    this.drips.dispose();
    this.sparks.dispose();
    this.dust.dispose();
    (this.pool.mesh.material as THREE.Material).dispose();
    for (const m of this.mushrooms) m.dispose();
    for (const c of this.crystals) c.dispose();
    this.wish.dispose();
    this.paintings.dispose();
    this.chamber.spot.dispose();
  }
}
