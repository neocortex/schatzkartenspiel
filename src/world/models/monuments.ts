/**
 * Mystical and natural set pieces: the ancient rune tablets by the lake (and
 * the special ghost tablet), the rocky mine entrance of the cave, the twisted
 * tree archway of the enchanted forest, and the golden summit shrine.
 * Models face +z with the origin on the ground.
 */

import * as THREE from "three";
import { part, merge, displace, softNormals, gradient } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Model, PAL, V3, emptyModel, addModel, placeAt, tint, rbox, box, cyl, ball, beam, rope, rockBlob, stoneFn, flip } from "./shapes";
import { torch, hangingLantern } from "./props";
import { SignAtlas } from "./signs";

/** Arch outline (flat bottom, round top) as a THREE.Shape. */
function archShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}

/** One random rune glyph (2–3 glowing strokes) centred at (x, y) on the z = 0 plane. */
function rune(rand: () => number, x: number, y: number, c: number, color: THREE.Color): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const t = 0.045;
  const strokes = 2 + Math.floor(rand() * 2);
  const used = new Set<number>();
  for (let i = 0; i < strokes; i++) {
    let k = Math.floor(rand() * 8);
    while (used.has(k)) k = (k + 1) % 8;
    used.add(k);
    const h = c / 2;
    if (k === 0) out.push(box(t, c, 0.03, color, { pos: [x, y, 0] }));
    if (k === 1) out.push(box(c * 0.8, t, 0.03, color, { pos: [x, y + h * 0.9, 0] }));
    if (k === 2) out.push(beam([x - h * 0.7, y - h, 0], [x + h * 0.7, y + h, 0], t, color, 0.03));
    if (k === 3) out.push(beam([x - h * 0.7, y + h, 0], [x + h * 0.7, y - h, 0], t, color, 0.03));
    if (k === 4) out.push(part(new THREE.TorusGeometry(h * 0.45, t / 2, 4, 12), color, { pos: [x, y, 0] }));
    if (k === 5) {
      out.push(beam([x - h * 0.7, y - h * 0.3, 0], [x, y + h * 0.5, 0], t, color, 0.03));
      out.push(beam([x, y + h * 0.5, 0], [x + h * 0.7, y - h * 0.3, 0], t, color, 0.03));
    }
    if (k === 6) out.push(box(c * 0.7, t, 0.03, color, { pos: [x, y, 0] }));
    if (k === 7) out.push(box(t * 1.6, t * 1.6, 0.03, color, { pos: [x + h * 0.5, y - h * 0.6, 0] }));
  }
  return out;
}

/**
 * Ancient stone tablet on a stepped base with glowing carved runes on both
 * faces. The ghost tablet is taller and paler, with violet runes and a cradle
 * for the floating crystal (returned as `crystalAt`).
 */
