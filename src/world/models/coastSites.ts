/**
 * Coastal set pieces: the spawn beach pier with Tadeo's sailboat, the north
 * dock with the boat for the sea crossing, the treasure island (painted X,
 * skull rock, shipwreck, shovel) and the lighthouse on its rocky point.
 */

import * as THREE from "three";
import { LANDMARKS, PATHS, P2 } from "../layout";
import { part, displace, facet } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { LandmarkContext, Site } from "./site";
import { Model, PAL, emptyModel, addModel, placeAt, pointDir, faceDir, ball, box, pole, rope, rockBlob, stoneFn, flip } from "./shapes";
import { pier, lighthouse } from "./structures";
import { sailboat, shipwreck, BoatColors } from "./boats";
import { crate, barrel, lanternPost } from "./props";

const PIER_WIDTH = 2.6;
const HEAD_LENGTH = 5;
const HEAD_WIDTH = 4.6;
/** Boats are modelled small; scale them up so Tadeo fits in comfortably. */
const BOAT_SCALE = 1.4;

interface PierInfo {
  start: THREE.Vector2;
  dir: THREE.Vector2;
  perp: THREE.Vector2;
  length: number;
  deckY: number;
  rotY: number;
  /** World (x, z) of a point given in pier coordinates (s along, z across). */
  at: (s: number, z: number) => [number, number];
}

/**
 * Build a pier from the shore near `landward` out to `end`, register its deck
 * and moor a boat beside the head on side `boatSide` (+1/-1 across the pier).
 */
export function buildPier(
  ctx: LandmarkContext,
  site: Site,
  landward: P2,
  end: P2,
  deckY: number,
  boat: { id: string; colors: BoatColors; name: string | null },
  boatSide: number,
  seed: number,
): PierInfo {
  const hf = ctx.hf;
  const e = new THREE.Vector2(...end);
  const dir = e.clone().sub(new THREE.Vector2(...landward)).normalize();
  // Walk inland from `landward` until the beach is nearly as high as the deck
  const start = new THREE.Vector2(...landward);
  for (let k = 0; k < 60 && hf.heightAt(start.x, start.y) < deckY - 0.3; k++) start.addScaledVector(dir, -0.25);
  const length = e.distanceTo(start);
  const perp = new THREE.Vector2(-dir.y, dir.x);
  const rotY = pointDir(dir.x, dir.y);
  const at = (s: number, z: number): [number, number] => [start.x + dir.x * s + perp.x * z, start.y + dir.y * s + perp.y * z];
  const model = pier({
    length,
    width: PIER_WIDTH,
    headLength: HEAD_LENGTH,
    headWidth: HEAD_WIDTH,
    seed,
    ground: (s, z) => hf.heightAt(...at(s, z)) - deckY,
  });
  // Mooring ropes from the bollards to the boat
  const bz = boatSide * (HEAD_WIDTH / 2 + BOAT_SCALE + 0.3);
  for (const ds of [-2.4, 2.4]) {
    const bs = ds < 0 ? length - HEAD_LENGTH + 0.6 : length - 0.6;
    model.solid.push(rope([bs, 0.45, boatSide * (HEAD_WIDTH / 2 - 0.35)], [length - HEAD_LENGTH / 2 + ds, 0.8 - deckY, bz - boatSide * 0.7], 0.25, 0.035));
  }
  // Lantern at the far end, crates and a barrel on the head
  addModel(model, lanternPost(3.0), placeAt(length - 0.5, 0, -boatSide * (HEAD_WIDTH / 2 - 0.45), Math.PI / 2 * boatSide));
  addModel(model, crate(seed, 0.8), placeAt(length - HEAD_LENGTH + 1.0, 0, -boatSide * 1.4, 0.3));
  addModel(model, crate(seed + 1, 0.65), placeAt(length - HEAD_LENGTH + 1.05, 0.8, -boatSide * 1.35, 0.9));
  addModel(model, barrel(seed, 1.0), placeAt(length - HEAD_LENGTH + 2.0, 0, -boatSide * 1.7));
  site.putAt(model, start.x, deckY, start.y, rotY);
  ctx.deck({
    start,
    dir,
    length,
    halfWidth: (s) => (s > length - HEAD_LENGTH ? HEAD_WIDTH : PIER_WIDTH) / 2,
    height: () => deckY,
  });
  for (const [s, z, r] of [[length - HEAD_LENGTH + 1.0, -boatSide * 1.4, 0.55], [length - HEAD_LENGTH + 2.0, -boatSide * 1.7, 0.45], [length - 0.5, -boatSide * (HEAD_WIDTH / 2 - 0.45), 0.3]]) {
    const [x, zz] = at(s, z);
    site.block(x, zz, r);
  }
  const [bx, bzw] = at(length - HEAD_LENGTH / 2, bz);
  const boatModel = addModel(emptyModel(), sailboat(ctx.atlas, boat.colors, boat.name, seed), new THREE.Matrix4().makeScale(BOAT_SCALE, BOAT_SCALE, BOAT_SCALE));
  ctx.boat(boat.id, boatModel, bx, bzw, rotY);
  return { start, dir, perp, length, deckY, rotY, at };
}

