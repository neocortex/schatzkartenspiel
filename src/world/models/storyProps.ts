/**
 * Big props the story puts on the island and takes away again: Tadeo's boat
 * wrecked on the sand (wreck.ts), the thorn hedge across the forest gate and the
 * giant boulder on the mountain trail. The hedge and the boulder are stand-alone
 * groups: they carry their own materials, list the colliders that stand under
 * them, and play an exit when they leave.
 */

import * as THREE from "three";
import { part, displace, merge, softNormals, gradient, ColorFn } from "../../core/geo";
import { mulberry32, smoothstep } from "../../core/noise";
import { patchXray } from "../xray";
import { Circle } from "../Colliders";
import { V3, ball, spike, tint } from "./shapes";

export { wreckedBoat } from "./wreck";

/** A big prop that stands on the island until the story removes it. */
export interface StoryProp {
  group: THREE.Group;
  /** Collider circles in the group's space. Each one has rock or thorns standing on it. */
  blockers: readonly Circle[];
  /** Plays the exit and resolves when the prop is gone (hidden, and whole again if it is ever shown again). */
  remove(): Promise<void>;
  /** Drives the exit; nothing happens while the prop is just standing. */
  update(dt: number): void;
}

/**
 * Stand a prop at (x, z): its group sits on the ground there and every vertex is
 * lifted by the terrain under it, so long props follow dips and rises instead of floating.
 */
export function standProp(prop: StoryProp, x: number, z: number, rotY: number, ground: (x: number, z: number) => number): void {
  const y0 = ground(x, z);
  prop.group.position.set(x, y0, z);
  prop.group.rotation.y = rotY;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  prop.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i) + o.position.x;
      const lz = pos.getZ(i) + o.position.z;
      pos.setY(i, pos.getY(i) + ground(x + lx * c + lz * s, z - lx * s + lz * c) - y0);
    }
  });
}

// ---------------------------------------------------------------------------
// Exits
// ---------------------------------------------------------------------------

/** Build a StoryProp whose exit is `frame(k)` for k from 0 to 1 over `seconds`; `rest` puts everything back afterwards. */
function storyProp(group: THREE.Group, blockers: Circle[], seconds: number, frame: (k: number) => void, rest: () => void): StoryProp {
  let exit: { k: number; done: () => void; promise: Promise<void> } | null = null;
  return {
    group,
    blockers,
    remove() {
      if (exit) return exit.promise;
      if (!group.visible) return Promise.resolve();
      let done = () => {};
      const promise = new Promise<void>((r) => (done = r));
      exit = { k: 0, done, promise };
      return promise;
    },
    update(dt) {
      if (!exit) return;
      exit.k = Math.min(exit.k + dt / seconds, 1);
      frame(exit.k);
      if (exit.k < 1) return;
      group.visible = false;
      rest();
      const finished = exit;
      exit = null;
      finished.done();
    },
  };
}

/** Lit vertex-coloured material that dithers open around Tadeo when a prop stands between him and the camera. */
function propMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = patchXray;
  return m;
}

// ---------------------------------------------------------------------------
// The thorn hedge
// ---------------------------------------------------------------------------

const HEDGE_REACH = 9.2;
/** Height of the hedge along its length: tall across the arch, wild and falling away at the ends. */
const hedgeTop = (x: number): number => 1.1 + 3.5 * Math.exp(-((x / 5.4) ** 4));
const THORN_BASE = new THREE.Color("#5b2230");
const THORN_TIP = new THREE.Color("#f6e2c0");

/** A thorn: dark at the base, bone-pale at the point. */
function thorn(base: THREE.Vector3, dir: THREE.Vector3, length: number, width: number): THREE.BufferGeometry {
  return spike(base, dir, length, width, (p) => THORN_BASE.clone().lerp(THORN_TIP, THREE.MathUtils.clamp(p.y / length, 0, 1) ** 1.6), 5);
}

/** A flat pointed leaf lying on a surface that faces `facing`, turned any way around that. */
function leaf(at: THREE.Vector3, facing: THREE.Vector3, size: number, color: THREE.ColorRepresentation, spin: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(size, 0);
  g.scale(1.6, 0.28, 0.85);
  g.rotateY(spin);
  const painted = part(g, color);
  painted.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), facing.clone().normalize()));
  painted.translate(at.x, at.y, at.z);
  return painted;
}

