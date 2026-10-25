/**
 * Gameplay set pieces of the volcano course: the stone-slab bridges over the
 * lava rivers, the checkpoint cairns with flags that light up when reached,
 * and the "Ziel" arch at the goal meadow.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { part } from "../../core/geo";
import { Model, emptyModel, rbox, pole, rope, rockBlob, stoneFn, cyl, ball, PAL, tint, withSway, addModel, placeAt } from "../../world/models/shapes";
import { bunting } from "../../world/models/props";
import { Bridge, Course, deckHeight } from "./course";

/** Stone-slab bridge with rope railings on wooden posts and pillars standing in the lava. */
export function bridgeModel(b: Bridge, seed: number): Model {
  const rand = mulberry32(seed);
  const m = emptyModel();
  const right = new THREE.Vector2(-b.dir.y, b.dir.x);
  const at = (u: number, side: number, lift = 0): [number, number, number] => [
    b.center.x + b.dir.x * u * b.halfLen + right.x * side,
    deckHeight(b, u) + lift,
    b.center.y + b.dir.y * u * b.halfLen + right.y * side,
  ];
  const yaw = Math.atan2(b.dir.x, b.dir.y);
  const n = Math.ceil((b.halfLen * 2) / 0.95);
  for (let i = 0; i < n; i++) {
    const u = -1 + (i + 0.5) * (2 / n);
    const [x, y, z] = at(u, 0);
    // Reason: tilt each slab to follow the arch so the deck reads as one gentle hump
    const slope = Math.atan2(deckHeight(b, u + 0.05) - deckHeight(b, u - 0.05), 0.1 * b.halfLen);
    const g = rbox(b.halfW * 2 + 0.45, 0.34, (b.halfLen * 2) / n - 0.06, tint(PAL.stoneLight, rand, 0.1), {}, 0.08);
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(-slope));
    g.applyMatrix4(placeAt(x, y - 0.17 + (rand() - 0.5) * 0.04, z, yaw + (rand() - 0.5) * 0.04));
    m.solid.push(g);
  }
  // Abutments and pillars
  for (const u of [-1.05, 1.05]) {
    const [x, y, z] = at(u, 0);
    const g = rockBlob(seed + u * 10, [b.halfW + 0.7, 1.2, 1.0], stoneFn(PAL.stone, 0, rand));
    g.applyMatrix4(placeAt(x, y - 1.0, z, yaw));
    m.solid.push(g);
  }
  for (const u of [-0.42, 0.42]) {
    const [x, y, z] = at(u, 0);
    m.solid.push(cyl(0.55, 0.75, 2.6, stoneFn("#8f8478", 0, rand), { pos: [x, y - 1.5, z] }, 9));
    m.glow.push(cyl(0.8, 0.85, 0.12, new THREE.Color(3.4, 1.0, 0.15), { pos: [x, y - 1.85, z] }, 12));
  }
  // Rope railings
  for (const side of [-1, 1]) {
    const posts: [number, number, number][] = [];
    const count = Math.max(3, Math.round(b.halfLen / 1.1));
    for (let i = 0; i <= count; i++) {
      const u = -0.95 + (i / count) * 1.9;
      const base = at(u, side * (b.halfW + 0.22), -0.05);
      const top: [number, number, number] = [base[0], base[1] + 0.95, base[2]];
      m.solid.push(pole(base, top, 0.075, tint(PAL.wood, rand), 7));
      m.solid.push(ball(0.1, PAL.woodDark, top, 1));
      posts.push(top);
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i];
      const c = posts[i + 1];
      m.solid.push(rope([a[0], a[1] - 0.06, a[2]], [c[0], c[1] - 0.06, c[2]], 0.14, 0.035));
    }
  }
  return m;
}

export interface CheckpointFlag {
  mesh: THREE.Mesh;
  /** Glowing ground ring, hidden until reached. */
  ring: THREE.Mesh;
  pos: THREE.Vector3;
  active: boolean;
}

const FLAG_IDLE: [string, string] = ["#9a9aa4", "#c9c9d1"];
const FLAG_ACTIVE: [string, string] = ["#ff4d2e", "#ffd23f"];

/** Stone cairn and flag pole (static model part) for a checkpoint at (x, y, z). */
export function cairnModel(x: number, y: number, z: number, seed: number): Model {
  const rand = mulberry32(seed + 5);
  const m = emptyModel();
  m.solid.push(cyl(1.5, 1.6, 0.16, stoneFn(PAL.stoneLight, 0, rand), { pos: [x, y + 0.04, z] }, 18));
  let h = y + 0.1;
  for (let i = 0; i < 3; i++) {
    const s = 0.55 - i * 0.13;
    const g = rockBlob(seed * 3 + i, [s, s * 0.7, s], stoneFn(i === 1 ? "#a39b90" : "#7d7470", 0, rand));
    g.translate(x + 1.05, h + s * 0.6, z - 0.2);
    m.solid.push(g);
    h += s * 1.1;
  }
  m.solid.push(pole([x + 1.05, y, z + 0.35], [x + 1.05, y + 3.1, z + 0.35], 0.07, PAL.woodDark, 7));
  m.solid.push(ball(0.12, PAL.gold, [x + 1.05, y + 3.15, z + 0.35], 1));
  return m;
}

