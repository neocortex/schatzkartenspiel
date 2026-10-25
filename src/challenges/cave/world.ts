/**
 * Builds the whole crystal cave scene: lights, fog, terrain, decor, the
 * mine, puzzle hardware, pool, chamber and the ambient life. Owns everything
 * static or self-animating; the challenge (index.ts) owns the rules.
 */

import * as THREE from "three";
import { Colliders } from "../../world/Colliders";
import { glowTexture } from "../../world/ambient/textures";
import { CaveDecor, CRYSTAL_HEX } from "./decor";
import { Bursts } from "../shared/bursts";
import { CaveField, GATE_CELLS, LEVERS, ALTAR_CELL, START_CELL, cellPos } from "./layout";
import { GlowField } from "./materials";
import { Gate, Lever, RuneTrail, SecretWall } from "./mechanisms";
import { buildMine } from "./mine";
import { LilyPads, Pool } from "./pool";
import { Chamber } from "./chamber";
import { Bats, Drips } from "./life";
import { Sparkles } from "./sparkles";
import { createCaveTerrain } from "./terrain";

const v3 = (cell: [number, number], y = 0) => {
  const [x, z] = cellPos(...cell);
  return new THREE.Vector3(x, y, z);
};

export class CaveWorld {
  readonly scene = new THREE.Scene();
  readonly time = { value: 0 };
  readonly field = new CaveField();
  readonly glow = new GlowField();
  readonly colliders = new Colliders();
  readonly levers: Lever[] = [];
  readonly trails: RuneTrail[] = [];
  readonly gates: Gate[] = [];
  readonly wall: SecretWall;
  readonly chamber: Chamber;
  readonly pool: Pool;
  readonly sparks: Bursts;
  readonly dust: Bursts;
  readonly sparkles: Sparkles;
  /** Materials created here (disposed on exit; `mat()` materials are shared and kept). */
  readonly owned: THREE.Material[] = [];
  /** Set once Tadeo has pulled the sword out of the altar. */
  swordFree = false;
  private bats: Bats;
  private lilies: LilyPads;
  private drips: Drips;
  private crystalLights: { light: THREE.PointLight; base: number; phase: number }[] = [];

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color("#040308");
    s.fog = new THREE.Fog("#06050c", 13, 32);
    s.add(new THREE.HemisphereLight("#5a6cb8", "#1a1222", 0.24));
    const tex = glowTexture();

