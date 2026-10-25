/**
 * Western set pieces: the volcano (lava lake in the crater, a lava stream down
 * the south-west flank, vents, lava bombs and a warning sign at its foot), the
 * three rune tablets around the lake, the old-mine cave entrance and the
 * enchanted forest gate.
 */

import * as THREE from "three";
import { LANDMARKS, P2 } from "../layout";
import { part, displace, facet } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { LandmarkContext } from "./site";
import { Model, PAL, emptyModel, faceDir, cyl, rockBlob, stoneFn } from "./shapes";
import { lavaMaterial, ribbon } from "./effects";
import { boardSign, ventRing, crate, barrel, mineCart } from "./props";
import { tablet, crystal, caveEntrance, forestArch } from "./monuments";

/** Dark rock with glowing veins: a pulsing core pokes through the cracked crust. */
function lavaBomb(seed: number, s: number): Model {
  const m = emptyModel();
  const crust = new THREE.IcosahedronGeometry(s, 1);
  displace(crust, s * 0.28, 1.6 / s, seed);
  facet(crust);
  m.solid.push(part(crust, (_p, n) => new THREE.Color(n.y > 0.4 ? "#4a3f40" : "#2e2729")));
  const core = new THREE.IcosahedronGeometry(s * 0.93, 1);
  displace(core, s * 0.12, 1.1 / s, seed + 9);
  m.pulse.push(part(core, new THREE.Color(3.4, 0.9, 0.12)));
  return m;
}

/** Triangular "!" warning sign on a post (faces +z). */
function warningTriangle(ctx: LandmarkContext): Model {
  const m = emptyModel();
  m.solid.push(cyl(0.07, 0.09, 2.3, PAL.iron, { pos: [0, 1.15, -0.06] }, 6));
  const tri = (r: number) => {
    const s = new THREE.Shape();
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    return s;
  };
  const outer = new THREE.ExtrudeGeometry(tri(0.62), { depth: 0.06, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.02, bevelSegments: 1 });
  m.solid.push(part(outer, "#d42a1f", { pos: [0, 2.25, -0.03] }));
  m.solid.push(part(new THREE.ShapeGeometry(tri(0.46)), "#ffd23f", { pos: [0, 2.22, 0.075] }));
  m.solid.push(part(new THREE.ShapeGeometry(tri(0.46)), "#ffd23f", { pos: [0, 2.22, -0.075], rot: [0, Math.PI, 0] }));
  const mark = ctx.atlas.quad("!", 0.36, 0.36, "#2a1208");
  mark.translate(0, 2.17, 0.08);
  m.text.push(mark);
  return m;
}