export function tablet(seed: number, ghost: boolean): { model: Model; crystalAt: THREE.Vector3 | null } {
  const rand = mulberry32(seed + 73);
  const m = emptyModel();
  const w = ghost ? 1.95 : 1.75;
  const h = ghost ? 3.7 : 2.8;
  const d = 0.38;
  const stone = new THREE.Color(ghost ? "#c3c0d6" : "#8f939c");
  const runeColor = ghost ? new THREE.Color(1.7, 0.8, 2.8) : new THREE.Color(0.35, 1.9, 2.3);
  // Stepped base
  m.solid.push(rbox(w + 0.9, 0.36, d + 1.0, stoneFn(PAL.stone, 0.5, rand), { pos: [0, 0.1, 0] }, 0.1));
  m.solid.push(rbox(w + 0.4, 0.3, d + 0.5, stoneFn(PAL.stoneLight, 0.3, rand), { pos: [0, 0.4, 0] }, 0.08));
  const y0 = 0.52;
  const g = new THREE.ExtrudeGeometry(archShape(w, h), { depth: d, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 14 });
  g.translate(0, y0, -d / 2);
  const moss = new THREE.Color(PAL.moss);
  m.solid.push(part(g, (p) => {
    const c = stone.clone().multiplyScalar(0.88 + 0.16 * ((p.y - y0) / h) + Math.sin(p.x * 13 + p.y * 7) * 0.03);
    const mossy = THREE.MathUtils.clamp((0.55 - (p.y - y0) + Math.sin(p.x * 9) * 0.15) * 2.5, 0, 1);
    return c.lerp(moss, mossy * 0.8);
  }));
  // Carved face panels with runes on both sides
  const panel = new THREE.Color(stone).multiplyScalar(0.62);
  for (const side of [1, -1]) {
    const face = new THREE.ShapeGeometry(archShape(w - 0.34, h - 0.4), 10);
    const runes: THREE.BufferGeometry[] = [];
    const rows = ghost ? 4 : 3;
    for (let r = 0; r < rows; r++) {
      const y = 0.42 + r * 0.46;
      for (const x of [-0.42, 0, 0.42]) runes.push(...rune(rand, x, y, 0.34, runeColor));
    }
    // Sun / eye symbol in the round top
    const ty = h - w / 2 - 0.05;
    runes.push(part(new THREE.TorusGeometry(0.2, 0.035, 4, 16), runeColor, { pos: [0, ty, 0] }));
    runes.push(ball(0.07, runeColor, [0, ty, 0], 1));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      runes.push(beam([Math.cos(a) * 0.27, ty + Math.sin(a) * 0.27, 0], [Math.cos(a) * 0.36, ty + Math.sin(a) * 0.36, 0], 0.035, runeColor, 0.03));
    }
    const xf = placeAt(0, y0 + 0.2, side * (d / 2 + 0.065), side > 0 ? 0 : Math.PI);
    const faceG = part(face, panel);
    faceG.applyMatrix4(xf);
    m.solid.push(faceG);
    for (const rg of runes) {
      rg.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.012));
      rg.applyMatrix4(xf);
      m.pulse.push(rg);
    }
  }
  let crystalAt: THREE.Vector3 | null = null;
  if (ghost) {
    m.solid.push(cyl(0.32, 0.2, 0.25, PAL.stoneLight, { pos: [0, y0 + h + 0.12, 0] }, 8));
    crystalAt = new THREE.Vector3(0, y0 + h + 0.95, 0);
    // Clusters of small crystals sprouting around the base
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5 + rand() * 0.4;
      const r = 1.45 + rand() * 0.3;
      for (let k = 0; k < 3; k++) {
        const cg = new THREE.OctahedronGeometry(0.16 + rand() * 0.12, 0);
        cg.scale(1, 2.4, 1);
        const pos: V3 = [Math.cos(a) * r + (rand() - 0.5) * 0.4, 0.3, Math.sin(a) * r + (rand() - 0.5) * 0.4];
        m.pulse.push(part(cg, new THREE.Color(1.3, 0.55, 2.4), { pos, rot: [(rand() - 0.5) * 0.9, 0, (rand() - 0.5) * 0.9] }));
      }
    }
  }
  return { model: m, crystalAt };
}

/** Elongated glowing crystal with a tilted halo ring (for the ghost tablet), centred at the origin. */
export function crystal(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(0.42, 0);
  g.scale(1, 1.9, 1);
  const gem = part(g, (p) => new THREE.Color(1.0, 0.3, 2.1).lerp(new THREE.Color(1.8, 1.1, 2.6), THREE.MathUtils.clamp(p.y / 0.8 + 0.5, 0, 1)));
  const halo = part(new THREE.TorusGeometry(0.78, 0.035, 4, 36), new THREE.Color(1.3, 0.55, 2.4), { rot: [Math.PI / 2 + 0.35, 0, 0] });
  return merge([gem, halo]);
}

/**
 * Old-mine cave entrance: a boulder arch with a dark tunnel mouth, timber
 * frame, sign, torches and rails. `ground(x, z)` gives local ground height.
 */
