/**
 * Set pieces of the newer regions: the lagoon jetty with beach huts, the
 * stepping stones across the river ford, the old jungle ruin with its giant
 * stone head, the frog king's toadstool islet in the swamp, the plank walk from
 * the swamp to the old landing beach and the windmill on the flower hills (its
 * sails turn).
 */

import * as THREE from "three";
import { SPOTS } from "../layout";
import { part, merge, ColorFn } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { LandmarkContext, Site } from "./site";
import { Model, PAL, emptyModel, addModel, placeAt, pointDir, ball, box, cyl, rbox, beam, rockBlob, stoneFn } from "./shapes";
import { pier } from "./structures";
import { BoatColors } from "./boats";
import { buildPier } from "./coastSites";
import { crate, barrel, haystack, fence } from "./props";

/** Ruin turned so the stone head looks north-east at the path junction. */
const RUIN_ROT = 2.8;
/** Walk-surface height of the ford stepping stones (river bed there is about -0.3). */
const FORD_STONE_TOP = 0.35;

export function buildRegionSites(ctx: LandmarkContext): void {
  buildLagoon(ctx);
  buildFord(ctx);
  buildJungleRuin(ctx);
  buildFrogIslet(ctx);
  buildBoardwalk(ctx);
  buildWindmill(ctx);
}

/** Plank walk with rope rails over the strait between the old landing beach and the swamp. */
function buildBoardwalk(ctx: LandmarkContext): void {
  const site = ctx.site("boardwalk");
  const start = new THREE.Vector2(...SPOTS.boardwalk);
  const end = new THREE.Vector2(...SPOTS.boardwalkEnd);
  const dir = end.clone().sub(start).normalize();
  const length = start.distanceTo(end);
  const deckY = Math.max(0.45, (ctx.hf.heightAt(start.x, start.y) + ctx.hf.heightAt(end.x, end.y)) / 2 + 0.1);
  const width = 2.2;
  const at = (s: number, z: number): [number, number] => [start.x + dir.x * s - dir.y * z, start.y + dir.y * s + dir.x * z];
  const model = pier({ length, width, headLength: 0, headWidth: width, seed: 13, ground: (s, z) => ctx.hf.heightAt(...at(s, z)) - deckY });
  site.putAt(model, start.x, deckY, start.y, pointDir(dir.x, dir.y));
  ctx.deck({ start, dir, length, halfWidth: () => width / 2, height: () => deckY });
}

/** Lagoon: a jetty with a fishing boat, two thatched beach huts and some cargo. */
function buildLagoon(ctx: LandmarkContext): void {
  const site = ctx.site("lagoon");
  const colors: BoatColors = { hull: "#e8a23a", stripe: "#ffffff", sail: ["#2fa8c8", "#fff4e0"], pennant: "#e2432f" };
  buildPier(ctx, site, SPOTS.lagoonJetty, SPOTS.lagoonJettyEnd, 0.75, { id: "lagoon", colors, name: null }, 1, 41);
  const [bx, bz] = SPOTS.lagoonBeach;
  for (const [dx, dz, rot, seed] of [[-7, -5, 0.9, 1], [-8, 4, 2.2, 2]] as const) {
    site.put(beachHut(seed), bx + dx, bz + dz, rot, 1, 1.8);
    site.block(bx + dx, bz + dz, 1.9);
  }
  const rand = mulberry32(9);
  for (const [dx, dz, k] of [[-3, -7.5, 0], [-2.2, -8.6, 1], [-4.1, 6.8, 2]] as const) {
    site.put(k === 1 ? barrel(k, 0.9) : crate(k + 50, 0.7), bx + dx, bz + dz, rand() * 3, 1, 0.45);
    site.block(bx + dx, bz + dz, 0.5);
  }
}

