/**
 * Gameplay set pieces of the volcano course: the stone-slab bridges over the
 * lava rivers (whole, or broken into two charred stubs), the hop rocks between
 * the stubs, and the checkpoint cairns with flags that light up when reached.
 */

import * as THREE from "three";
import { ColorFn, facet, part } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Model, emptyModel, beam, rbox, pole, rope, rockBlob, spike, stoneFn, cyl, ball, PAL, tint, withSway, placeAt } from "../../world/models/shapes";
import { Bridge, HopRock, deckHeight } from "./course";

/** Burnt black at `tip`, fading back to scorched wood over a little more than a metre. */
function charred(tip: THREE.Vector3): ColorFn {
  const black = new THREE.Color("#0f0b0a");
  const wood = new THREE.Color("#5e3a20");
  const out = new THREE.Color();
  const p3 = new THREE.Vector3();
  return (p) => out.copy(black).lerp(wood, THREE.MathUtils.smoothstep(p3.copy(p).distanceTo(tip), 0.15, 1.4));
}

/** Length of a broken stub's end that is charred wood instead of stone. */
const CHARRED_LEN = 1.05;

/**
 * Stone-slab bridge with rope railings on wooden posts and pillars standing in the lava. On a broken bridge the same
 * parts stop at the gap, and the stub ends in burnt planks, so anyone can see what took the rest of it.
 */
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
  // Stretches of stone deck, in metres from the centre
  const runs: [number, number][] = b.gap
    ? [
        [-b.halfLen, b.gap[0] - CHARRED_LEN],
        [b.gap[1] + CHARRED_LEN, b.halfLen],
      ]
    : [[-b.halfLen, b.halfLen]];
  for (const [from, to] of runs) {
    const n = Math.ceil((to - from) / 0.95);
    for (let i = 0; i < n; i++) {
      const u = (from + (i + 0.5) * ((to - from) / n)) / b.halfLen;
      const [x, y, z] = at(u, 0);
      // Reason: tilt each slab to follow the arch so the deck reads as one gentle hump
      const slope = Math.atan2(deckHeight(b, u + 0.05) - deckHeight(b, u - 0.05), 0.1 * b.halfLen);
      const g = rbox(b.halfW * 2 + 0.45, 0.34, (to - from) / n - 0.06, tint(PAL.stoneLight, rand, 0.1), {}, 0.08);
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(-slope));
      g.applyMatrix4(placeAt(x, y - 0.17 + (rand() - 0.5) * 0.04, z, yaw + (rand() - 0.5) * 0.04));
      m.solid.push(g);
    }
  }
  // Abutments and pillars
  for (const u of [-1.05, 1.05]) {
    const [x, y, z] = at(u, 0);
    const g = rockBlob(seed + u * 10, [b.halfW + 0.7, 1.2, 1.0], stoneFn(PAL.stone, 0, rand));
    g.applyMatrix4(placeAt(x, y - 1.0, z, yaw));
    m.solid.push(g);
  }
  if (b.gap) {
    // A stub only needs one leg, under its stone part
    for (const stone of [b.gap[0] - CHARRED_LEN - 0.3, b.gap[1] + CHARRED_LEN + 0.3]) {
      const [x, y, z] = at(stone / b.halfLen, 0);
      m.solid.push(cyl(0.55, 0.75, 2.6, stoneFn("#8f8478", 0, rand), { pos: [x, y - 1.5, z] }, 9));
    }
    snappedEnd(m, b, b.gap[0], 1, rand, at);
    snappedEnd(m, b, b.gap[1], -1, rand, at);
  } else {
    for (const u of [-0.42, 0.42]) {
      const [x, y, z] = at(u, 0);
      m.solid.push(cyl(0.55, 0.75, 2.6, stoneFn("#8f8478", 0, rand), { pos: [x, y - 1.5, z] }, 9));
      m.glow.push(cyl(0.8, 0.85, 0.12, new THREE.Color(3.4, 1.0, 0.15), { pos: [x, y - 1.85, z] }, 12));
    }
  }
  // Rope railings, in metres from the centre; a broken bridge has one rail on each stub
  const margin = b.halfLen * 0.05;
  const rails: [number, number][] = b.gap
    ? [
        [-b.halfLen + margin, b.gap[0] - 0.2],
        [b.halfLen - margin, b.gap[1] + 0.2],
      ]
    : [[-b.halfLen + margin, b.halfLen - margin]];
  for (const side of [-1, 1]) {
    for (const [from, to] of rails) {
      const posts: [number, number, number][] = [];
      const count = b.gap ? Math.max(2, Math.round(Math.abs(to - from) / 0.9)) : Math.max(3, Math.round(b.halfLen / 1.1));
      for (let i = 0; i <= count; i++) {
        const u = (from + (i / count) * (to - from)) / b.halfLen;
        const base = at(u, side * (b.halfW + 0.22), -0.05);
        const burnt = b.gap && i === count;
        // Reason: the last post stands at the break, burnt short and leaning out over it
        const top: [number, number, number] = burnt
          ? [base[0] + b.dir.x * Math.sign(to - from) * 0.16, base[1] + 0.68, base[2] + b.dir.y * Math.sign(to - from) * 0.16]
          : [base[0], base[1] + 0.95, base[2]];
        m.solid.push(pole(base, top, 0.075, burnt ? "#1c1411" : tint(PAL.wood, rand), 7));
        if (!burnt) m.solid.push(ball(0.1, PAL.woodDark, top, 1));
        posts.push(top);
      }
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i];
        const c = posts[i + 1];
        m.solid.push(rope([a[0], a[1] - 0.06, a[2]], [c[0], c[1] - 0.06, c[2]], 0.14, 0.035));
      }
      if (b.gap) {
        // The rope snapped with the bridge and hangs burnt from the last post
        const end = posts[posts.length - 1];
        const hang: [number, number, number] = [end[0] + b.dir.x * Math.sign(to - from) * 0.28, end[1] - 1.05 - rand() * 0.35, end[2] + b.dir.y * Math.sign(to - from) * 0.28];
        m.solid.push(rope([end[0], end[1] - 0.06, end[2]], hang, 0.04, 0.035, "#3f3226", 6));
      }
    }
  }
  return m;
}