export function caveEntrance(atlas: SignAtlas, seed: number, ground: (x: number, z: number) => number): Model {
  const rand = mulberry32(seed + 79);
  const m = emptyModel();
  const W = 3.4;
  const H = 3.9;
  const back = -0.6;
  const front = 0.5;
  const rock = stoneFn("#8f857b", 0.45, rand);
  // Dark mouth: portal plane plus inward-facing tunnel walls, darker with depth
  const portal = new THREE.ShapeGeometry(archShape(W, H), 12);
  m.dark.push(part(portal, (p) => new THREE.Color("#2a1c14").lerp(new THREE.Color("#040302"), THREE.MathUtils.clamp(1 - Math.hypot(p.x / W, (p.y - H * 0.35) / H) * 1.6, 0, 1)), { pos: [0, 0, back] }));
  const outline = archShape(W, H).getPoints(14);
  const wall: number[] = [];
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i];
    const b = outline[i + 1];
    if (a.y < 0.01 && b.y < 0.01) continue;
    wall.push(a.x, a.y, back, b.x, b.y, back, a.x, a.y, front, a.x, a.y, front, b.x, b.y, back, b.x, b.y, front);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
  wg.computeVertexNormals();
  m.dark.push(flip(part(wg, (p) => new THREE.Color("#3a2a1e").lerp(new THREE.Color("#0a0705"), THREE.MathUtils.clamp((front - p.z) / (front - back), 0, 1)))));
  m.dark.push(box(W, 0.06, front - back, "#1c140e", { pos: [0, 0.03, (front + back) / 2] }));
  // Boulders framing the arch
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI;
    const r = W / 2 + 0.75;
    const x = -Math.cos(a) * r * 1.05;
    const y = H - W / 2 + Math.sin(a) * (r + 0.1);
    const s = 0.8 + rand() * 0.45;
    const g = rockBlob(seed * 3 + i, [s, s, s * 1.2], rock);
    g.translate(x, y, 0.05);
    m.solid.push(g);
  }
  for (const sx of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const s = 1.0 + rand() * 0.4;
      const g = rockBlob(seed * 5 + j + (sx > 0 ? 7 : 0), [s, s * 1.1, s * 1.3], rock);
      g.translate(sx * (W / 2 + 0.85 + j * 0.25), 0.5 + j * 0.95, 0.1 - j * 0.15);
      m.solid.push(g);
    }
    const big = rockBlob(seed + (sx > 0 ? 31 : 37), [2.0, 2.6, 2.4], rock);
    big.translate(sx * (W / 2 + 2.4), 1.6, -1.0);
    m.solid.push(big);
  }
  const hood = rockBlob(seed + 41, [3.6, 1.6, 2.6], rock);
  hood.translate(0, H + 1.4, -1.1);
  m.solid.push(hood);
  // Mine timbers: two posts, lintel and corner braces
  const tz = front - 0.05;
  const old = "#6d4f36";
  for (const sx of [-1, 1]) {
    m.solid.push(rbox(0.3, 2.75, 0.3, tint(old, rand), { pos: [sx * (W / 2 - 0.3), 1.37, tz] }, 0.04));
    m.solid.push(beam([sx * (W / 2 - 0.3), 2.1, tz + 0.05], [sx * (W / 2 - 0.95), 2.7, tz + 0.05], 0.18, old));
  }
  m.solid.push(rbox(W + 0.1, 0.34, 0.36, tint(old, rand), { pos: [0, 2.85, tz] }, 0.05));
  const sign = atlas.quad("Höhle", 1.3, 0.4);
  sign.translate(0, 3.32, tz + 0.06);
  m.solid.push(rbox(1.5, 0.5, 0.08, "#d9a25e", { pos: [0, 3.32, tz], rot: [0, 0, 0.04] }, 0.03));
  m.text.push(sign);
  // Torches on iron brackets either side of the mouth
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.55);
    addModel(m, torch(0.7), placeAt(x, 1.55, front + 0.75, 0));
    m.solid.push(beam([x, 1.75, front + 0.75], [x, 1.75, front + 0.2], 0.07, PAL.iron));
  }
  // Rails and sleepers running out of the tunnel
  for (let z = back + 0.2; z < 7; z += 0.6) {
    const y = Math.max(ground(0, z), 0) + 0.05;
    m.solid.push(box(1.5, 0.1, 0.24, tint(PAL.woodDark, rand), { pos: [0, y, z], rot: [0, (rand() - 0.5) * 0.1, 0] }));
  }
  for (const sx of [-1, 1]) {
    for (let z = back; z < 6.6; z += 0.6) {
      const ya = Math.max(ground(sx * 0.5, z), 0) + 0.15;
      const yb = Math.max(ground(sx * 0.5, z + 0.6), 0) + 0.15;
      m.solid.push(beam([sx * 0.5, ya, z], [sx * 0.5, yb, z + 0.6], 0.07, "#5d5f66", 0.1));
    }
  }
  return m;
}