/** A hut on short stilts with a straw roof and a striped towel on the rail. */
function beachHut(seed: number): Model {
  const m = emptyModel();
  const w = 3.2;
  const floor = 0.55;
  const inset = w / 2 - 0.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.solid.push(cyl(0.11, 0.13, 2.9, PAL.woodDark, { pos: [sx * inset, 1.45, sz * inset] }, 6));
  m.solid.push(rbox(w, 0.16, w, PAL.plank, { pos: [0, floor, 0] }, 0.04));
  // Back and side walls of woven reed, open at the front
  m.solid.push(box(w - 0.3, 1.5, 0.08, "#c9a25a", { pos: [0, floor + 0.8, -inset] }));
  for (const sx of [-1, 1]) m.solid.push(box(0.08, 1.5, w - 0.3, "#c9a25a", { pos: [sx * inset, floor + 0.8, 0] }));
  const straw: ColorFn = (p) => new THREE.Color("#b88d3e").lerp(new THREE.Color("#e2bf6a"), 0.5 + 0.5 * Math.sin(p.y * 14));
  m.solid.push(part(new THREE.ConeGeometry(w * 0.95, 1.6, 4), straw, { pos: [0, 3.6, 0], rot: [0, Math.PI / 4, 0] }));
  // Front rail with a towel
  m.solid.push(beam([-inset, floor + 0.7, inset], [inset, floor + 0.7, inset], 0.08, PAL.wood));
  m.solid.push(box(0.9, 0.6, 0.04, ["#ff5f7e", "#3fb6e6", "#ffd23f"][seed % 3], { pos: [0.5, floor + 0.42, inset + 0.04] }));
  m.solid.push(box(0.9, 0.12, 0.05, PAL.white, { pos: [0.5, floor + 0.42, inset + 0.05] }));
  // A surfboard leaning on the side
  m.solid.push(rbox(0.5, 2.0, 0.08, seed % 2 ? "#3fb6e6" : "#ff8a3a", { pos: [w / 2 + 0.2, 1.0, 0.6], rot: [0, 0, -0.25] }, 0.2, 2));
  return m;
}

/** Flat stones across the shallow ford; each one is a little walkable deck. */
function buildFord(ctx: LandmarkContext): void {
  const site = ctx.site("ford");
  const [fx, fz] = SPOTS.ford;
  const rand = mulberry32(17);
  for (let i = -5; i <= 5; i++) {
    const x = fx + i * 1.15 + (rand() - 0.5) * 0.15;
    const z = fz + (rand() - 0.5) * 0.5;
    const bottom = ctx.hf.heightAt(x, z) - 0.2;
    // Only where the river is actually lower than the stone top
    if (bottom + 0.2 > FORD_STONE_TOP - 0.05) continue;
    const r = 0.5 + rand() * 0.1;
    const stone = emptyModel();
    stone.solid.push(rockBlob(i + 30, [r, (FORD_STONE_TOP - bottom) / 2, r * 0.9], stoneFn(PAL.stoneLight, 0.35, rand)));
    site.putAt(stone, x, (FORD_STONE_TOP + bottom) / 2, z, rand() * 3);
    ctx.deck({ start: new THREE.Vector2(x - r * 0.75, z), dir: new THREE.Vector2(1, 0), length: r * 1.5, halfWidth: () => r * 0.8, height: () => FORD_STONE_TOP });
  }
}

/** Old temple ruin in the jungle: steps, broken columns, fallen blocks and a giant stone head. */
function buildJungleRuin(ctx: LandmarkContext): void {
  const site = ctx.site("jungleRuin");
  const [x, z] = SPOTS.jungleRuin;
  const rand = mulberry32(23);
  const stone = stoneFn("#c9bda6", 0.3, rand);
  const ruin = emptyModel();
  // Three wide steps up to a platform
  for (let s = 0; s < 3; s++) ruin.solid.push(rbox(9 - s * 1.6, 0.45, 8 - s * 1.6, stone, { pos: [0, 0.22 + s * 0.45, 0] }, 0.08));
  const top = 1.35;
  const columns = [[-2.6, -2.2, 2.6], [2.6, -2.2, 1.4], [-2.6, 2.0, 0.9], [2.6, 2.0, 2.2]] as const;
  for (const [cx, cz, h] of columns) {
    ruin.solid.push(cyl(0.42, 0.48, h, stone, { pos: [cx, top + h / 2, cz] }, 10));
    ruin.solid.push(rbox(1.1, 0.25, 1.1, stone, { pos: [cx, top + 0.12, cz] }, 0.05));
  }
  // A fallen column drum and a lintel block on the ground
  ruin.solid.push(cyl(0.42, 0.42, 1.1, stone, { pos: [4.8, 0.42, 3.4], rot: [0, 0.4, Math.PI / 2] }, 10));
  ruin.solid.push(rbox(2.4, 0.5, 0.8, stone, { pos: [-4.6, 0.25, 3.8], rot: [0, 0.6, 0.1] }, 0.06));
  addModel(ruin, stoneHead(stone), placeAt(0, top, -1.2));
  site.putAt(ruin, x, site.groundMin(x, z, 4.5), z, RUIN_ROT);
  // The platform is one big obstacle; the columns stand on it
  site.block(x, z, 4.2);
  for (const [cx, cz] of columns) site.block(...Site.local(x, z, RUIN_ROT, cx, cz), 0.5);

  // Mossy boulders around the jungle pool
  const [px, pz] = SPOTS.junglePool;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const r = 6.2 + rand() * 1.2;
    const s = 0.7 + rand() * 0.7;
    const bx = px + Math.cos(a) * r;
    const bz = pz + Math.sin(a) * r;
    const m = emptyModel();
    m.solid.push(rockBlob(i + 60, [s * 1.3, s, s * 1.1], stoneFn("#8f877d", 0.7, rand)));
    site.putAt(m, bx, site.groundMin(bx, bz, s) + s * 0.35, bz, rand() * 3);
    site.block(bx, bz, s);
  }
}