const HEDGE_LEAVES = ["#2f7d57", "#3f9a58", "#4c9f50", "#256b60", "#3a8f6a"];

/**
 * A tall tangle of thorny brambles across the forest arch (x runs along the
 * hedge, z through it; y = 0 is the ground at the gate): a deep green leafy core,
 * thick woody vines looping over both faces and across the crown, long pale thorns
 * and a few glowing magic rosebuds, so it looks wild and impassable but still
 * belongs in a fairy tale.
 */
export function thornHedge(): StoryProp {
  const rand = mulberry32(71);
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const blockers: Circle[] = [];

  // Leafy core: nothing can be seen through the hedge
  for (let x = -HEDGE_REACH; x <= HEDGE_REACH; x += 1.05) {
    const top = hedgeTop(x);
    const g = new THREE.IcosahedronGeometry(1, 2);
    const c = new THREE.Vector3(x + (rand() - 0.5) * 0.5, top * 0.45, (rand() - 0.5) * 0.25);
    // Reason: slim enough for the vines and the coat of leaves to lie on it, as deep as the colliders under it
    g.scale(1.25, top * 0.6, 1.02);
    g.translate(c.x, c.y, c.z);
    displace(g, 0.14, 1.5, rand() * 50);
    softNormals(g, c, 0.45, 1.1);
    solid.push(part(g, gradient("#16302f", "#2f6f55", -0.4, top + 0.2, 0.3)));
  }
  for (let x = -HEDGE_REACH + 0.5; x <= HEDGE_REACH - 0.5; x += 1.25) {
    blockers.push({ x, z: 0, r: 0.72 + 0.5 * THREE.MathUtils.clamp(hedgeTop(x) / 4.6, 0, 1) });
  }

  // A coat of leaves over the core, thickest where the light falls on them
  for (let i = 0; i < 760; i++) {
    const x = (rand() * 2 - 1) * HEDGE_REACH;
    const a = rand() * Math.PI;
    const top = hedgeTop(x);
    const out = 1 + (rand() - 0.5) * 0.3;
    const at = new THREE.Vector3(x, Math.sin(a) * top * 0.98 * out - 0.1, Math.cos(a) * 1.1 * out);
    const facing = new THREE.Vector3((rand() - 0.5) * 0.9, Math.sin(a) + 0.2, Math.cos(a));
    solid.push(leaf(at, facing, 0.16 + rand() * 0.18, tint(HEDGE_LEAVES[Math.floor(rand() * HEDGE_LEAVES.length)], rand, 0.15), rand() * Math.PI * 2));
  }

  // Bramble vines: up from the roots, looping over the face of the hedge and back in
  const bark = gradient("#3f2a44", "#8a5f7a", -0.5, 4.6, 0.25);
  const vines: THREE.CatmullRomCurve3[] = [];
  for (let i = 0; i < 74; i++) {
    const x0 = -HEDGE_REACH + (i / 73) * HEDGE_REACH * 2 + (rand() - 0.5) * 1.2;
    const side = i % 2 ? 1 : -1;
    const top = hedgeTop(x0);
    const reach = 0.55 + rand() * 0.55;
    const pts: THREE.Vector3[] = [new THREE.Vector3(x0, -0.5, side * (0.9 + rand() * 0.7))];
    const n = 5 + Math.floor(rand() * 3);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const y = top * reach * Math.sin(t * Math.PI * 0.58) * 1.28;
      // Reason: the vine bulges away from the core at mid height and curls back at its tip
      const z = side * (0.75 + 0.75 * Math.sin(t * Math.PI) + (rand() - 0.5) * 0.4);
      pts.push(new THREE.Vector3(x0 + (rand() - 0.5) * 1.3 + (k === n ? (rand() - 0.5) * 1.5 : 0), y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    vines.push(curve);
    solid.push(part(new THREE.TubeGeometry(curve, 16, 0.075 + rand() * 0.06, 5, false), bark));
  }
  // Thick stems arching right across the crown: the follow camera looks down on the hedge from above
  for (let i = 0; i < 20; i++) {
    const x0 = (rand() * 2 - 1) * (HEDGE_REACH - 1);
    const lean = (rand() - 0.5) * 3.4;
    const top = hedgeTop(x0);
    const pts = [
      new THREE.Vector3(x0 - lean, top * 0.25, 1.35),
      new THREE.Vector3(x0 - lean * 0.45, top * 0.85, 1.05 + rand() * 0.3),
      new THREE.Vector3(x0, top + 0.28 + rand() * 0.3, (rand() - 0.5) * 0.5),
      new THREE.Vector3(x0 + lean * 0.45, top * 0.85, -1.05 - rand() * 0.3),
      new THREE.Vector3(x0 + lean, top * 0.25, -1.35),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    vines.push(curve);
    solid.push(part(new THREE.TubeGeometry(curve, 22, 0.1 + rand() * 0.05, 6, false), bark));
  }
  // Whips reaching out of the top and curling over: they give the hedge its wild outline
  for (let i = 0; i < 18; i++) {
    const x0 = (rand() * 2 - 1) * (HEDGE_REACH - 0.5);
    const side = i % 2 ? 1 : -1;
    const top = hedgeTop(x0);
    const rise = 0.9 + rand() * 1.1;
    const pts = [
      new THREE.Vector3(x0, top - 0.5, side * 0.5),
      new THREE.Vector3(x0 + (rand() - 0.5) * 0.5, top + rise * 0.55, side * (0.6 + rand() * 0.3)),
      new THREE.Vector3(x0 + (rand() - 0.5) * 0.9, top + rise, side * (1 + rand() * 0.4)),
      new THREE.Vector3(x0 + (rand() - 0.5) * 1.3, top + rise * 0.8, side * (1.6 + rand() * 0.4)),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    vines.push(curve);
    solid.push(part(new THREE.TubeGeometry(curve, 14, 0.055 + rand() * 0.03, 5, false), bark));
  }
  // Reason: two thick trunks of bramble climb the arch's own posts so the hedge and the arch read as one thing
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const pts: THREE.Vector3[] = [];
      for (let t = 0; t <= 1.0001; t += 0.14) {
        const a = t * 11 + (k * Math.PI * 2) / 3;
        pts.push(new THREE.Vector3(sx * (2.75 - t * 0.6) + Math.cos(a) * 0.42, -0.3 + t * 4.7, Math.sin(a) * 0.42));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      vines.push(curve);
      solid.push(part(new THREE.TubeGeometry(curve, 28, 0.085, 5, false), bark));
    }
  }

  // Thorns along every vine, leaning outwards and a little up so they catch the light
  const d = new THREE.Vector3();
  for (const curve of vines) {
    const count = Math.round(curve.getLength() * 2.6);
    for (let i = 0; i < count; i++) {
      const t = 0.08 + rand() * 0.9;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      d.set(rand() - 0.5, rand() * 0.5, (p.z >= 0 ? 1 : -1) * (0.45 + rand())).normalize();
      d.addScaledVector(tan, -d.dot(tan)).normalize();
      solid.push(thorn(p, d, 0.26 + rand() * 0.3, 0.055 + rand() * 0.03));
    }
    // Leaves between the thorns, dark teal and moss
    const leaves = Math.round(curve.getLength() * 1.3);
    for (let i = 0; i < leaves; i++) {
      const p = curve.getPoint(rand()).add(d.set((rand() - 0.5) * 0.3, (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.3));
      const facing = new THREE.Vector3(rand() - 0.5, 0.6, (p.z >= 0 ? 1 : -1) * (0.2 + rand()));
      solid.push(leaf(p, facing, 0.14 + rand() * 0.12, tint(HEDGE_LEAVES[Math.floor(rand() * HEDGE_LEAVES.length)], rand, 0.2), rand() * Math.PI * 2));
    }
  }
  // Great thorns jutting out at a child's height: the part that says "not this way"
  for (let i = 0; i < 28; i++) {
    const x = (rand() - 0.5) * 13;
    const side = i % 2 ? 1 : -1;
    const y = 0.5 + rand() * 0.8 * hedgeTop(x);
    const base = new THREE.Vector3(x, y, side * (0.95 + rand() * 0.4));
    solid.push(thorn(base, new THREE.Vector3((rand() - 0.5) * 0.7, (rand() - 0.2) * 0.55, side), 0.75 + rand() * 0.55, 0.11 + rand() * 0.06));
  }
  // Rosebuds, pink petals round a glowing heart in the arch's magic colours
  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * 15;
    const side = i % 2 ? 1 : -1;
    const y = 0.7 + rand() * (hedgeTop(x) - 0.5);
    const c: V3 = [x, y, side * (1.1 + rand() * 0.55)];
    const s = 0.17 + rand() * 0.1;
    const petal = i % 3 === 0 ? "#b0408c" : "#c4346a";
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      solid.push(ball(s, petal, [c[0] + Math.cos(a) * s * 0.75, c[1] + Math.sin(a) * s * 0.75, c[2]], 0, [1, 1, 0.5]));
    }
    glow.push(ball(s * 0.55, i % 3 === 0 ? new THREE.Color(1.5, 0.6, 1.7) : new THREE.Color(1.8, 0.6, 1.1), [c[0], c[1], c[2] + side * s * 0.25], 1));
  }
  // Reason: more rosebuds on the crown, the part of the hedge the follow camera sees best
  for (let i = 0; i < 14; i++) {
    const x = (rand() - 0.5) * 14;
    const c: V3 = [x, hedgeTop(x) + 0.1, (rand() - 0.5) * 1.5];
    const s = 0.18 + rand() * 0.1;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      solid.push(ball(s, i % 2 ? "#b0408c" : "#c4346a", [c[0] + Math.cos(a) * s * 0.75, c[1], c[2] + Math.sin(a) * s * 0.75], 0, [1, 0.5, 1]));
    }
    glow.push(ball(s * 0.55, i % 2 ? new THREE.Color(1.5, 0.6, 1.7) : new THREE.Color(1.8, 0.6, 1.1), [c[0], c[1] + s * 0.25, c[2]], 1));
  }

  const group = new THREE.Group();
  group.name = "story:hedge";
  const body = new THREE.Group();
  group.add(body);
  const thorns = new THREE.Mesh(merge(solid), propMaterial());
  thorns.castShadow = true;
  thorns.receiveShadow = true;
  body.add(thorns, new THREE.Mesh(merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // Exit: a shudder, then the whole tangle shrinks back into the ground
  return storyProp(
    group,
    blockers,
    2,
    (k) => {
      const shrink = smoothstep(0.08, 1, k);
      body.scale.set(1 - shrink * 0.35, Math.max(1 - shrink, 0.001), 1 - shrink * 0.55);
      body.position.x = Math.sin(k * 60) * 0.05 * (1 - shrink);
    },
    () => {
      body.scale.set(1, 1, 1);
      body.position.x = 0;
    },
  );
}

// ---------------------------------------------------------------------------
// The boulder
// ---------------------------------------------------------------------------

/** Faceted rock in the island's low-poly style: an icosphere planed down by random cuts, then roughened. */
function chiselled(seed: number, size: V3, cuts: number, detail: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const planes: { n: THREE.Vector3; d: number }[] = [];
  for (let i = 0; i < cuts; i++) {
    const n = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.9, rand() - 0.5).normalize();
    planes.push({ n, d: 0.64 + rand() * 0.24 });
  }
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    for (const { n, d } of planes) {
      const over = p.dot(n) - d;
      if (over > 0) p.addScaledVector(n, -over);
    }
    pos.setXYZ(i, p.x * size[0], p.y * size[1], p.z * size[2]);
  }
  displace(g, Math.min(...size) * 0.12, 1.5 / Math.max(...size), seed * 3.3);
  g.computeVertexNormals();
  return g;
}

/**
 * Grey-brown stone from dark at y0 to warm at y1, with a moss cap that creeps down over the top.
 * Reason: tones hang together across neighbouring faces; a colour per face looks like a patchwork, not one rock.
 */
function rockColor(y0: number, y1: number): ColorFn {
  const low = new THREE.Color("#6a6158");
  const mid = new THREE.Color("#8f867a");
  const high = new THREE.Color("#a89e8f");
  const moss = new THREE.Color("#5f9138");
  const out = new THREE.Color();
  return (p, n) => {
    const h = THREE.MathUtils.clamp((p.y - y0) / (y1 - y0), 0, 1);
    const tone = THREE.MathUtils.euclideanModulo(Math.sin(n.x * 127.1 + n.y * 311.7 + n.z * 74.7) * 43758.5, 1);
    out.copy(low).lerp(mid, smoothstep(0, 0.5, h)).lerp(high, smoothstep(0.5, 1, h));
    out.multiplyScalar(0.96 + tone * 0.08);
    if (n.y + 0.22 * Math.sin(n.x * 7 + 1.3) * Math.cos(n.z * 6) > 0.56) out.lerp(moss, 0.85);
    if (n.y < -0.25) out.multiplyScalar(0.7);
    return out;
  };
}

/** Where each rock of the rockfall stands, in the group's space, and how big it is. */
const ROCKS: { x: number; z: number; size: V3; y: number; cuts: number; collider: number; flight: V3 }[] = [
  // The giant, right on the trail, a good part of it sunk into the ground
  { x: 0, z: 0, size: [4.2, 3.9, 4], y: 1.1, cuts: 14, collider: 3.5, flight: [-26, 3, -2] },
  // Its smaller neighbours close the gaps to the cliff and to the rock at the foot of the steps
  { x: -2.9, z: 0.75, size: [1.9, 1.8, 1.8], y: 0.5, cuts: 8, collider: 1.4, flight: [-12, 1, 6] },
  { x: 2.55, z: -1.85, size: [2.3, 2.3, 2.2], y: 0.7, cuts: 9, collider: 1.65, flight: [12, 1, -3] },
  { x: 3.1, z: 1.0, size: [1.5, 1.3, 1.4], y: 0.35, cuts: 7, collider: 1.05, flight: [9, 1, 7] },
  { x: -1.75, z: 2.85, size: [1.2, 1.05, 1.15], y: 0.25, cuts: 6, collider: 0.75, flight: [-6, 1, 9] },
];

/**
 * The giant boulder on the mountain trail with its rockfall around it. Every rock
 * stands on its own collider. Exit: the giant is heaved up and thrown off over
 * the cliff towards the river, the small ones tumble away after it.
 */
export function mountainBoulder(): StoryProp {
  const group = new THREE.Group();
  group.name = "story:boulder";
  const material = propMaterial();
  const parts: { mesh: THREE.Mesh; home: THREE.Vector3; flight: V3; spin: V3; delay: number }[] = [];
  const blockers: Circle[] = [];
  const rand = mulberry32(81);
  ROCKS.forEach((r, i) => {
    const geos: THREE.BufferGeometry[] = [];
    const rock = chiselled(11 + i * 7, r.size, r.cuts, i === 0 ? 4 : 2);
    geos.push(part(rock, rockColor(-r.size[1], r.size[1])));
    // Rubble at the rock's foot, half sunk into the ground
    const pebbles = i === 0 ? 14 : 5;
    for (let k = 0; k < pebbles; k++) {
      const a = rand() * Math.PI * 2;
      const dist = r.collider * (1 + rand() * 0.34);
      const s = 0.14 + rand() * (i === 0 ? 0.32 : 0.2);
      const c: V3 = [Math.cos(a) * dist, s * 0.25 - r.y, Math.sin(a) * dist];
      const pebble = chiselled(200 + i * 30 + k, [s * 1.2, s, s], 4, 1);
      pebble.translate(c[0], c[1], c[2]);
      geos.push(part(pebble, rockColor(c[1] - s, c[1] + s)));
    }
    const mesh = new THREE.Mesh(merge(geos), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(r.x, r.y, r.z);
    group.add(mesh);
    blockers.push({ x: r.x, z: r.z, r: r.collider });
    parts.push({ mesh, home: mesh.position.clone(), flight: r.flight, spin: [rand() * 3 - 1.5, rand() * 3 - 1.5, rand() * 3 - 1.5], delay: i === 0 ? 0 : 0.12 + rand() * 0.15 });
  });

  return storyProp(
    group,
    blockers,
    2.2,
    (k) => {
      for (const { mesh, home, flight, spin, delay } of parts) {
        const t = THREE.MathUtils.clamp((k - delay) / (1 - delay), 0, 1);
        // Reason: first a heave straight up, then a long arc; the rock is gone before it would land
        const lift = smoothstep(0, 0.3, t);
        const fly = smoothstep(0.22, 1, t);
        mesh.position.set(home.x + flight[0] * fly, home.y + 4.5 * lift + 8 * Math.sin(fly * Math.PI) - 7 * fly * fly, home.z + flight[2] * fly);
        mesh.rotation.set(spin[0] * fly * 3, spin[1] * fly * 3, spin[2] * fly * 3);
        mesh.scale.setScalar(1 - smoothstep(0.72, 1, t));
      }
    },
    () => {
      for (const { mesh, home } of parts) {
        mesh.position.copy(home);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.setScalar(1);
      }
    },
  );
}