/** Lava lake, lava stream, vents, lava bombs and warnings at the volcano. */
export function buildVolcano(ctx: LandmarkContext): void {
  const hf = ctx.hf;
  const site = ctx.site("volcano");
  const [vx, vz] = LANDMARKS.volcano;
  // Reason: keep the lava just below the lowest point of the inner crater wall so it never spills
  let ringMin = Infinity;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ringMin = Math.min(ringMin, hf.heightAt(vx + Math.cos(a) * 5, vz + Math.sin(a) * 5));
  }
  const level = ringMin - 0.35;
  const poolGeo = new THREE.CircleGeometry(6.6, 72);
  poolGeo.rotateX(-Math.PI / 2);
  const pool = new THREE.Mesh(poolGeo, lavaMaterial(ctx.world, level, false));
  pool.position.set(vx, level, vz);
  pool.name = "lava-pool";
  ctx.add(pool);
  if (hf.heightAt(vx, vz) > level - 0.6) site.putAt(lavaBomb(3, 1.3), vx, level - 0.2, vz, 0.4, 1);

  // Lava stream down the south-west flank (follows the steepest descent)
  const dir0 = new THREE.Vector2(-0.45, 1).normalize();
  const p = new THREE.Vector2(vx, vz).addScaledVector(dir0, 7.6);
  const pts: THREE.Vector2[] = [p.clone()];
  let d = dir0.clone();
  for (let i = 0; i < 70; i++) {
    const gx = hf.heightAt(p.x + 0.5, p.y) - hf.heightAt(p.x - 0.5, p.y);
    const gz = hf.heightAt(p.x, p.y + 0.5) - hf.heightAt(p.x, p.y - 0.5);
    const down = new THREE.Vector2(-gx, -gz).normalize();
    d = d.multiplyScalar(0.6).add(down.multiplyScalar(0.4)).normalize();
    p.addScaledVector(d, 0.45);
    pts.push(p.clone());
    if (hf.heightAt(p.x, p.y) < 7 || pts.length * 0.45 > 24) break;
  }
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  pts.forEach((q, i) => {
    const t = i / (pts.length - 1);
    const tan = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
    const w = (1.9 - t * 1.1) * (1 + Math.sin(i * 0.7) * 0.12);
    const l = q.clone().add(new THREE.Vector2(-tan.y, tan.x).multiplyScalar(w / 2));
    const r = q.clone().add(new THREE.Vector2(tan.y, -tan.x).multiplyScalar(w / 2));
    left.push(new THREE.Vector3(l.x, hf.heightAt(l.x, l.y) + 0.12, l.y));
    right.push(new THREE.Vector3(r.x, hf.heightAt(r.x, r.y) + 0.12, r.y));
  });
  const stream = new THREE.Mesh(ribbon(left, right), lavaMaterial(ctx.world, 0, true));
  stream.name = "lava-stream";
  ctx.add(stream);
  // Glowing fissure where the stream wells up
  site.putAt(ventRing(5, 1.2), pts[0].x, hf.heightAt(pts[0].x, pts[0].y) - 0.1, pts[0].y, 0, 1);

  // Volcano gate: vents, cooling lava bombs, warning signs
  const [gx, gz] = LANDMARKS.volcanoGate;
  for (const [x, z, r, seed] of [[gx - 4.6, gz - 1.8, 1.4, 1], [gx - 2.6, gz - 5.0, 0.9, 2]] as const) {
    const y = site.ground(x, z) + 0.05;
    site.putAt(ventRing(seed, r), x, y, z, seed, 1);
    site.block(x, z, r + 0.2);
    ctx.vents.push(new THREE.Vector3(x, y + 0.3, z));
  }
  const rand = mulberry32(12);
  for (const [x, z, s] of [[gx - 6.5, gz + 1.5, 0.6], [gx - 1.6, gz - 2.6, 0.45], [gx - 7.2, gz - 4.0, 0.75], [gx + 2.6, gz - 3.4, 0.4]] as const) {
    site.put(lavaBomb(Math.round(x * 7), s), x, z, rand() * 3, 1, s, s * 0.35);
    site.block(x, z, s);
  }
  const sx = gx + 2.4;
  const sz = gz + 2.4;
  site.put(boardSign(ctx.atlas, "Achtung Lava!", 2.7, "#f2c230", "#3a1a0a"), sx, sz, 0.25, 1, 0.8);
  site.put(warningTriangle(ctx), sx - 2.0, sz + 0.3, 0.3, 1, 0.3);
  site.block(sx, sz, 0.8);
  site.block(sx - 2.0, sz + 0.3, 0.3);
}