/** A friendly giant stone head with a mossy top, looking out over the jungle. The Hüter's ghost wears the same face. */
export function stoneHead(stone: ColorFn, mouth: THREE.ColorRepresentation = PAL.stoneDark, moss: THREE.ColorRepresentation = PAL.moss): Model {
  const m = emptyModel();
  m.solid.push(rbox(2.4, 3.2, 2.0, stone, { pos: [0, 1.6, 0] }, 0.35, 3));
  m.solid.push(rbox(2.6, 0.5, 2.2, stone, { pos: [0, 3.25, 0] }, 0.2, 2));
  // Brow, nose, smile and ears
  m.solid.push(rbox(2.2, 0.32, 0.4, stone, { pos: [0, 2.3, 1.0] }, 0.12));
  m.solid.push(rbox(0.5, 1.0, 0.55, stone, { pos: [0, 1.75, 1.15] }, 0.18, 2));
  m.solid.push(rbox(1.3, 0.22, 0.25, mouth, { pos: [0, 0.95, 1.02] }, 0.1));
  for (const sx of [-1, 1]) {
    m.solid.push(rbox(0.3, 1.0, 0.5, stone, { pos: [sx * 1.3, 1.9, 0] }, 0.12));
    m.dark.push(ball(0.2, "#1d1a18", [sx * 0.55, 2.0, 1.02], 1, [1.2, 0.8, 0.4]));
  }
  m.solid.push(ball(0.9, moss, [0.3, 3.55, 0.1], 1, [1.4, 0.35, 1.1]));
  return m;
}

/** The frog king's islet: a big red toadstool throne and two little ones. */
function buildFrogIslet(ctx: LandmarkContext): void {
  const site = ctx.site("frogIslet");
  const [x, z] = SPOTS.frogIslet;
  site.put(toadstool(1.5, 1.1, 1), x, z, 0, 1, 1.0);
  site.block(x, z, 0.8);
  site.put(toadstool(0.7, 0.5, 2), x + 1.6, z + 0.9, 0.5, 1, 0.4);
  site.put(toadstool(0.55, 0.4, 3), x - 1.4, z + 1.2, 1.1, 1, 0.4);
}