/** Spawn beach: long pier with Tadeo's boat, crates and barrels. */
export function buildSpawnBeach(ctx: LandmarkContext): void {
  const site = ctx.site("spawn");
  const boat: BoatColors = { hull: "#2f74c8", stripe: "#ffffff", sail: ["#e2432f", "#fff4e0"], pennant: "#ffd23f" };
  const info = buildPier(ctx, site, LANDMARKS.spawn, LANDMARKS.spawnPierEnd, 0.85, { id: "spawn", colors: boat, name: "TADEO" }, -1, 11);
  const rand = mulberry32(5);
  // Cargo unloaded on the beach beside the pier
  const cargo: [number, number, number][] = [[-1.5, 3.0, 0], [-0.6, 3.6, 1], [-1.2, 4.6, 2], [-2.4, -3.0, 3]];
  for (const [s, z, k] of cargo) {
    const [x, zz] = info.at(s, z);
    site.put(k === 1 ? barrel(k, 1.0) : crate(k + 20, 0.75 + rand() * 0.15), x, zz, rand() * 3, 1, 0.45);
    site.block(x, zz, 0.5);
  }
  const [cx, cz] = info.at(-1.0, 3.7);
  site.put(crate(31, 0.6), cx, cz, 0.6, 1, 0.4, 0.75);
}

/** Where the path that ends at `target` first drops below height `h` (its shoreline). */
function shoreAlongPath(ctx: LandmarkContext, target: P2, h: number): P2 {
  const path = PATHS.find((p) => p[p.length - 1][0] === target[0] && p[p.length - 1][1] === target[1]);
  if (!path) return target;
  for (let i = 0; i < path.length - 1; i++) {
    const a = new THREE.Vector2(...path[i]);
    const b = new THREE.Vector2(...path[i + 1]);
    for (let t = 0; t <= 1; t += 0.02) {
      const q = a.clone().lerp(b, t);
      if (ctx.hf.heightAt(q.x, q.y) < h) return [q.x, q.y];
    }
  }
  return target;
}

/** North dock: pier with the boat for the crossing to the treasure island. */
export function buildNorthDock(ctx: LandmarkContext): void {
  const site = ctx.site("northDock");
  const boat: BoatColors = { hull: "#d24a35", stripe: "#fff4e0", sail: ["#2f9a8f", "#fff4e0"], pennant: "#3f7fbf" };
  const info = buildPier(ctx, site, shoreAlongPath(ctx, LANDMARKS.northDock, 0.6), LANDMARKS.northDockEnd, 0.9, { id: "north", colors: boat, name: null }, -1, 23);
  const rand = mulberry32(8);
  for (const [s, z, k] of [[-1.0, -3.0, 0], [-1.8, -3.6, 1], [-0.4, -3.9, 0]] as const) {
    const [x, zz] = info.at(s, z);
    site.put(k ? barrel(s * 10, 1.0) : crate(s * 10, 0.8), x, zz, rand() * 3, 1, 0.45);
    site.block(x, zz, 0.5);
  }
}