/** Three rune tablets around the lake, facing the water; the third (ghost) tablet carries a floating crystal. */
export function buildTablets(ctx: LandmarkContext): void {
  const site = ctx.site("tablets");
  const [lx, lz] = LANDMARKS.lake;
  const rand = mulberry32(31);
  LANDMARKS.tablets.forEach(([x, z], i) => {
    const ghost = i === 2;
    const rot = faceDir(lx - x, lz - z);
    const y = site.groundMin(x, z, 1.0) - 0.1;
    const { model, crystalAt } = tablet(30 + i, ghost);
    site.putAt(model, x, y, z, rot);
    site.block(x, z, 1.3);
    site.clearGrass(x, z, 1.9);
    for (let k = 0; k < 3; k++) {
      const a = rot + Math.PI * (0.55 + k * 0.45) + rand() * 0.3;
      const r = 1.9 + rand() * 0.6;
      const m = emptyModel();
      const s = 0.25 + rand() * 0.25;
      m.solid.push(rockBlob(i * 10 + k, [s * 1.3, s * 0.7, s], stoneFn(PAL.stone, 0.6, rand)));
      site.put(m, x + Math.sin(a) * r, z + Math.cos(a) * r, rand() * 3, 1, s, s * 0.2);
    }
    if (crystalAt) {
      const mesh = new THREE.Mesh(crystal(), ctx.materials.pulse);
      const base = crystalAt.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(x, y, z));
      mesh.position.copy(base);
      mesh.name = "ghost-crystal";
      ctx.add(mesh);
      ctx.animate((t) => {
        mesh.rotation.y = t * 0.8;
        mesh.position.y = base.y + Math.sin(t * 1.6) * 0.15;
      });
    }
  });
}

/** Old-mine cave entrance at the foot of the mesa's south cliff. */
export function buildCave(ctx: LandmarkContext): void {
  const hf = ctx.hf;
  const site = ctx.site("cave");
  const [mx, mz] = LANDMARKS.caveMouth;
  // Reason: the mouth point lies on the cliff face; walk south to the cliff foot so the arch stands on flat ground
  let z = mz;
  while (z < mz + 8 && hf.heightAt(mx, z) - hf.heightAt(mx, z + 2) > 0.5) z += 0.25;
  const cz = z + 0.2;
  let y0 = -Infinity;
  for (let x = -1.7; x <= 1.7; x += 0.425) for (let dz = -0.6; dz <= 0.5; dz += 0.275) y0 = Math.max(y0, hf.heightAt(mx + x, cz + dz));
  site.putAt(caveEntrance(ctx.atlas, 7, (lx, lz) => hf.heightAt(mx + lx, cz + lz) - y0), mx, y0, cz, 0, 1);
  for (const [lx, lz, r] of [[-2.6, 0.1, 1.0], [2.6, 0.1, 1.0], [-4.2, -1.0, 1.8], [4.2, -1.0, 1.8]] as const) site.block(mx + lx, cz + lz, r);
  // Mine cart on the rails, crates and a barrel by the entrance
  const cart: P2 = [mx, cz + 3.4];
  site.put(mineCart(5), cart[0], cart[1], 0.02, 1, 0.6, 0.2);
  site.block(cart[0], cart[1], 0.85);
  site.put(crate(41, 0.8), mx + 3.0, cz + 2.0, 0.4, 1, 0.45);
  site.put(crate(42, 0.65), mx + 3.05, cz + 2.0, 0.9, 1, 0.45, 0.78);
  site.put(barrel(43, 1.0), mx - 3.1, cz + 2.1, 0, 1, 0.45);
  site.block(mx + 3.0, cz + 2.0, 0.55);
  site.block(mx - 3.1, cz + 2.1, 0.5);
  site.clearGrass(mx, cz + 3, 4);
}

/** Twisted-tree archway at the entrance of the enchanted forest. */
export function buildForestGate(ctx: LandmarkContext): void {
  const site = ctx.site("forestGate");
  const [fx, fz] = LANDMARKS.forestGate;
  const [tx, tz] = LANDMARKS.forest;
  const rot = faceDir(tx - fx, tz - fz);
  site.put(forestArch(ctx.atlas, 3), fx, fz, rot, 1, 2.8, -0.05);
  for (const sx of [-1, 1]) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    site.block(fx + sx * 2.7 * c, fz - sx * 2.7 * s, 0.6);
  }
}
