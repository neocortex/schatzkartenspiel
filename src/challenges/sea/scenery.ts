/**
 * Everything around the crossing: the home island behind (beach, green
 * hills, the smoking volcano, palms) with the wooden pier where the boat
 * starts, a few palm islets on the horizon, and ahead the little treasure
 * island — sandy beach, palms, the skull rock, the old shipwreck and the big
 * red X. Islands also register their shallows with the ocean.
 */

import * as THREE from "three";
import { Noise2D, mulberry32, smoothstep } from "../../core/noise";
import { part } from "../../core/geo";
import { emptyModel, rbox, cyl, box, rockBlob, stoneFn, PAL, Model, addModel, placeAt } from "../../world/models/shapes";
import { palmTree, roundTree, bush, FloraModel } from "../../world/models/flora";
import { shipwreck } from "../../world/models/boats";
import { boardSign } from "../../world/models/props";
import { SignAtlas } from "../../world/models/signs";
import { mat } from "../../characters/parts";
import { Bin, ModelMaterials, modelGroup } from "../ogre/kit";
import { swayMaterial, scatter, placement } from "../ogre/plants";
import { Fx } from "../ogre/fx";

/** Where things are on the crossing (the boat sails from the pier towards -z). */
export const HOME = { x: 0, z: 200, rx: 230, rz: 175 };
export const TREASURE = { x: 0, z: -520, r: 27 };
/** Where the boat runs aground on the treasure island's beach (its shore lies at r * 0.9). */
export const LANDING_Z = TREASURE.z + TREASURE.r * 0.9 + 2.2;
const ISLETS: [number, number, number][] = [
  [-130, -210, 11],
  [150, -330, 14],
  [-170, -440, 9],
];

type Isle = (x: number, z: number, rx: number, rz: number, slope: number) => void;

interface IslandSpec {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  /** Hill height in the middle. */
  hill: number;
  /** Beach width: the hills start this far inland (in normalised radius, default 0.1). */
  beach?: number;
  seed: number;
  /** Extra peaks: x, z, height, radius, crater. */
  peaks?: [number, number, number, number, boolean][];
}

const SAND = new THREE.Color("#f2dc9b");
const WET = new THREE.Color("#d9bf7f");
const GRASS = new THREE.Color("#7cc243");
const GRASS2 = new THREE.Color("#5ea93a");
const ROCK = new THREE.Color("#a69686");
const ROCK_DARK = new THREE.Color("#6f5f57");

/** Height of an island at (x, z): underwater slope, flat beach, grassy hills, optional peaks. */
function islandHeight(s: IslandSpec, noise: Noise2D, x: number, z: number): number {
  const q = Math.hypot((x - s.cx) / s.rx, (z - s.cz) / s.rz);
  const e = 1 - q + noise.noise(x * 0.04, z * 0.04) * 0.07;
  const r = Math.min(s.rx, s.rz);
  let h = e < 0 ? Math.max(e * r * 0.3, -6) : smoothstep(0, 0.05, e) * 0.9;
  const b = s.beach ?? 0.1;
  h += smoothstep(b, b + 0.45, e) * s.hill * (0.65 + noise.noise(x * 0.06 + 5, z * 0.06) * 0.45);
  for (const [px, pz, ph, pr, crater] of s.peaks ?? []) {
    const d = Math.hypot(x - px, z - pz) / pr;
    let p = ph * Math.pow(Math.max(0, 1 - d), 1.6);
    if (crater) p -= ph * 0.25 * smoothstep(0.16, 0.0, d);
    h = Math.max(h, p);
  }
  return h;
}