/** Skull-shaped boulder (faces +z). */
function skullRock(seed: number): Model {
  const m = emptyModel();
  const bone = (p: THREE.Vector3, n: THREE.Vector3) => new THREE.Color("#d9d0bd").multiplyScalar(n.y < -0.2 ? 0.7 : 0.95 + Math.sin(p.x * 5 + p.y * 3) * 0.05);
  const cranium = new THREE.IcosahedronGeometry(1.6, 2);
  cranium.scale(1.05, 0.95, 1);
  displace(cranium, 0.08, 0.9, seed);
  facet(cranium);
  m.solid.push(part(cranium, bone, { pos: [0, 2.0, 0] }));
  const jaw = new THREE.IcosahedronGeometry(1.0, 1);
  jaw.scale(1.05, 0.6, 0.95);
  facet(jaw);
  m.solid.push(part(jaw, bone, { pos: [0, 0.75, 0.45] }));
  // Sockets and nose (dark, pushed into the surface so they read as holes)
  for (const sx of [-1, 1]) m.dark.push(ball(0.42, "#120d0b", [sx * 0.58, 2.0, 1.28], 1, [1, 1.05, 0.55]));
  m.dark.push(part(new THREE.ConeGeometry(0.2, 0.42, 3), "#120d0b", { pos: [0, 1.45, 1.42], rot: [Math.PI, 0, 0] }));
  for (let i = -2; i <= 2; i++) m.solid.push(box(0.22, 0.3, 0.2, "#efe7d4", { pos: [i * 0.26, 1.08, 1.32] }));
  m.dark.push(box(1.4, 0.06, 0.1, "#120d0b", { pos: [0, 0.92, 1.3] }));
  return m;
}

/** Painted strip that follows the terrain from a to b (for the red X). */
function paintStrip(site: Site, a: THREE.Vector2, b: THREE.Vector2, width: number, color: THREE.ColorRepresentation, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const n = 14;
  const dir = b.clone().sub(a).normalize();
  const perp = new THREE.Vector2(-dir.y, dir.x);
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    const w = (width / 2) * (0.85 + rand() * 0.3) * (i === 0 || i === n ? 0.6 : 1);
    for (const [arr, s] of [[left, 1], [right, -1]] as const) {
      const q = p.clone().addScaledVector(perp, s * w);
      arr.push(new THREE.Vector3(q.x, site.ground(q.x, q.y) + 0.06, q.y));
    }
  }
  const v: number[] = [];
  for (let i = 0; i < n; i++) {
    const [l0, r0, l1, r1] = [left[i], right[i], left[i + 1], right[i + 1]];
    v.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, l1.x, l1.y, l1.z, l1.x, l1.y, l1.z, r0.x, r0.y, r0.z, r1.x, r1.y, r1.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const painted = part(g, color);
  // Reason: winding depends on the strip direction; flip it so the strip faces up (not culled)
  return (g.attributes.normal as THREE.BufferAttribute).getY(0) < 0 ? flip(painted) : painted;
}