    // Reason: keep decor away from the puzzle pieces and the walking line between them
    const keep: { x: number; z: number; r: number }[] = [];
    const keepCell = (c: number, r: number, rad: number) => {
      const [x, z] = cellPos(c, r);
      keep.push({ x, z, r: rad });
    };
    for (const l of LEVERS) {
      keepCell(...l.cell, 1.6);
      for (const t of l.trail) keepCell(...t, 0.7);
    }
    for (const g of GATE_CELLS) keepCell(...g, 2.4);
    keepCell(...START_CELL, 2);
    keepCell(...ALTAR_CELL, 2.6);
    keepCell(10.1, 17, 1.6);
    keepCell(8, 11.5, 0.5);
    const keepOut = (x: number, z: number) => keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r);

    // Glow sources first (decor, pool, daylight), then bake the terrain with them
    const decor = new CaveDecor(this.field, this.glow, this.colliders, keep);
    this.glow.add(v3([8, 12], 0.2), "#36d6c8", 6.5, 0.9);
    this.glow.add(v3([8, 20.4], 2.2), "#bcd6ff", 7.5, 1.7);
    this.glow.add(v3(ALTAR_CELL, 3), "#ffd68a", 6, 1.1);
    this.sparkles = new Sparkles(this.field, this.glow, tex, this.time, keepOut);
    this.lilies = new LilyPads(this.field, this.glow, cellPos(8, 12), 10);
    const terrain = createCaveTerrain(this.field, this.glow);
    this.owned.push(terrain.material as THREE.Material);
    s.add(terrain);
    decor.build(this.time, this.owned);
    s.add(decor.group, this.sparkles.group);
    this.owned.push(...this.sparkles.materials);
    s.add(buildMine(this.field, this.glow, this.colliders, this.time, this.owned));

    // Real-time lights at the biggest crystals of each room
    decor.heroes.slice(0, 4).forEach((h, i) => {
      const light = new THREE.PointLight(CRYSTAL_HEX[h.kind], 7, 8, 1.6);
      light.position.copy(h.pos).add(new THREE.Vector3(0, 0.6, 0));
      s.add(light);
      this.crystalLights.push({ light, base: 7, phase: i * 1.7 });
    });

    // Puzzle hardware
    const gateColors: THREE.Color[][] = [[], [], []];
    for (const l of LEVERS) gateColors[l.gate].push(new THREE.Color(l.color));
    for (let g = 0; g < 2; g++) {
      const gate = new Gate(gateColors[g]);
      gate.group.position.copy(v3(GATE_CELLS[g]));
      this.gates.push(gate);
      s.add(gate.group);
    }
    this.wall = new SecretWall();
    this.wall.group.position.copy(v3(GATE_CELLS[2]));
    s.add(this.wall.group);
    for (const spec of LEVERS) {
      const lever = new Lever(spec.color, tex);
      const p = v3(spec.cell);
      lever.group.position.set(p.x, this.field.heightAt(p.x, p.z), p.z);
      this.colliders.add(p.x, p.z, 0.55);
      this.levers.push(lever);
      s.add(lever.group);
      const pts = spec.trail.map((c) => {
        const q = v3(c);
        q.y = this.field.heightAt(q.x, q.z) + 0.045;
        return q;
      });
      const trail = new RuneTrail(pts, new THREE.Color(spec.color).multiplyScalar(1.4), this.time);
      this.trails.push(trail);
      s.add(trail.mesh);
    }

    // Pool, chamber, life
    const [px, pz] = cellPos(8, 12);
    this.pool = new Pool(this.field, [px, pz], [12, 12], this.time);
    s.add(this.pool.mesh, this.lilies.group);
    this.owned.push(...this.lilies.materials);
    this.chamber = new Chamber(v3(ALTAR_CELL), this.time);
    s.add(this.chamber.group, this.chamber.spot, this.chamber.spot.target);
    this.colliders.add(this.chamber.center.x, this.chamber.center.z, 1.35);
    for (const sx of [-1, 1]) this.colliders.add(this.chamber.center.x + sx * 3.1, this.chamber.center.z - 0.9, 0.55);
    this.owned.push(...this.chamber.materials);

    this.bats = new Bats([
      { at: v3([8, 12], 3.4), radius: 3.2 },
      { at: v3([6, 11], 3.8), radius: 2.2 },
      { at: v3([8, 6], 3.6), radius: 3.5 },
      { at: v3([2, 10.5], 3.5), radius: 1.2 },
      { at: v3([8, 17.5], 3.6), radius: 1.6 },
    ]);
    s.add(this.bats.group);
    this.sparks = new Bursts(tex, true);
    this.dust = new Bursts(tex, false);
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

  update(dt: number, time: number, player: THREE.Vector3, torch: THREE.Vector3): void {
    this.time.value = time;
    for (const l of this.levers) l.update(dt, time);
    for (const t of this.trails) t.update(dt);
    for (const g of this.gates) g.update(dt, time);
    this.wall.update(dt, time);
    this.chamber.update(time, this.swordFree);
    this.bats.update(time);
    this.drips.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    this.pool.update(torch);
    this.lilies.update(time);
    this.sparkles.update(player, torch);
    for (const c of this.crystalLights) c.light.intensity = c.base * (0.8 + 0.2 * Math.sin(time * 1.7 + c.phase));
  }

  /** Whether a closed gate or the secret wall blocks (x, z). */
  blocked(x: number, z: number): boolean {
    for (const g of this.gates) if (g.blocksLocal(x - g.group.position.x, z - g.group.position.z)) return true;
    const w = this.wall.group.position;
    return this.wall.blocksLocal(x - w.x, z - w.z);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const m of this.owned) m.dispose();
    this.bats.dispose();
    this.drips.dispose();
    this.sparks.dispose();
    this.dust.dispose();
    for (const t of this.trails) (t.mesh.material as THREE.Material).dispose();
    (this.pool.mesh.material as THREE.Material).dispose();
    for (const l of this.levers) l.dispose();
    this.chamber.spot.dispose();
  }
}
