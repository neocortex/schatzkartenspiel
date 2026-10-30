/**
 * Eastern set pieces: the arched wooden bridge over the river, the mountain
 * trailhead (stone steps, rope fence) with the golden shrine on the summit,
 * and the waterfall at the river spring.
 */

import * as THREE from "three";
import { LANDMARKS, RIVER } from "../layout";
import { merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { LandmarkContext } from "./site";
import { V3, PAL, emptyModel, pointDir, rbox, ball, rockBlob, stoneFn, withSway } from "./shapes";
import { bridge } from "./structures";
import { ropeFence } from "./props";
import { shrine } from "./monuments";
import { ribbon, waterfallMaterial, foamMaterial } from "./effects";

const BRIDGE_SPAN = 15;
const BRIDGE_WIDTH = 3.0;
const BRIDGE_RISE = 1.1;

/** Arched bridge spanning the river east–west at LANDMARKS.bridge. */
export function buildBridge(ctx: LandmarkContext): void {
  const hf = ctx.hf;
  const site = ctx.site("bridge");
  const [bx, bz] = LANDMARKS.bridge;
  const half = BRIDGE_SPAN / 2;
  // Reason: sample across the deck width so the deck ends never dip below a bank that slopes sideways
  const endY = (x: number) => Math.max(...[-1.5, 0, 1.5].map((dz) => hf.heightAt(x, bz + dz))) + 0.12;
  const yL = endY(bx - half);
  const yR = endY(bx + half);
  const deckAt = (lx: number) => {
    const t = (lx + half) / BRIDGE_SPAN;
    return yL + (yR - yL) * t + BRIDGE_RISE * Math.sin(Math.PI * t);
  };
  site.putAt(bridge({ span: BRIDGE_SPAN, width: BRIDGE_WIDTH, deckAt, ground: (lx, lz) => hf.heightAt(bx + lx, bz + lz), seed: 3 }), bx, 0, bz, 0, 1);
  ctx.deck({
    start: new THREE.Vector2(bx - half, bz),
    dir: new THREE.Vector2(1, 0),
    length: BRIDGE_SPAN,
    halfWidth: () => BRIDGE_WIDTH / 2 - 0.1,
    height: (s) => deckAt(s - half),
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) site.block(bx + sx * (half - 0.3), bz + sz * (BRIDGE_WIDTH / 2 + 0.05), 0.25);
  site.clearGrass(bx - half - 1, bz, 2.5);
  site.clearGrass(bx + half + 1, bz, 2.5);
}

/** Mountain trailhead: stone steps up the slope with a rope fence and the summit shrine. */
export function buildTrailhead(ctx: LandmarkContext): void {
  const hf = ctx.hf;
  const site = ctx.site("trailhead");
  const rand = mulberry32(19);
  // Reason: LANDMARKS.mountainGate lies in the river channel, so the steps start on the dry east bank just south of it
  const a = new THREE.Vector2(54.8, -12.2);
  const b = new THREE.Vector2(57.6, -17.6);
  const dir = b.clone().sub(a).normalize();
  const perp = new THREE.Vector2(-dir.y, dir.x);
  const rot = pointDir(perp.x, perp.y);
  const n = 11;
  const posts: { l: V3[]; r: V3[] } = { l: [], r: [] };
  for (let i = 0; i < n; i++) {
    const p = a.clone().lerp(b, i / (n - 1));
    const y = Math.max(...[-0.8, 0, 0.8].map((k) => hf.heightAt(p.x + perp.x * k, p.y + perp.y * k)));
    const m = emptyModel();
    // Reason: tall slabs whose tops form the steps; their lower parts sink into the slope so none float
    m.solid.push(rbox(1.9 + rand() * 0.2, 1.4, 0.8, stoneFn(PAL.stoneLight, 0.35, rand), { pos: [0, -0.6, 0], rot: [0, (rand() - 0.5) * 0.08, 0] }, 0.1));
    site.putAt(m, p.x, y, p.y, rot);
    if (i % 2 === 0) {
      for (const [side, list] of [[1, posts.l], [-1, posts.r]] as const) {
        const q = p.clone().addScaledVector(perp, side * 1.3);
        list.push([q.x, hf.heightAt(q.x, q.y) - 0.1, q.y]);
      }
    }
  }
  site.putAt(ropeFence(posts.l, 1), 0, 0, 0);
  site.putAt(ropeFence(posts.r, 2), 0, 0, 0);
  for (const p of [...posts.l, ...posts.r]) site.block(p[0], p[2], 0.2);
  for (const [k, side] of [[0.2, 1], [0.6, -1], [-0.3, -1]] as const) {
    const q = a.clone().addScaledVector(dir, k * 6).addScaledVector(perp, side * 2.4);
    const m = emptyModel();
    const sz = 0.5 + rand() * 0.4;
    m.solid.push(rockBlob(Math.round(q.x * 5), [sz * 1.3, sz, sz], stoneFn(PAL.stone, 0.6, rand)));
    site.put(m, q.x, q.y, rand() * 3, 1, sz, sz * 0.3);
    site.block(q.x, q.y, sz);
  }

  // Golden shrine on the summit spot whose whole footprint is highest
  const [mx, mz] = LANDMARKS.mountain;
  const ring = (x: number, z: number) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => hf.heightAt(x + Math.cos(i * 0.785) * 1.6, z + Math.sin(i * 0.785) * 1.6));
  let best: [number, number, number] = [-Infinity, mx, mz];
  for (let x = mx - 7; x <= mx + 7; x += 0.5) {
    for (let z = mz - 7; z <= mz + 7; z += 0.5) {
      if (Math.hypot(x - mx, z - mz) > 7) continue;
      const score = Math.min(...ring(x, z));
      if (score > best[0]) best = [score, x, z];
    }
  }
  const [, sx, sz] = best;
  const heights = ring(sx, sz);
  // Reason: the summit is jagged, so the shrine stands on a rock pedestal that tops the surrounding spikes
  const top = Math.max(...heights, hf.heightAt(sx, sz)) + 0.3;
  const depth = top - Math.min(...heights) + 1.2;
  const pedestal = emptyModel();
  pedestal.solid.push(rockBlob(23, [2.3, depth / 2, 2.3], stoneFn(PAL.stone, 0.4, rand)));
  site.putAt(pedestal, sx, top - depth / 2, sz, 0.3);
  site.putAt(shrine(4), sx, top - 0.15, sz, 0.5, 1.5);
}

/** Waterfall pouring off the cliff into the river spring, with foam at its base. */
export function buildWaterfall(ctx: LandmarkContext): void {
  const hf = ctx.hf;
  const site = ctx.site("waterfall");
  const [rx, rz] = RIVER[0];
  let lipZ = rz;
  while (hf.heightAt(rx, lipZ) < 15 && lipZ > rz - 12) lipZ -= 0.1;
  const lipY = hf.heightAt(rx, lipZ) + 0.1;
  // First z (going south from the lip) where the terrain is lower than y
  const faceZ = (y: number) => {
    let z = lipZ - 0.5;
    while (hf.heightAt(rx, z) > y && z < rz + 4) z += 0.1;
    return z;
  };
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  const steps = 26;
  let baseZ = lipZ;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = lipY - t * (lipY + 0.3);
    const z = Math.max(lipZ + 0.3 + 2.4 * Math.pow(t, 0.8), faceZ(y) + 0.45);
    const w = 2.4 + t * 1.2;
    left.push(new THREE.Vector3(rx - w / 2, y, z));
    right.push(new THREE.Vector3(rx + w / 2, y, z));
    baseZ = z;
  }
  const fall = new THREE.Mesh(ribbon(left, right), waterfallMaterial(ctx.world));
  fall.name = "waterfall";
  fall.renderOrder = 2;
  ctx.add(fall);
  // Spreading foam on the pool and churning foam puffs
  const foamGeo = new THREE.PlaneGeometry(6, 6);
  foamGeo.rotateX(-Math.PI / 2);
  const foam = new THREE.Mesh(foamGeo, foamMaterial(ctx.world));
  foam.position.set(rx, 0.06, baseZ + 0.6);
  foam.renderOrder = 3;
  ctx.add(foam);
  // Reason: the cloth shader's per-vertex wobble makes the white puffs churn like foam
  const puffs: THREE.BufferGeometry[] = [];
  const rand = mulberry32(23);
  const white = new THREE.Color(1.45, 1.5, 1.55);
  for (let i = 0; i < 28; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 2.0;
    const s = 0.22 + rand() * 0.32 + (r < 0.7 ? 0.15 : 0);
    const y = 0.02 + rand() * 0.15 + (r < 0.7 ? 0.25 + rand() * 0.7 : 0);
    puffs.push(withSway(ball(s, white, [rx + Math.cos(a) * r * 1.3, y, baseZ + 0.3 + Math.sin(a) * r * 0.8], 1, [1, 0.7, 1]), () => 0.08));
  }
  const puffMesh = new THREE.Mesh(merge(puffs), ctx.materials.cloth);
  puffMesh.name = "waterfall-foam";
  ctx.add(puffMesh);
  // Mossy boulders framing the lip and the basin
  for (const [x, y, z, s] of [[rx - 2.0, lipY - 0.3, lipZ + 0.2, 1.1], [rx + 2.1, lipY - 0.5, lipZ + 0.3, 1.2], [rx - 3.0, 0.2, baseZ + 0.6, 1.3], [rx + 3.2, 0.1, baseZ + 0.9, 1.1]] as const) {
    const m = emptyModel();
    m.solid.push(rockBlob(Math.round(x * 3 + y), [s * 1.2, s, s], stoneFn("#8f877d", 0.7, rand)));
    site.putAt(m, x, y, z, rand() * 3, 1);
  }
}