/** Treasure island: big red X, skull rock, shipwreck and a shovel stuck in the sand. */
export function buildTreasureIsland(ctx: LandmarkContext): void {
  const site = ctx.site("treasure");
  const [tx, tz] = LANDMARKS.treasureIsland;
  const c = new THREE.Vector2(tx, tz);
  const L = 2.8;
  for (const [i, a] of [[0, Math.PI / 4], [1, -Math.PI / 4]] as const) {
    const d = new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(L);
    site.model.solid.push(paintStrip(site, c.clone().sub(d), c.clone().add(d), 0.95, "#d8261c", 50 + i));
  }
  site.clearGrass(tx, tz, 4);
  // Shovel stuck in the sand beside the X
  const shovel = emptyModel();
  shovel.solid.push(pole([0, -0.3, 0], [0.25, 1.3, 0.1], 0.05, PAL.woodLight));
  shovel.solid.push(box(0.36, 0.46, 0.05, "#8d939c", { pos: [-0.04, -0.2, -0.01], rot: [0, 0, -0.15] }));
  shovel.solid.push(box(0.36, 0.06, 0.08, PAL.woodDark, { pos: [0.27, 1.32, 0.1], rot: [0, 0, -0.15] }));
  site.put(shovel, tx + 3.4, tz + 1.6, 0.8);
  // Skull rock looking south over the X
  const sk: P2 = [tx + 1.0, tz - 6.5];
  site.put(skullRock(7), sk[0], sk[1], faceDir(tx - sk[0], tz - sk[1]), 1, 1.4, -0.3);
  site.block(sk[0], sk[1], 1.9);
  // Shipwreck half-buried on the west beach
  const wr: P2 = [tx - 7.5, tz + 4.5];
  site.put(shipwreck(3), wr[0], wr[1], 0.9, 1.15, 0.5, 0.35);
  site.block(wr[0], wr[1], 2.0);
  site.block(wr[0] - 1.0, wr[1] - 1.2, 1.2);
  // A few boulders and a barrel washed ashore
  const rand = mulberry32(17);
  for (const [x, z, s] of [[tx + 6.5, tz - 3.5, 1.0], [tx - 5.5, tz - 4.0, 0.8], [tx + 5.0, tz + 5.5, 0.7]] as const) {
    const m = emptyModel();
    m.solid.push(rockBlob(Math.round(x * 3), [s * 1.2, s * 0.8, s], stoneFn("#a49a8c", 0.3, rand)));
    site.put(m, x, z, rand() * 3, 1, s, s * 0.3);
    site.block(x, z, s);
  }
  site.put(barrel(77, 1.0), tx - 3.2, tz + 6.4, 0.4, 1, 0.4, -0.15);
}

/** Lighthouse on the north-west clifftop, its lamp sweeping a soft beam. */
export function buildLighthouse(ctx: LandmarkContext): void {
  const site = ctx.site("lighthouse");
  const p: P2 = LIGHTHOUSE_AT;
  const y = site.groundMin(p[0], p[1], 1.6);
  const { model, lampY } = lighthouse(5);
  site.putAt(model, p[0], y, p[1], 0.6);
  site.block(p[0], p[1], 2.4);
  // Rotating light beam: two additive cones joined at the lamp
  const beamGeo = new THREE.ConeGeometry(1.6, 16, 16, 1, true);
  beamGeo.translate(0, -8, 0);
  // Reason: additive blending adds nothing for black, so fading the vertex colour to black
  // along the cone makes the beam dissolve into the air instead of ending as a solid tube.
  const pos = beamGeo.attributes.position;
  const fade = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) fade.fill((1 + pos.getY(i) / 16) ** 1.6, i * 3, i * 3 + 3);
  beamGeo.setAttribute("color", new THREE.BufferAttribute(fade, 3));
  beamGeo.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.9, 0.6), vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const beam = new THREE.Group();
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(beamGeo, mat);
    m.scale.x = s;
    beam.add(m);
  }
  beam.position.set(p[0], y + lampY, p[1]);
  ctx.add(beam);
  ctx.animate((t) => (beam.rotation.y = t * 0.6));
}

/** Clifftop on the north edge of the cave mesa, visible from the north dock. */
const LIGHTHOUSE_AT: P2 = [-63.5, -40.2];

