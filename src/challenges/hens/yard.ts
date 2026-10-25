/**
 * Builds Kleine Mia's sunny farmyard behind the village: sky, sun and
 * shadows, the ground and grass, a white picket fence with an open gate, the
 * coop, hay, trough, wheelbarrow, scarecrow, sunflowers and a sleepy cat —
 * framed by meadow hills, trees and the village cottages. Owns everything
 * static or self-animating; the challenge (HensChallenge.ts) owns the rules.
 */

import * as THREE from "three";
import { Colliders } from "../../world/Colliders";
import { WalkableWorld } from "../../characters/Player";
import { createSkyDome, Clouds } from "../../world/Sky";
import { merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Model, addModel, emptyModel, placeAt, pointDir } from "../../world/models/shapes";
import { barrel, bucket, fence } from "../../world/models/props";
import { bush, roundTree } from "../../world/models/flora";
import { cottage } from "../../world/models/buildings";
import { Coop } from "./coop";
import { Disposable, disposeScene } from "./dispose";
import { eggBasket, feedSack, hayPile, scarecrow, sunflower, trough, veggiePatch, wheelbarrow } from "./farm";
import { Grass } from "./grass";
import { Ground } from "./ground";
import { FarmLife } from "./life";
import { CAT_BARREL, COOP, GATE, HAY, MIA_SPOT, SCARECROW, SUNFLOWERS, TROUGH, VEGGIES, WHEELBARROW, YARD } from "./layout";

const SUN_DIR = new THREE.Vector3(-0.5, 0.78, 0.38).normalize();
const SKY = {
  zenith: new THREE.Color("#3f95e6"),
  horizon: new THREE.Color("#d6f0fb"),
  sunGlow: new THREE.Color("#fff0c4"),
};
const FEED_SACK: [number, number] = [COOP.x - 3.1, COOP.z + 2.2];
const BASKET: [number, number] = [MIA_SPOT[0] + 0.8, MIA_SPOT[1] + 0.2];
const BUCKET: [number, number] = [TROUGH[0] + 1.55, TROUGH[1] + 0.45];

export class Yard {
  readonly scene = new THREE.Scene();
  readonly owned: Disposable[] = [];
  readonly colliders = new Colliders();
  readonly ground: Ground;
  readonly grass: Grass;
  readonly coop: Coop;
  readonly life: FarmLife;
  /** Chimney tops of the village cottages (for little smoke puffs). */
  readonly chimneys: THREE.Vector3[] = [];
  private sunflowers: { head: THREE.Group; group: THREE.Group; seed: number }[] = [];
  private scarecrow: THREE.Group;
  private clouds: Clouds;
  private propMat: THREE.MeshStandardMaterial;