/** Red toadstool with white dots; `h` = stem height, `r` = cap radius. */
function toadstool(h: number, r: number, seed: number): Model {
  const m = emptyModel();
  m.solid.push(cyl(r * 0.32, r * 0.42, h, "#f6efdf", { pos: [0, h / 2, 0] }, 10));
  m.solid.push(part(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#e2402f", { pos: [0, h, 0], scale: [1, 0.6, 1] }));
  const rand = mulberry32(seed + 70);
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    const t = (0.25 + rand() * 0.6) * 1.4;
    const p: [number, number, number] = [Math.cos(a) * Math.sin(t) * r, h + Math.cos(t) * r * 0.6, Math.sin(a) * Math.sin(t) * r];
    m.solid.push(ball(r * 0.12, PAL.white, p, 1, [1, 0.45, 1]));
  }
  return m;
}

/** Windmill on the highest flower hill; the sails are a separate mesh that turns. */
function buildWindmill(ctx: LandmarkContext): void {
  const site = ctx.site("windmill");
  const [x, z] = SPOTS.windmill;
  const y = site.groundMin(x, z, 2.4);
  const towerH = 7.5;
  const m = emptyModel();
  const plaster: ColorFn = (p) => new THREE.Color(PAL.plaster).multiplyScalar(0.95 + 0.05 * Math.sin(p.y * 3));
  const tiles: ColorFn = (p) => new THREE.Color("#c8452f").multiplyScalar(0.85 + 0.15 * Math.sin(p.y * 8));
  m.solid.push(cyl(2.3, 2.5, 1.0, stoneFn(PAL.stone, 0.3), { pos: [0, 0.5, 0] }, 14));
  m.solid.push(cyl(1.7, 2.3, towerH, plaster, { pos: [0, 1 + towerH / 2, 0] }, 14));
  m.solid.push(part(new THREE.ConeGeometry(2.1, 2.4, 14), tiles, { pos: [0, 1 + towerH + 1.15, 0] }));
  // Door and lit windows facing west (-x), where the sails are
  m.solid.push(rbox(0.2, 1.7, 1.1, PAL.woodDark, { pos: [-2.25, 1.85, 0] }, 0.05));
  for (const wy of [4.2, 6.4]) m.glow.push(rbox(0.12, 0.7, 0.6, "#ffd27a", { pos: [-(2.1 - wy * 0.07), wy, 0] }, 0.05));
  site.putAt(m, x, y, z);
  site.block(x, z, 2.5);

  // Sails: hub + four lattice arms with cloth, turning about the x axis
  const sails = emptyModel();
  sails.solid.push(cyl(0.35, 0.35, 0.8, PAL.woodDark, { rot: [0, 0, Math.PI / 2] }, 10));
  for (let i = 0; i < 4; i++) {
    const arm = emptyModel();
    arm.solid.push(box(0.12, 5.2, 0.18, PAL.wood, { pos: [0, 2.7, 0] }));
    for (let k = 0; k < 5; k++) arm.solid.push(box(0.08, 0.08, 1.2, PAL.woodLight, { pos: [0, 1.0 + k * 0.95, 0.55] }));
    arm.solid.push(box(0.04, 4.0, 1.05, "#f7f0dc", { pos: [0.04, 3.1, 0.62] }));
    addModel(sails, arm, new THREE.Matrix4().makeRotationX((i / 4) * Math.PI * 2));
  }
  const mesh = new THREE.Mesh(merge(sails.solid), ctx.materials.solid);
  mesh.castShadow = true;
  const hub = new THREE.Group();
  hub.name = "windmill:sails";
  hub.position.set(x - 2.4, y + 1 + towerH - 0.3, z);
  hub.add(mesh);
  ctx.add(hub);
  ctx.animate((_time, dt) => (hub.rotation.x += dt * 0.55));

  // Haystack, a fence and beehives around the mill
  const rand = mulberry32(31);
  site.put(haystack(3), x + 5, z + 4, 0.4, 0.8, 1.2);
  site.block(x + 5, z + 4, 1.3);
  site.put(fence(6, 4), x - 3, z + 6.5, 0.1, 1, 0.4);
  for (let i = 0; i < 3; i++) {
    const hx = x + 4.5 + i * 1.3;
    const hz = z - 4.5 + (rand() - 0.5) * 0.4;
    site.put(beehive(), hx, hz, rand() * 0.4, 1, 0.4);
    site.block(hx, hz, 0.45);
  }
}

/** Stacked beehive boxes on a little stand. */
function beehive(): Model {
  const m = emptyModel();
  m.solid.push(box(0.7, 0.3, 0.7, PAL.woodDark, { pos: [0, 0.15, 0] }));
  for (let k = 0; k < 3; k++) m.solid.push(rbox(0.62, 0.32, 0.62, k % 2 ? PAL.white : "#ffd23f", { pos: [0, 0.48 + k * 0.33, 0] }, 0.04));
  m.solid.push(rbox(0.8, 0.1, 0.8, PAL.woodDark, { pos: [0, 1.5, 0] }, 0.03));
  return m;
}