/** Waving flag (own mesh so it can change colour when the checkpoint is reached). */
export function createFlag(x: number, y: number, z: number, cloth: THREE.Material): CheckpointFlag {
  const g = new THREE.PlaneGeometry(1.25, 0.8, 8, 4);
  g.translate(0.625, 0, 0);
  const geo = withSway(part(g, FLAG_IDLE[0], { pos: [x + 1.1, y + 2.65, z + 0.35] }), (p) => Math.max(0, p.x - x - 1.1) * 0.12);
  paintFlag(geo, FLAG_IDLE, x + 1.1);
  const mesh = new THREE.Mesh(geo, cloth);
  mesh.castShadow = true;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.55, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.4), transparent: true, opacity: 0.9 }),
  );
  ring.position.set(x, y + 0.14, z);
  ring.visible = false;
  return { mesh, ring, pos: new THREE.Vector3(x, y, z), active: false };
}

/** Two-tone striped flag colours (stripes along the flag length). */
function paintFlag(geo: THREE.BufferGeometry, colors: [string, string], x0: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  const a = new THREE.Color(colors[0]);
  const b = new THREE.Color(colors[1]);
  for (let i = 0; i < pos.count; i++) {
    const c = Math.floor(((pos.getX(i) - x0) / 1.25) * 3 + 0.001) % 2 === 0 ? a : b;
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

export function activateFlag(f: CheckpointFlag): void {
  f.active = true;
  paintFlag(f.mesh.geometry, FLAG_ACTIVE, f.pos.x + 1.1);
  f.ring.visible = true;
}

/** "Ziel" arch: stone pillars, a timber beam, bunting and lanterns across the trail. */
export function goalArch(course: Course, s: number, seed: number): { model: Model; lanterns: THREE.Vector3[]; signAt: THREE.Matrix4 } {
  const rand = mulberry32(seed);
  const m = emptyModel();
  const c = course.pointAt(s);
  const t = course.tangentAt(s, 5);
  const yaw = Math.atan2(t.x, t.y);
  const y = course.trailHeight(s);
  const half = 4.2;
  const local = emptyModel();
  for (const side of [-1, 1]) {
    let h = 0;
    for (let i = 0; i < 4; i++) {
      const w = 1.05 - i * 0.08;
      const hh = 0.85 + rand() * 0.15;
      local.solid.push(rbox(w, hh, w, tint(PAL.stoneLight, rand, 0.12), { pos: [side * half, h + hh / 2, 0], rot: [0, (rand() - 0.5) * 0.3, 0] }, 0.12));
      h += hh - 0.03;
    }
    local.solid.push(rbox(1.2, 0.25, 1.2, PAL.stone, { pos: [side * half, h + 0.1, 0] }, 0.06));
    local.glow.push(ball(0.22, new THREE.Color(3.2, 2.2, 0.8), [side * half, h + 0.45, 0], 1));
  }
  local.solid.push(rbox(half * 2 + 1.6, 0.45, 0.55, tint(PAL.wood, rand), { pos: [0, 3.75, 0] }, 0.1));
  local.solid.push(rbox(half * 2 + 1.2, 0.18, 0.62, PAL.woodDark, { pos: [0, 4.05, 0] }, 0.06));
  // Sign board standing on the beam, readable from far down the trail
  local.solid.push(rbox(3.9, 1.15, 0.2, PAL.woodDark, { pos: [0, 4.75, 0] }, 0.06));
  local.solid.push(rbox(3.6, 0.9, 0.24, new THREE.Color("#e8b56c"), { pos: [0, 4.75, 0] }, 0.05));
  addModel(local, bunting([-half, 3.4, 0.3], [half, 3.4, 0.3], 0.7, seed));
  addModel(m, local, placeAt(c.x, y, c.y, yaw));
  const lanterns = [-1, 1].map((side) => new THREE.Vector3(side * half, 4.0, 0).applyMatrix4(placeAt(c.x, y, c.y, yaw)));
  // Reason: the sign hangs on the side Tadeo walks up to, so it faces back along the trail
  const signAt = placeAt(c.x, y, c.y, yaw).multiply(new THREE.Matrix4().makeTranslation(0, 4.75, -0.14)).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  return { model: m, lanterns, signAt };
}