function islandGeometry(s: IslandSpec, x0: number, z0: number, w: number, d: number, step: number): THREE.BufferGeometry {
  const noise = new Noise2D(s.seed);
  const g = new THREE.PlaneGeometry(w, d, Math.round(w / step), Math.round(d / step));
  g.rotateX(-Math.PI / 2);
  g.translate(x0 + w / 2, 0, z0 + d / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, islandHeight(s, noise, pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const steep = 1 - nrm.getY(i);
    if (y < 0.15) c.copy(WET).lerp(SAND, smoothstep(-1.5, 0.15, y));
    else if (y < 1.3) c.copy(SAND);
    else c.copy(GRASS).lerp(GRASS2, noise.noise(x * 0.1, z * 0.1) * 0.5 + 0.5);
    if (y > 1.3 && steep > 0.3) c.lerp(ROCK, smoothstep(0.3, 0.5, steep));
    if (y > 28) c.lerp(ROCK_DARK, smoothstep(28, 40, y));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** Skull-shaped boulder (faces +z), the treasure island's landmark. */
function skullRock(seed: number): Model {
  const m = emptyModel();
  const bone = (p: THREE.Vector3, n: THREE.Vector3) => new THREE.Color("#d9d0bd").multiplyScalar(n.y < -0.2 ? 0.7 : 0.95 + Math.sin(p.x * 5 + p.y * 3) * 0.05);
  m.solid.push(rockBlob(seed, [1.7, 1.55, 1.6], bone, 2).translate(0, 2.0, 0));
  m.solid.push(rockBlob(seed + 1, [1.05, 0.6, 0.95], bone, 1).translate(0, 0.75, 0.45));
  for (const sx of [-1, 1]) m.solid.push(part(new THREE.IcosahedronGeometry(0.42, 1), "#120d0b", { pos: [sx * 0.58, 2.0, 1.32], scale: [1, 1.05, 0.55] }));
  m.solid.push(part(new THREE.ConeGeometry(0.2, 0.42, 3), "#120d0b", { pos: [0, 1.45, 1.46], rot: [Math.PI, 0, 0] }));
  for (let i = -2; i <= 2; i++) m.solid.push(box(0.22, 0.3, 0.2, "#efe7d4", { pos: [i * 0.26, 1.08, 1.32] }));
  return m;
}

/** Wooden pier on posts, from the beach out to the boat. */
function pier(atlas: SignAtlas, x: number, z0: number, z1: number, deckY: number): Model {
  const m = emptyModel();
  const rand = mulberry32(5);
  for (let z = z0; z > z1; z -= 0.55) m.solid.push(rbox(2.3, 0.12, 0.5, new THREE.Color(PAL.plank).multiplyScalar(0.88 + rand() * 0.24), { pos: [x, deckY, z] }, 0.03));
  for (let z = z0; z > z1 - 0.1; z -= 3.2) {
    for (const sx of [-1, 1]) m.solid.push(cyl(0.16, 0.18, deckY + 3.5, PAL.woodDark, { pos: [x + sx * 1.1, deckY - 1.6, z] }, 7));
  }
  for (const sx of [-1, 1]) m.solid.push(box(0.12, 0.12, z0 - z1, PAL.wood, { pos: [x + sx * 1.1, deckY + 0.55, (z0 + z1) / 2] }));
  // Mooring bollards and a coiled rope at the end
  for (const sx of [-1, 1]) m.solid.push(cyl(0.14, 0.17, 0.4, PAL.woodDark, { pos: [x + sx * 0.8, deckY + 0.25, z1 + 0.6] }, 8));
  m.solid.push(part(new THREE.TorusGeometry(0.22, 0.07, 5, 12), PAL.rope, { pos: [x + 0.2, deckY + 0.1, z1 + 1.6], rot: [Math.PI / 2, 0, 0] }));
  addModel(m, boardSign(atlas, "Zur Schatzinsel", 2.6), placeAt(x - 0.4, deckY + 0.05, z1 + 3.2, Math.PI * 0.85));
  return m;
}

export class Scenery {
  readonly group = new THREE.Group();
  /** Point on the treasure island beach (the red X). */
  readonly xMark = new THREE.Vector3(TREASURE.x + 2.5, 1, TREASURE.z + 19.5);
  /** Ground height on the treasure island. */
  readonly treasureGround: (x: number, z: number) => number;
  private smokeTimer = 0;
  private crater = new THREE.Vector3();

  constructor(
    bin: Bin,
    mats: ModelMaterials,
    atlas: SignAtlas,
    private fx: Fx,
    addIsle: Isle,
  ) {
    const terrainMat = bin.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    const flora: Record<string, { model: FloraModel; at: THREE.Matrix4[] }> = {};
    const plant = (key: string, make: () => FloraModel, m: THREE.Matrix4) => (flora[key] ??= { model: make(), at: [] }).at.push(m);

    // Home island with the volcano and a mountain behind the pier
    const home: IslandSpec = {
      cx: HOME.x,
      cz: HOME.z,
      rx: HOME.rx,
      rz: HOME.rz,
      hill: 9,
      seed: 3,
      peaks: [
        [-75, 265, 62, 60, true],
        [95, 290, 46, 55, false],
      ],
    };
    this.crater.set(-75, 62 * 0.75, 265);
    const homeMesh = new THREE.Mesh(islandGeometry(home, -320, 5, 640, 430, 4), terrainMat);
    homeMesh.receiveShadow = true;
    this.group.add(homeMesh);
    addIsle(HOME.x, HOME.z, HOME.rx, HOME.rz, 0.18);
    const lava = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), mat("#ff6a1f", 0.5, 2.2));
    lava.position.copy(this.crater);
    this.group.add(lava);
    const homeNoise = new Noise2D(home.seed);
    const rand = mulberry32(99);
    for (let i = 0; i < 60; i++) {
      const x = (rand() - 0.5) * 220;
      const z = 26 + rand() * 30;
      const y = islandHeight(home, homeNoise, x, z);
      if (y < 0.4 || y > 1.4 || Math.abs(x - 2.6) < 5) continue;
      plant(`palm${i % 3}`, () => palmTree(i % 3), placement(x, y - 0.1, z, 1 + rand() * 0.35));
    }
    for (let i = 0; i < 140; i++) {
      const x = (rand() - 0.5) * 360;
      const z = 45 + rand() * 170;
      const y = islandHeight(home, homeNoise, x, z);
      if (y < 2 || y > 22) continue;
      if (i % 3) plant(`tree${i % 2}`, () => roundTree(i % 2), placement(x, y - 0.2, z, 1.6 + rand()));
      else plant("bush", () => bush(4, "#ff6f91"), placement(x, y - 0.1, z, 1.4 + rand()));
    }
    this.group.add(modelGroup(pier(atlas, 2.6, 30, -1.5, 1.05), mats, true, atlas.material));

    // Treasure island
    const isle: IslandSpec = { cx: TREASURE.x, cz: TREASURE.z, rx: TREASURE.r, rz: TREASURE.r * 0.9, hill: 3.5, beach: 0.32, seed: 7 };
    const isleMesh = new THREE.Mesh(islandGeometry(isle, TREASURE.x - 60, TREASURE.z - 60, 120, 120, 1.2), terrainMat);
    isleMesh.receiveShadow = true;
    this.group.add(isleMesh);
    addIsle(TREASURE.x, TREASURE.z, TREASURE.r, TREASURE.r * 0.9, 0.22);
    const isleNoise = new Noise2D(isle.seed);
    const ground = (x: number, z: number) => islandHeight(isle, isleNoise, x, z);
    this.treasureGround = ground;
    const deco = emptyModel();
    addModel(deco, skullRock(7), placeAt(TREASURE.x - 5, ground(TREASURE.x - 5, TREASURE.z - 4) - 0.3, TREASURE.z - 4, 0.15, 2.1));
    addModel(deco, shipwreck(3), placeAt(TREASURE.x - 17, ground(TREASURE.x - 17, TREASURE.z + 9) - 0.3, TREASURE.z + 9, 0.9, 1.3));
    for (const [dx, dz, s] of [[14, 6, 1.3], [-12, -14, 1.1], [18, -8, 0.9], [-21, 2, 1.0]] as const) {
      deco.solid.push(rockBlob(Math.round(dx * 7), [s * 1.3, s, s * 1.1], stoneFn("#a49a8c", 0.3, rand), 1).translate(TREASURE.x + dx, ground(TREASURE.x + dx, TREASURE.z + dz) + s * 0.2, TREASURE.z + dz));
    }
    // The big red X on the beach, facing the boat
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      deco.solid.push(box(5.2, 0.06, 0.9, "#d8261c", { pos: [this.xMark.x, ground(this.xMark.x, this.xMark.z) + 0.06, this.xMark.z], rot: [0, a, 0] }));
    }
    this.xMark.y = ground(this.xMark.x, this.xMark.z);
    this.group.add(modelGroup(deco, mats));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
      const rr = TREASURE.r * (0.45 + rand() * 0.35);
      const x = TREASURE.x + Math.cos(a) * rr;
      const z = TREASURE.z + Math.sin(a) * rr * 0.9;
      if (Math.hypot(x - this.xMark.x, z - this.xMark.z) < 6 || Math.hypot(x - (TREASURE.x - 5), z - (TREASURE.z - 4)) < 4) continue;
      plant(`palm${i % 3}`, () => palmTree(i % 3), placement(x, ground(x, z) - 0.1, z, 1.2 + rand() * 0.4));
      if (i % 2) plant("bush", () => bush(4, "#ff6f91"), placement(x + 1.5, ground(x + 1.5, z) - 0.1, z, 1 + rand() * 0.5));
    }

    // Palm islets on the horizon
    for (const [x, z, r] of ISLETS) {
      const spec: IslandSpec = { cx: x, cz: z, rx: r, rz: r * 0.8, hill: 1.5, seed: Math.abs(x) };
      const islet = new THREE.Mesh(islandGeometry(spec, x - r * 2, z - r * 2, r * 4, r * 4, 2), terrainMat);
      this.group.add(islet);
      addIsle(x, z, r, r * 0.8, 0.3);
      const n = new Noise2D(spec.seed);
      for (let k = 0; k < 3; k++) {
        const px = x + (rand() - 0.5) * r * 0.8;
        const pz = z + (rand() - 0.5) * r * 0.6;
        plant(`palm${k}`, () => palmTree(k), placement(px, islandHeight(spec, n, px, pz) - 0.1, pz, 1.3 + rand() * 0.4));
      }
    }

    const time = mats.time;
    for (const { model, at } of Object.values(flora)) {
      const m = swayMaterial(bin, time, model.swayStart, model.swayAmp, model.doubleSided);
      this.group.add(scatter(model.geometry, m, at));
    }
  }

  update(dt: number): void {
    // Lazy volcano smoke on the home island
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.35;
      this.fx.puff.emit({ at: this.crater.clone().add(new THREE.Vector3(0, 2, 0)), count: 1, speed: [2, 4], dir: new THREE.Vector3(0.3, 1, 0), spread: 0.25, drag: 0.3, gravity: -1.2, life: [4, 6], size: [6, 16], color: ["#e8e4dc", "#cfc8bd"], alpha: 0.55 });
    }
  }
}