/** Twisted strand curve: offset `phase` around a guide curve lying in the xy-plane. */
function strand(guide: THREE.Curve<THREE.Vector3>, radius: number, turns: number, phase: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = guide.getPoint(t);
    const tan = guide.getTangent(t);
    const nrm = new THREE.Vector3(-tan.y, tan.x, 0).normalize();
    const a = phase + t * turns * Math.PI * 2;
    const r = radius * (1.25 - t * 0.5);
    pts.push(p.add(nrm.multiplyScalar(Math.cos(a) * r)).add(new THREE.Vector3(0, 0, Math.sin(a) * r)));
  }
  return new THREE.CatmullRomCurve3(pts);
}

/** Archway of two twisted trees meeting overhead, with vines, glowing lanterns and a "Zauberwald" sign. */
export function forestArch(atlas: SignAtlas, seed: number): Model {
  const rand = mulberry32(seed + 83);
  const m = emptyModel();
  const bark = (p: THREE.Vector3) => new THREE.Color("#5b4a6b").lerp(new THREE.Color("#7a6590"), THREE.MathUtils.clamp(p.y / 6, 0, 1));
  for (const sx of [-1, 1]) {
    const guide = new THREE.CubicBezierCurve3(
      new THREE.Vector3(sx * 2.7, -0.2, 0),
      new THREE.Vector3(sx * 3.1, 2.8, 0),
      new THREE.Vector3(sx * 1.9, 6.0, 0),
      new THREE.Vector3(sx * 0.1, 5.5, 0),
    );
    for (let k = 0; k < 3; k++) {
      m.solid.push(part(new THREE.TubeGeometry(strand(guide, 0.2, 1.6 * sx, (k / 3) * Math.PI * 2), 40, 0.17 - k * 0.015, 6, false), bark));
    }
    // Roots
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rand();
      m.solid.push(part(new THREE.ConeGeometry(0.16, 1.2, 5), "#4a3a58", { pos: [sx * 2.7 + Math.cos(a) * 0.4, 0.15, Math.sin(a) * 0.4], rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] }));
    }
    // Vine spiralling around the trunk, dotted with leaves and glowing flowers
    const vine = strand(guide, 0.42, 2.4 * sx, rand() * 6);
    m.solid.push(part(new THREE.TubeGeometry(vine, 50, 0.045, 4, false), "#3f8a3a"));
    for (let i = 2; i < 24; i++) {
      const p = vine.getPoint(i / 24);
      m.solid.push(ball(0.13, i % 2 ? "#4fa83f" : "#6cc04a", [p.x, p.y, p.z], 0, [1.3, 0.5, 1]));
      if (i % 3 === 0) m.pulse.push(ball(0.12, i % 2 ? new THREE.Color(2.4, 0.9, 2.2) : new THREE.Color(0.6, 2.2, 2.4), [p.x, p.y + 0.06, p.z + 0.05], 1));
    }
  }
  // Foliage: soft clusters on the outer shoulders so the bend of the arch stays visible
  const palettes: [string, string][] = [["#1d5a6e", "#47c0b4"], ["#3a2f78", "#8f6bdc"]];
  const clusters: [number, number, number][] = [[-3.1, 4.4, 0.85], [3.2, 4.3, 0.85]];
  clusters.forEach(([cx, cy, k], ci) => {
    const [dk, lt] = palettes[ci];
    const center = new THREE.Vector3(cx, cy, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rand() * 0.8;
      const r = (0.7 + rand() * 0.35) * k;
      const off = i === 0 ? 0 : 0.75 * k;
      const g = new THREE.IcosahedronGeometry(r, 2);
      g.translate(cx + Math.cos(a) * off, cy + (rand() - 0.3) * 0.6 * k + (i === 0 ? 0.3 * k : 0), Math.sin(a) * off * 0.8);
      displace(g, r * 0.12, 1.4, rand() * 50);
      softNormals(g, center, 0.6, 1.2);
      m.solid.push(part(g, gradient(dk, lt, cy - k * 1.2, cy + k * 1.3, 0.12)));
    }
  });
  // Leafy tufts along the top of the arch
  for (let i = 0; i < 9; i++) {
    const x = -2.0 + i * 0.5;
    const y = 5.35 - (x * x) * 0.09 + rand() * 0.15;
    m.solid.push(ball(0.32 + rand() * 0.12, i % 2 ? "#3f9a4a" : "#5cbf55", [x, y, (rand() - 0.5) * 0.4], 1, [1.2, 0.7, 1]));
  }
  // A big glowing flower crowning the arch
  const petal = new THREE.Color(2.4, 0.75, 1.9);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    m.pulse.push(ball(0.3, petal, [Math.cos(a) * 0.36, 5.75, 0.1 + Math.sin(a) * 0.36], 1, [1.2, 0.35, 0.75]));
  }
  m.pulse.push(ball(0.2, new THREE.Color(2.8, 2.2, 0.5), [0, 5.82, 0.1], 1));
  // Hanging lanterns
  const lanternColors = [new THREE.Color(0.5, 2.0, 2.4), new THREE.Color(2.4, 0.8, 2.0), new THREE.Color(2.6, 1.9, 0.6)];
  const spots: V3[] = [[-2.3, 4.6, 0.25], [2.4, 4.5, -0.25], [-1.3, 5.25, -0.3], [1.35, 5.2, 0.3]];
  spots.forEach((p, i) => {
    const drop = 0.5 + (i % 2) * 0.35;
    m.solid.push(rope(p, [p[0], p[1] - drop, p[2]], 0, 0.02, "#3f8a3a", 2));
    const lm = hangingLantern(lanternColors[i % 3]);
    // Reason: magic lanterns pulse, so move their glass from the steady glow list to the pulse list
    lm.pulse.push(...lm.glow.splice(0));
    addModel(m, lm, placeAt(p[0], p[1] - drop, p[2], rand() * 3, 1.35));
  });
  // Hanging sign
  const sw = 2.6;
  m.solid.push(rbox(sw, 0.62, 0.1, "#cfa0e8", { pos: [0, 3.95, 0] }, 0.05));
  for (const sx of [-1, 1]) m.solid.push(rope([sx * 0.9, 4.26, 0], [sx * 0.75, 5.4, 0], 0, 0.025, "#3f8a3a", 2));
  for (const side of [1, -1]) {
    const q = atlas.quad("Zauberwald", sw * 0.92, 0.56, "#3a1f5a");
    if (side < 0) q.rotateY(Math.PI);
    q.translate(0, 3.95, side * 0.056);
    m.text.push(q);
  }
  return m;
}

