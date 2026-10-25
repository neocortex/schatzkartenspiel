/**
 * Landmarks — the hand-placed set pieces of the island (village, bridge,
 * piers, boats, cave entrance, stone tablets, signs, volcano crater, ...).
 *
 * Each set piece is built as a `Site` (painted parts grouped by material) and
 * merged into one mesh per material, keeping draw calls low. Boats, lava,
 * waterfall and flames are separate animated objects. Characters query
 * `surfaceHeight` to walk on piers and the bridge.
 */

import * as THREE from "three";
import { Heightfield } from "./Heightfield";
import { Colliders } from "./Colliders";
import { WorldUniforms } from "./Terrain";
import { merge } from "../core/geo";
import { Model } from "./models/shapes";
import { SignAtlas } from "./models/signs";
import { createMaterials, flameGeometry, LandmarkMaterials } from "./models/effects";
import { Site, Deck, LandmarkContext } from "./models/site";
import { buildVillage } from "./models/village";
import { buildSpawnBeach, buildNorthDock, buildTreasureIsland, buildLighthouse } from "./models/coastSites";
import { buildVolcano, buildTablets, buildCave, buildForestGate } from "./models/westSites";
import { buildBridge, buildTrailhead, buildWaterfall, buildSignposts } from "./models/eastSites";

interface Boat {
  name: string;
  group: THREE.Group;
  base: THREE.Vector3;
  yaw: number;
  phase: number;
}

export class Landmarks implements LandmarkContext {
  readonly group = new THREE.Group();
  /** Chimney top world positions (for smoke). */
  readonly chimneys: THREE.Vector3[] = [];
  /** Torch flame world positions (for glow / sparks). */
  readonly torches: THREE.Vector3[] = [];
  /** Volcanic vent centres near the volcano gate (for smoke). */
  readonly vents: THREE.Vector3[] = [];
  readonly atlas = new SignAtlas();
  readonly materials: LandmarkMaterials;
  private sites: Site[] = [];
  private decks: Deck[] = [];
  private boats: Boat[] = [];
  private animations: ((time: number, dt: number) => void)[] = [];

  constructor(
    readonly hf: Heightfield,
    readonly colliders: Colliders,
    readonly world: WorldUniforms,
  ) {
    this.materials = createMaterials(world);
    buildSpawnBeach(this);
    buildVolcano(this);
    buildTablets(this);
    buildCave(this);
    buildForestGate(this);
    buildBridge(this);
    buildVillage(this.site("village"));
    buildTrailhead(this);
    buildWaterfall(this);
    buildNorthDock(this);
    buildTreasureIsland(this);
    buildLighthouse(this);
    buildSignposts(this);
    for (const site of this.sites) this.flush(site);
    this.atlas.draw();
    this.buildFlames();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Walk-surface height if (x, z) is on a pier or bridge deck, else null. */
  surfaceHeight(x: number, z: number): number | null {
    let best: number | null = null;
    for (const d of this.decks) {
      const rx = x - d.start.x;
      const rz = z - d.start.y;
      const s = rx * d.dir.x + rz * d.dir.y;
      if (s < 0 || s > d.length) continue;
      const lateral = Math.abs(rx * d.dir.y - rz * d.dir.x);
      if (lateral > d.halfWidth(s)) continue;
      const h = d.height(s);
      if (best === null || h > best) best = h;
    }
    return best;
  }

  /** World position and heading (radians about Y, bow = +x) of a named boat ("spawn" or "north"). */
  boatPose(name: string): { position: THREE.Vector3; yaw: number } | null {
    const b = this.boats.find((o) => o.name === name);
    return b ? { position: b.base.clone(), yaw: b.yaw } : null;
  }

  update(dt: number, time: number): void {
    for (const b of this.boats) {
      const t = time + b.phase;
      b.group.position.set(b.base.x, b.base.y + Math.sin(t * 1.25) * 0.07, b.base.z);
      b.group.rotation.set(Math.sin(t * 0.9) * 0.045, b.yaw, Math.sin(t * 1.25 + 0.8) * 0.025, "YXZ");
    }
    for (const fn of this.animations) fn(time, dt);
  }

  // ---------------------------------------------------------------------------
  // LandmarkContext (used by the set-piece builders)
  // ---------------------------------------------------------------------------

  site(name: string): Site {
    const s = new Site(name, this.hf, this.colliders, this.atlas);
    this.sites.push(s);
    return s;
  }

  deck(d: Deck): void {
    this.decks.push(d);
    // Reason: open the heightfield along the deck so deep water / river cells under it become walkable
    for (let s = 0; s <= d.length; s += 0.4) {
      const x = d.start.x + d.dir.x * s;
      const z = d.start.y + d.dir.y * s;
      this.hf.openDisc(x, z, Math.max(0.3, d.halfWidth(s) - 0.35));
    }
  }

  boat(name: string, model: Model, x: number, z: number, rotY: number): void {
    const group = new THREE.Group();
    group.name = `boat:${name}`;
    this.meshesFor(model, name).forEach((m) => group.add(m));
    this.group.add(group);
    this.boats.push({ name, group, base: new THREE.Vector3(x, 0, z), yaw: rotY, phase: this.boats.length * 2.1 });
  }

  add(obj: THREE.Object3D): void {
    this.group.add(obj);
  }

  animate(fn: (time: number, dt: number) => void): void {
    this.animations.push(fn);
  }

  // ---------------------------------------------------------------------------
  // Mesh building
  // ---------------------------------------------------------------------------

  private flush(site: Site): void {
    for (const mesh of this.meshesFor(site.model, site.name)) this.group.add(mesh);
    this.chimneys.push(...site.model.chimneys);
    this.torches.push(...site.model.flames);
  }

  /** One merged mesh per material used by the model. */
  private meshesFor(model: Model, name: string): THREE.Mesh[] {
    const mats = this.materials;
    const out: THREE.Mesh[] = [];
    const make = (geos: THREE.BufferGeometry[], mat: THREE.Material, kind: string, shadows: boolean) => {
      if (!geos.length) return;
      const mesh = new THREE.Mesh(merge(geos), mat);
      mesh.name = `${name}:${kind}`;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      out.push(mesh);
    };
    make(model.solid, mats.solid, "solid", true);
    make(model.cloth, mats.cloth, "cloth", true);
    make(model.glow, mats.glow, "glow", false);
    make(model.pulse, mats.pulse, "pulse", false);
    make(model.dark, mats.dark, "dark", false);
    make(model.text, this.atlas.material, "text", false);
    if (model.text.length) out[out.length - 1].receiveShadow = true;
    return out;
  }

  /** All torch flames as one instanced mesh. */
  private buildFlames(): void {
    if (!this.torches.length) return;
    const mesh = new THREE.InstancedMesh(flameGeometry(), this.materials.flame, this.torches.length);
    const m = new THREE.Matrix4();
    this.torches.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    mesh.computeBoundingSphere();
    mesh.name = "torch-flames";
    this.group.add(mesh);
  }
}