/**
 * The end of a broken stub: burnt planks laid over beams, and the beams snapped off and drooping towards the lava with
 * embers still glowing in their tips. `end` is where the walkable deck stops, `toGap` the direction (+1/-1) along the deck.
 */
function snappedEnd(
  m: Model,
  b: Bridge,
  end: number,
  toGap: number,
  rand: () => number,
  at: (u: number, side: number, lift?: number) => [number, number, number],
): void {
  const yaw = Math.atan2(b.dir.x, b.dir.y);
  const ember = new THREE.Color(4.2, 1.5, 0.25);
  const planks = Math.round(CHARRED_LEN / 0.27);
  for (let i = 0; i < planks; i++) {
    const metres = end - toGap * ((i + 0.5) * 0.27);
    const u = metres / b.halfLen;
    // Reason: the nearer the break, the more it burnt away; both ends of a plank are eaten unevenly
    const eaten = (1 - i / planks) * 0.65;
    const w = b.halfW * 2 + 0.3 - eaten * (0.3 + rand() * 0.9);
    const [x, y, z] = at(u, (rand() - 0.5) * eaten * 0.6);
    const shade = new THREE.Color("#2a1d16").lerp(new THREE.Color("#5a3a24"), (i / planks) * rand());
    const slope = Math.atan2(deckHeight(b, u + 0.05) - deckHeight(b, u - 0.05), 0.1 * b.halfLen);
    const g = rbox(w, 0.12, 0.24, shade, {}, 0.03);
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(-slope + (rand() - 0.5) * 0.05));
    g.applyMatrix4(placeAt(x, y - 0.07, z, yaw + (rand() - 0.5) * 0.09));
    m.solid.push(g);
  }
  // Beams under the planks; past the break they snap off and hang down
  for (const side of [-1.25, -0.72, -0.15, 0.48, 1.05]) {
    const from = at((end - toGap * (CHARRED_LEN + 0.15)) / b.halfLen, side, -0.2);
    const edge = at(end / b.halfLen, side, -0.2);
    const reach = 0.2 + rand() * 0.55;
    const drop = 0.45 + rand() * 0.75;
    const tip = new THREE.Vector3(edge[0] + b.dir.x * toGap * reach, edge[1] - drop, edge[2] + b.dir.y * toGap * reach);
    m.solid.push(beam(from, edge, 0.17, "#2a1b13", 0.13));
    m.solid.push(beam(edge, [tip.x, tip.y, tip.z], 0.15, charred(tip), 0.12));
    const dir = tip.clone().sub(new THREE.Vector3(...edge)).normalize();
    for (let k = 0; k < 3; k++) {
      const splay = new THREE.Vector3((rand() - 0.5) * 0.7, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.7);
      m.solid.push(spike(tip, dir.clone().add(splay), 0.22 + rand() * 0.2, 0.05, "#120d0b", 4));
    }
    m.pulse.push(ball(0.06 + rand() * 0.03, ember, [tip.x, tip.y, tip.z], 0));
  }
}

/**
 * A hop rock: basalt columns packed side by side, rising from the lava to a flat top that carries the trail's sandy
 * colour, so at a glance it reads as the next piece of path.
 */
export function hopRockModel(rock: HopRock, lavaY: number, seed: number): Model {
  const rand = mulberry32(seed);
  const m = emptyModel();
  const side = new THREE.Color("#3b3237");
  const sideLit = new THREE.Color("#7a3218");
  const topLight = new THREE.Color("#e2c9a0");
  const topDark = new THREE.Color("#b8966d");
  const colR = rock.r * 0.385;
  const ring = rock.r * 0.667;
  const spots: [number, number][] = [[0, 0]];
  for (let i = 0; i < 6; i++) spots.push([Math.cos(Math.PI / 6 + (i * Math.PI) / 3) * ring, Math.sin(Math.PI / 6 + (i * Math.PI) / 3) * ring]);
  spots.forEach(([dx, dz], i) => {
    const x = rock.x + dx;
    const z = rock.z + dz;
    const lower = i === 0 ? 0 : rand() * 0.05;
    const top = rock.y - lower;
    const bottom = lavaY - 0.5;
    const h = top - bottom;
    const out = new THREE.Color();
    const tone = 0.92 + rand() * 0.16;
    // Reason: the column's flat top is painted like the trail; its sides go from basalt to a lava-lit red at the foot
    const col: ColorFn = (p, n) => {
      if (n.y > 0.7) return out.copy(topDark).lerp(topLight, 1 - Math.hypot(p.x - x, p.z - z) / colR).multiplyScalar(tone);
      return out.copy(sideLit).lerp(side, THREE.MathUtils.smoothstep(p.y, lavaY, lavaY + 0.9)).multiplyScalar(tone);
    };
    m.solid.push(facet(part(new THREE.CylinderGeometry(colR, colR * 1.04, h, 6), col, { pos: [x, bottom + h / 2, z] })));
  });
  // White-hot rim where the rock meets the lava
  m.glow.push(cyl(rock.r * 1.16, rock.r * 1.22, 0.1, new THREE.Color(3.6, 1.2, 0.18), { pos: [rock.x, lavaY + 0.02, rock.z] }, 18));
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