/** Tiny shrine with a golden roof that glints from afar (origin on the ground). */
export function shrine(seed: number): Model {
  const rand = mulberry32(seed + 89);
  const m = emptyModel();
  m.solid.push(rbox(2.0, 0.4, 2.0, stoneFn(PAL.stoneLight, 0, rand), { pos: [0, 0.0, 0] }, 0.08));
  m.solid.push(rbox(1.6, 0.25, 1.6, PAL.white, { pos: [0, 0.3, 0] }, 0.06));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.solid.push(cyl(0.09, 0.11, 1.3, PAL.white, { pos: [x * 0.6, 1.05, z * 0.6] }, 8));
  const gold = new THREE.Color(2.6, 1.9, 0.45);
  m.glow.push(part(new THREE.ConeGeometry(1.2, 0.9, 4), gold, { pos: [0, 2.15, 0], rot: [0, Math.PI / 4, 0] }));
  m.glow.push(box(1.5, 0.12, 1.5, gold.clone().multiplyScalar(0.8), { pos: [0, 1.72, 0] }));
  m.glow.push(ball(0.13, gold.clone().multiplyScalar(1.4), [0, 2.7, 0]));
  m.pulse.push(ball(0.22, new THREE.Color(3.2, 2.5, 0.9), [0, 0.95, 0], 1));
  return m;
}