  constructor() {
    const s = this.scene;
    s.fog = new THREE.Fog("#d2ecf7", 45, 170);
    this.lights();
    s.add(createSkyDome(SUN_DIR, SKY));
    this.clouds = new Clouds(16, 23);
    this.clouds.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !this.owned.includes(m)) this.owned.push(m);
    });
    s.add(this.clouds.group);

    this.propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.owned.push(this.propMat);

    this.coop = new Coop(this.owned);
    s.add(this.coop.group);
    this.addColliders();

    this.ground = new Ground(this.owned);
    s.add(this.ground.group);
    this.grass = new Grass(this.ground, (x, z) => this.blocksGrass(x, z), this.owned);
    s.add(this.grass.group);

    s.add(this.props());
    s.add(this.backdrop());
    this.scarecrow = scarecrow(this.propMat);
    this.scarecrow.position.set(SCARECROW[0], 0, SCARECROW[1]);
    this.scarecrow.rotation.y = 0.9;
    s.add(this.scarecrow);
    const heads = SUNFLOWERS.map((p, i) => {
      const f = sunflower(i, this.propMat);
      f.group.position.set(p[0], 0, p[1]);
      // Reason: sunflowers turn to the sun, which also turns their faces towards the camera
      f.group.rotation.y = (i % 3) * 0.15 - 0.15;
      s.add(f.group);
      this.sunflowers.push({ ...f, seed: i * 1.7 });
      f.group.updateMatrixWorld(true);
      return f.head.getWorldPosition(new THREE.Vector3());
    });
    this.life = new FarmLife(heads, new THREE.Vector3(CAT_BARREL[0], 1.0, CAT_BARREL[1]), this.owned);
    s.add(this.life.group);
  }

  private lights(): void {
    const s = this.scene;
    s.add(new THREE.HemisphereLight("#cfe8ff", "#6d8f45", 1.15));
    const sun = new THREE.DirectionalLight("#fff0d2", 2.5);
    sun.position.copy(SUN_DIR).multiplyScalar(30).add(new THREE.Vector3(0, 0, -1));
    sun.target.position.set(0, 0, -1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -18;
    sc.right = sc.top = 18;
    sc.near = 5;
    sc.far = 70;
    s.add(sun, sun.target);
    // Soft cool fill from behind for rim light on fluffy hens
    const rim = new THREE.DirectionalLight("#bcd8ff", 0.55);
    rim.position.set(6, 8, -12);
    s.add(rim);
  }

  private addColliders(): void {
    const c = this.colliders;
    for (const [x, z, r] of this.coop.colliders()) c.add(x, z, r);
    for (const h of HAY) c.add(h.at[0], h.at[1], h.r);
    for (const dx of [-0.65, 0.65]) c.add(TROUGH[0] + dx, TROUGH[1], 0.5);
    c.add(WHEELBARROW[0], WHEELBARROW[1], 0.9);
    c.add(SCARECROW[0], SCARECROW[1], 0.3);
    c.add(CAT_BARREL[0], CAT_BARREL[1], 0.55);
    c.add(MIA_SPOT[0], MIA_SPOT[1], 0.45);
    c.add(FEED_SACK[0], FEED_SACK[1], 0.42);
    c.add(BASKET[0], BASKET[1], 0.3);
    c.add(BUCKET[0], BUCKET[1], 0.28);
    for (const [x, z] of SUNFLOWERS) c.add(x, z, 0.18);
  }

  private blocksGrass(x: number, z: number): boolean {
    if (this.colliders.hits(x, z, 0.05)) return true;
    if (Math.abs(x - COOP.x) < COOP.w / 2 + 0.2 && Math.abs(z - COOP.z) < COOP.d / 2 + 0.2) return true;
    return Math.abs(x - VEGGIES[0]) < 1.25 && Math.abs(z - VEGGIES[1]) < 1.7;
  }

  /** Tadeo may walk anywhere inside the fence. */
  walkable(): WalkableWorld {
    return {
      groundHeight: () => 0,
      canStand: (x, z) => x > YARD.minX + 0.35 && x < YARD.maxX - 0.35 && z > YARD.minZ + 0.35 && z < YARD.maxZ - 0.35,
      colliders: this.colliders,
    };
  }

  /** Static props merged into one vertex-coloured mesh (plus the trough water). */
  private props(): THREE.Group {
    const g = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    const at = (list: THREE.BufferGeometry[], x: number, z: number, rot = 0, y = 0) => {
      const m = placeAt(x, y, z, rot);
      for (const p of list) parts.push(p.applyMatrix4(m));
    };
    HAY.forEach((h, i) => at(hayPile(h.kind, i + 3), h.at[0], h.at[1], i * 1.3));
    const t = trough();
    at(t.parts, TROUGH[0], TROUGH[1]);
    at(wheelbarrow(), WHEELBARROW[0], WHEELBARROW[1], -2.3);
    at(veggiePatch(), VEGGIES[0], VEGGIES[1]);
    at(feedSack(), FEED_SACK[0], FEED_SACK[1], 0.6);
    at(eggBasket(), BASKET[0], BASKET[1]);

    const model = emptyModel();
    addModel(model, barrel(4, 1.0), placeAt(CAT_BARREL[0], 0, CAT_BARREL[1]));
    addModel(model, barrel(6, 0.8), placeAt(CAT_BARREL[0] - 0.9, 0, CAT_BARREL[1] + 0.35));
    addModel(model, bucket(), placeAt(BUCKET[0], 0, BUCKET[1]));
    this.fence(model);
    parts.push(...model.solid);

    const mesh = new THREE.Mesh(merge(parts), this.propMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);

    const waterMat = new THREE.MeshStandardMaterial({ color: "#58a6dc", roughness: 0.06, metalness: 0.05, emissive: "#2b6c9c", emissiveIntensity: 0.25 });
    this.owned.push(waterMat);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(t.water.w, t.water.d).rotateX(-Math.PI / 2), waterMat);
    water.position.set(TROUGH[0], t.water.y, TROUGH[1]);
    water.receiveShadow = true;
    g.add(water);
    return g;
  }

  /** White picket fence round the yard with a gap and two open gate leaves at the front. */
  private fence(model: Model): void {
    const x0 = YARD.minX - 0.15;
    const x1 = YARD.maxX + 0.15;
    const z0 = YARD.minZ - 0.15;
    const z1 = YARD.maxZ + 0.15;
    addModel(model, fence(x1 - x0, 1, true), placeAt(x0, 0, z0));
    addModel(model, fence(z1 - z0, 2, true), placeAt(x0, 0, z0, -Math.PI / 2));
    addModel(model, fence(z1 - z0, 3, true), placeAt(x1, 0, z0, -Math.PI / 2));
    addModel(model, fence(GATE.x0 - x0, 4, true), placeAt(x0, 0, z1));
    addModel(model, fence(x1 - GATE.x1, 5, true), placeAt(GATE.x1, 0, z1));
    const leaf = (GATE.x1 - GATE.x0) / 2 - 0.05;
    addModel(model, fence(leaf, 6, true), placeAt(GATE.x0, 0, z1 + 0.05, pointDir(0.45, 0.9)));
    addModel(model, fence(leaf, 7, true), placeAt(GATE.x1, 0, z1 + 0.05, pointDir(-0.45, 0.9)));
  }

  /** Meadow trees and bushes beyond the fence, and the village cottages up the hill behind. */
  private backdrop(): THREE.Group {
    const g = new THREE.Group();
    const rand = mulberry32(5150);
    const floraMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    this.owned.push(floraMat);
    const models = [roundTree(0), roundTree(1), roundTree(2), bush(3), bush(4, "#e0263a"), bush(5)];
    const spots: THREE.Matrix4[][] = models.map(() => []);
    const free = (x: number, z: number, pad: number) => {
      const outside = x < YARD.minX - pad || x > YARD.maxX + pad || z < YARD.minZ - pad || z > YARD.maxZ + pad;
      const nearCottage = z < -15 && z > -26 && x > -21 && x < 10;
      return outside && !nearCottage;
    };
    const place = (kind: number, x: number, z: number, s: number) => {
      spots[kind].push(placeAt(x, this.ground.height(x, z) - 0.1, z, rand() * 6.28, s));
    };
    for (let i = 0; i < 260 && spots[0].length + spots[1].length + spots[2].length < 75; i++) {
      const x = (rand() - 0.5) * 90;
      const z = -48 + rand() * 62;
      // Reason: keep the land between the yard and the camera open
      if (z > 11 && Math.abs(x) < 22) continue;
      if (free(x, z, 5)) place(Math.floor(rand() * 3), x, z, 1.1 + rand() * 0.8);
    }
    for (let i = 0; i < 120 && spots[3].length + spots[4].length + spots[5].length < 34; i++) {
      const side = Math.floor(rand() * 4);
      const along = rand();
      const off = 1.4 + rand() * 2.8;
      const x = side < 2 ? YARD.minX + along * (YARD.maxX - YARD.minX) : side === 2 ? YARD.minX - off : YARD.maxX + off;
      const z = side === 0 ? YARD.minZ - off : side === 1 ? YARD.maxZ + off : YARD.minZ + along * (YARD.maxZ - YARD.minZ);
      if (side === 1 && Math.abs(x) < 3) continue;
      place(3 + Math.floor(rand() * 3), x, z, 0.8 + rand() * 0.6);
    }
    models.forEach((m, k) => {
      if (!spots[k].length) return;
      const inst = new THREE.InstancedMesh(m.geometry, floraMat, spots[k].length);
      spots[k].forEach((mx, i) => inst.setMatrixAt(i, mx));
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      g.add(inst);
    });

    // A few cottages of the village on the hill behind the yard
    const village = emptyModel();
    const houses: { x: number; z: number; rot: number; roof: "tile" | "straw"; color: string; shutter: string }[] = [
      { x: -15, z: -20, rot: 0.45, roof: "tile", color: "#c8553d", shutter: "#3f7fbf" },
      { x: -5.5, z: -22.5, rot: 0.12, roof: "straw", color: "#d9b04e", shutter: "#4f8a3a" },
      { x: 5, z: -21, rot: -0.3, roof: "tile", color: "#3f6fa8", shutter: "#d23b2c" },
    ];
    houses.forEach((h, i) => {
      const c = cottage({ size: 0.9, seed: 40 + i, roof: h.roof, roofColor: h.color, shutter: h.shutter });
      const m = placeAt(h.x, this.ground.height(h.x, h.z) - 0.15, h.z, h.rot);
      addModel(village, c.model, m);
    });
    this.chimneys.push(...village.chimneys);
    for (const cloth of village.cloth) cloth.deleteAttribute("aSway");
    const solid = [...village.solid, ...village.dark, ...village.cloth];
    const houseMesh = new THREE.Mesh(merge(solid), this.propMat);
    houseMesh.castShadow = true;
    houseMesh.receiveShadow = true;
    g.add(houseMesh);
    if (village.glow.length) {
      const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.owned.push(glowMat);
      g.add(new THREE.Mesh(merge(village.glow), glowMat));
    }
    return g;
  }

  update(dt: number, time: number, player: THREE.Vector3): void {
    this.ground.update(time);
    this.grass.update(time);
    this.coop.update(dt, time);
    this.clouds.update(dt);
    this.life.update(dt, time, player);
    for (const f of this.sunflowers) {
      f.group.rotation.z = Math.sin(time * 0.9 + f.seed) * 0.03;
      f.head.rotation.x = 0.25 + Math.sin(time * 1.3 + f.seed) * 0.06;
      f.head.rotation.z = Math.sin(time * 0.7 + f.seed * 2) * 0.08;
    }
    this.scarecrow.rotation.z = Math.sin(time * 1.1) * 0.025;
  }

  dispose(): void {
    disposeScene(this.scene, this.owned);
  }
}
