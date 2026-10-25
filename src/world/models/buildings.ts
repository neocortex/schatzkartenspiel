/**
 * Village buildings: half-timbered cottages (tiled or straw roofs, glowing
 * windows, shutters, flower boxes, chimneys), the stone well, the market
 * stall and the village gate. Models face +z (door side) with the origin on
 * the ground at the footprint centre.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { part, displace } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import {
  Model, PAL, emptyModel, addModel, placeAt, tint, withSway,
  rbox, box, cyl, ball, beam, pole, rope, triangles,
} from "./shapes";
import { flowerBox, fruitCrate, hangingLantern, flowerPot, bucket } from "./props";
import { SignAtlas } from "./signs";

const WINDOW_GLOW = new THREE.Color(1.9, 1.3, 0.55);

export interface CottageStyle {
  size: number;
  elder?: boolean;
  seed: number;
  roof: "tile" | "straw";
  roofColor: THREE.ColorRepresentation;
  shutter: THREE.ColorRepresentation;
  plaster?: THREE.ColorRepresentation;
}

/** Window (facing +z, centred) with glowing pane, cross mullions, open shutters and an optional flower box. */
function cottageWindow(w: number, h: number, shutter: THREE.ColorRepresentation, flowers: boolean, seed: number): Model {
  const m = emptyModel();
  m.glow.push(box(w, h, 0.06, WINDOW_GLOW, { pos: [0, 0, 0] }));
  const t = 0.09;
  m.solid.push(box(w + t * 2, t, 0.14, PAL.timber, { pos: [0, h / 2 + t / 2, 0.02] }));
  m.solid.push(box(w + t * 2 + 0.1, t * 1.2, 0.2, PAL.timber, { pos: [0, -h / 2 - t / 2, 0.05] }));
  for (const sx of [-1, 1]) m.solid.push(box(t, h, 0.14, PAL.timber, { pos: [sx * (w / 2 + t / 2), 0, 0.02] }));
  m.solid.push(box(0.05, h, 0.08, PAL.timber, { pos: [0, 0, 0.04] }));
  m.solid.push(box(w, 0.05, 0.08, PAL.timber, { pos: [0, 0.05, 0.04] }));
  for (const sx of [-1, 1]) {
    // Shutters swung open against the wall, with a little heart cut-out look
    const sw = w * 0.42;
    m.solid.push(rbox(sw, h + 0.04, 0.06, shutter, { pos: [sx * (w / 2 + t + sw / 2 + 0.02), 0, 0.04] }, 0.025));
    m.solid.push(box(sw * 0.8, 0.05, 0.03, new THREE.Color(shutter).multiplyScalar(0.7), { pos: [sx * (w / 2 + t + sw / 2 + 0.02), h * 0.25, 0.08] }));
    m.solid.push(box(sw * 0.8, 0.05, 0.03, new THREE.Color(shutter).multiplyScalar(0.7), { pos: [sx * (w / 2 + t + sw / 2 + 0.02), -h * 0.25, 0.08] }));
  }
  if (flowers) addModel(m, flowerBox(w + 0.25, seed), placeAt(0, -h / 2 - 0.36, 0.22));
  return m;
}

/** Arched plank door (facing +z, bottom centre at the origin) with frame, knob and a little canopy. */
function cottageDoor(dw: number, dh: number, seed: number): Model {
  const rand = mulberry32(seed);
  const m = emptyModel();
  const doorColor = ["#7a3f26", "#3f6f8f", "#4f7d3a", "#8a5a2b"][seed % 4];
  const straight = dh - dw / 2;
  const planks = 4;
  for (let i = 0; i < planks; i++) {
    const x = -dw / 2 + (i + 0.5) * (dw / planks);
    m.solid.push(box(dw / planks - 0.02, straight, 0.1, tint(doorColor, rand, 0.08), { pos: [x, straight / 2, 0] }));
  }
  m.solid.push(part(new THREE.CylinderGeometry(dw / 2, dw / 2, 0.1, 12, 1, false, -Math.PI / 2, Math.PI), doorColor, { pos: [0, straight, 0], rot: [Math.PI / 2, 0, 0] }));
  for (const y of [0.4, straight - 0.3]) m.solid.push(box(dw * 0.9, 0.08, 0.05, PAL.iron, { pos: [0, y, 0.06] }));
  m.solid.push(ball(0.06, PAL.gold, [dw * 0.32, dh * 0.45, 0.1]));
  m.glow.push(cyl(0.13, 0.13, 0.04, WINDOW_GLOW, { pos: [0, straight + dw * 0.15, 0.05], rot: [Math.PI / 2, 0, 0] }, 10));
  // Frame and arch trim
  for (const sx of [-1, 1]) m.solid.push(box(0.14, straight, 0.16, PAL.timber, { pos: [sx * (dw / 2 + 0.07), straight / 2, 0.02] }));
  m.solid.push(part(new THREE.TorusGeometry(dw / 2 + 0.07, 0.08, 5, 12, Math.PI), PAL.timber, { pos: [0, straight, 0.03] }));
  // Canopy on two brackets
  const cy = dh + 0.35;
  m.solid.push(rbox(dw + 0.9, 0.08, 0.6, "#b8452f", { pos: [0, cy + 0.12, 0.3], rot: [0.45, 0, 0] }, 0.03));
  for (const sx of [-1, 1]) m.solid.push(beam([sx * (dw / 2 + 0.3), cy - 0.45, 0.02], [sx * (dw / 2 + 0.3), cy + 0.02, 0.5], 0.08, PAL.timber));
  return m;
}

/** Half-timbered cottage. Returns the model plus collider circles (local x, z, r). */
export function cottage(style: CottageStyle): { model: Model; colliders: [number, number, number][] } {
  const rand = mulberry32(style.seed);
  const m = emptyModel();
  const s = style.size;
  const W = 5.6 * s;
  const D = 4.3 * s;
  const base = 0.42;
  const H = style.elder ? 4.4 : 2.75;
  const top = base + H;
  const plaster = style.plaster ?? PAL.plaster;

  // Stone foundation, sunk into the ground to hide uneven terrain
  m.solid.push(rbox(W + 0.36, base + 0.6, D + 0.36, (p, n) => tint(PAL.stone, rand, 0.1).multiplyScalar(n.y > 0.5 ? 1.08 : 0.92), { pos: [0, (base - 0.6) / 2, 0] }, 0.1));
  // Plastered walls
  m.solid.push(rbox(W, H, D, (p) => new THREE.Color(plaster).multiplyScalar(0.93 + 0.07 * THREE.MathUtils.clamp((p.y - base) / H, 0, 1)), { pos: [0, base + H / 2, 0] }, 0.05));

  // --- Timber frame -------------------------------------------------------
  const tw = 0.2;
  const off = 0.04;
  const T = PAL.timber;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.solid.push(box(tw + 0.04, H + 0.05, tw + 0.04, T, { pos: [sx * W / 2, base + H / 2, sz * D / 2] }));
  for (const y of [base + 0.08, top - 0.06, ...(style.elder ? [base + H * 0.5] : [])]) {
    for (const sz of [-1, 1]) m.solid.push(box(W, tw, 0.12, T, { pos: [0, y, sz * (D / 2 + off)] }));
    for (const sx of [-1, 1]) m.solid.push(box(0.12, tw, D, T, { pos: [sx * (W / 2 + off), y, 0] }));
  }
  const dw = 1.15;
  const dh = 2.15;
  const fz = D / 2 + off;
  // Front: posts beside the door and braces above the windows
  for (const sx of [-1, 1]) {
    m.solid.push(box(0.14, H, 0.12, T, { pos: [sx * (dw / 2 + 0.17), base + H / 2, fz] }));
    m.solid.push(beam([sx * (dw / 2 + 0.25), top - 0.1, fz], [sx * (dw / 2 + 0.95), top - 0.55, fz], 0.16, T, 0.12));
  }
  // Back: an X brace in the middle panel
  m.solid.push(beam([-W * 0.1, base + 0.1, -fz], [W * 0.1, top - 0.1, -fz], 0.16, T, 0.12));
  m.solid.push(beam([W * 0.1, base + 0.1, -fz], [-W * 0.1, top - 0.1, -fz], 0.16, T, 0.12));
  // Sides: braces from the bottom corners, clear of the window shutters
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + off);
    for (const sz of [-1, 1]) m.solid.push(beam([x, base + 0.1, sz * (D / 2 - 0.1)], [x, base + H * 0.55, sz * (D / 2 - 1.0)], 0.16, T, 0.12));
  }

  // --- Door, steps and windows -------------------------------------------
  addModel(m, cottageDoor(dw, dh, style.seed), placeAt(0, base, D / 2 + 0.02));
  m.solid.push(rbox(dw + 0.9, 0.24, 0.7, PAL.stoneLight, { pos: [0, base - 0.08, D / 2 + 0.45] }, 0.06));
  m.solid.push(rbox(dw + 1.3, 0.24, 0.6, PAL.stone, { pos: [0, base - 0.3, D / 2 + 0.95] }, 0.06));
  const ww = 0.85;
  const wh = 1.0;
  const wy = base + 1.45;
  const rows = style.elder ? [wy, wy + H * 0.5] : [wy];
  for (const y of rows) {
    for (const sx of [-1, 1]) {
      addModel(m, cottageWindow(ww, wh, style.shutter, y === wy, style.seed + sx), placeAt(sx * W * 0.315, y, D / 2 + 0.03));
      addModel(m, cottageWindow(ww, wh, style.shutter, false, style.seed), placeAt(sx * W * 0.3, y, -D / 2 - 0.03, Math.PI));
      addModel(m, cottageWindow(ww, wh, style.shutter, y === wy, style.seed + 5), placeAt(sx * (W / 2 + 0.03), y, 0, sx * Math.PI / 2));
    }
    if (y !== wy) addModel(m, cottageWindow(ww * 0.8, wh * 0.9, style.shutter, false, style.seed), placeAt(0, y, D / 2 + 0.03));
  }
  // Lantern beside the door
  m.solid.push(beam([dw / 2 + 0.7, base + 2.25, D / 2 + 0.05], [dw / 2 + 0.7, base + 2.25, D / 2 + 0.4], 0.06, PAL.iron));
  addModel(m, hangingLantern(WINDOW_GLOW), placeAt(dw / 2 + 0.7, base + 2.25, D / 2 + 0.38, 0, 0.8));

  // --- Gables and roof ------------------------------------------------------
  const roofH = D * 0.5;
  const ov = 0.5;
  const ovx = 0.45;
  const gable = (sx: number) => {
    const x = sx * W / 2;
    // Reason: winding must give an outward (±x) normal on each gable
    const zA = sx > 0 ? D / 2 : -D / 2;
    m.solid.push(triangles([x, top, zA, x, top, -zA, x, top + roofH, 0], plaster));
    m.solid.push(box(0.12, roofH - 0.1, tw, T, { pos: [x + sx * off, top + roofH / 2 - 0.05, 0] }));
    m.glow.push(cyl(0.22, 0.22, 0.06, WINDOW_GLOW, { pos: [x + sx * 0.03, top + roofH * 0.38, 0], rot: [0, 0, Math.PI / 2] }, 10));
    m.solid.push(part(new THREE.TorusGeometry(0.24, 0.05, 4, 12), T, { pos: [x + sx * 0.07, top + roofH * 0.38, 0], rot: [0, Math.PI / 2, 0] }));
  };
  gable(-1);
  gable(1);

  const slope = Math.atan2(roofH, D / 2);
  const halfSpan = D / 2 + ov;
  const L = halfSpan / Math.cos(slope);
  const eaveY = top - ov * Math.tan(slope);
  const roofW = W + ovx * 2;
  const roofColor = new THREE.Color(style.roofColor);
  for (const sz of [-1, 1]) {
    // Reason: rotate so the slab's local +z runs down the slope towards the eave on this side
    const rotX = sz * slope;
    const along = (t: number): [number, number, number] => [0, top + roofH - (top + roofH - eaveY) * t, sz * halfSpan * t];
    if (style.roof === "tile") {
      // Reason: rows tilted a bit steeper than the roof make each row's lower edge stand out like shingles
      const rows = 6;
      for (let i = 0; i < rows; i++) {
        const t = (i + 0.5) / rows;
        const [x, y, z] = along(t);
        const c = roofColor.clone().multiplyScalar(i % 2 ? 0.9 : 1.05);
        m.solid.push(rbox(roofW, 0.16, L / rows + 0.22, c, { pos: [x, y + 0.12, z], rot: [rotX + sz * 0.2, 0, 0] }, 0.06));
      }
      // Barrel-tile ribs running down the slope
      const ribs = Math.round(roofW / 0.45);
      const a = along(0.03);
      const b = along(1.0);
      for (let k = 0; k <= ribs; k++) {
        const x = -roofW / 2 + 0.14 + (k / ribs) * (roofW - 0.28);
        m.solid.push(pole([x, a[1] + 0.25, a[2]], [x, b[1] + 0.27, b[2]], 0.075, roofColor.clone().multiplyScalar(1.12), 5));
      }
    } else {
      // Thatch: a few thick, soft, slightly lumpy layers
      const rows = 4;
      for (let i = 0; i < rows; i++) {
        const t = (i + 0.5) / rows;
        const [x, y, z] = along(t);
        const g = new RoundedBoxGeometry(roofW + 0.12, 0.44, L / rows + 0.34, 2, 0.2);
        displace(g, 0.05, 2.4, style.seed + i * 3);
        const c = roofColor.clone().multiplyScalar(i % 2 ? 0.86 : 1.02);
        m.solid.push(part(g, (p, n) => c.clone().multiplyScalar(n.y < -0.3 ? 0.7 : 1), { pos: [x, y + 0.26, z], rot: [rotX + sz * 0.16, 0, 0] }));
      }
    }
    // Barge boards along the gable edges
    for (const sx of [-1, 1]) {
      m.solid.push(beam([sx * (roofW / 2 + 0.02), top + roofH + 0.12, 0], [sx * (roofW / 2 + 0.02), eaveY + 0.05, sz * halfSpan], 0.12, T, 0.26));
    }
  }
  const ridgeColor = style.roof === "tile" ? roofColor.clone().multiplyScalar(0.7) : roofColor.clone().multiplyScalar(0.8);
  m.solid.push(cyl(style.roof === "tile" ? 0.17 : 0.34, style.roof === "tile" ? 0.17 : 0.34, roofW + 0.1, ridgeColor, { pos: [0, top + roofH + 0.2, 0], rot: [0, 0, Math.PI / 2] }, 8));

  // Chimney on the back slope
  const cx = W * 0.27;
  const cz = -D * 0.22;
  const surf = top + roofH * (1 - Math.abs(cz) / (D / 2));
  const chTop = top + roofH + 0.9;
  const brick = (p: THREE.Vector3) => new THREE.Color("#a5523a").multiplyScalar(Math.floor(p.y * 4) % 2 ? 0.92 : 1.05);
  m.solid.push(box(0.72, chTop - surf + 0.4, 0.72, brick, { pos: [cx, (chTop + surf - 0.4) / 2, cz] }));
  m.solid.push(rbox(0.9, 0.16, 0.9, PAL.stoneDark, { pos: [cx, chTop, cz] }, 0.04));
  m.dark.push(box(0.5, 0.02, 0.5, "#1a1210", { pos: [cx, chTop + 0.085, cz] }));
  m.chimneys.push(new THREE.Vector3(cx, chTop + 0.1, cz));

  if (style.elder) {
    // A proud banner on the ridge for the village elder
    m.solid.push(cyl(0.05, 0.06, 2.0, PAL.woodDark, { pos: [-W * 0.35, top + roofH + 1.0, 0] }, 6));
    m.solid.push(ball(0.09, PAL.gold, [-W * 0.35, top + roofH + 2.05, 0]));
    m.cloth.push(withSway(box(1.2, 0.7, 0.03, "#d23b2c", { pos: [-W * 0.35 + 0.62, top + roofH + 1.6, 0] }), (p) => Math.max(0, p.x + W * 0.35) * 0.18));
  }

  const colliders: [number, number, number][] = [];
  const n = Math.max(2, Math.round(W / 2.4));
  const r = Math.min(D / 2 + 0.35, (W / n) * 0.75);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + r * 0.8 + (i / (n - 1)) * (W - r * 1.6);
    colliders.push([x, -D / 4, r], [x, D / 4, r]);
  }
  return { model: m, colliders };
}

/** Stone well with a little tiled roof, winch, rope and bucket. */
export function well(seed: number): Model {
  const rand = mulberry32(seed + 41);
  const m = emptyModel();
  const R = 1.05;
  for (let course = 0; course < 2; course++) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = ((i + course * 0.5) / n) * Math.PI * 2;
      m.solid.push(rbox(0.58, 0.4, 0.36, tint(PAL.stone, rand, 0.15), { pos: [Math.cos(a) * R, 0.2 + course * 0.4, Math.sin(a) * R], rot: [0, -a + Math.PI / 2, 0] }, 0.08));
    }
  }
  m.solid.push(part(new THREE.TorusGeometry(R, 0.24, 5, 18), PAL.stoneLight, { pos: [0, 0.86, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.6] }));
  m.dark.push(cyl(R - 0.15, R - 0.15, 0.04, "#0f2a3a", { pos: [0, 0.55, 0] }, 16));
  m.glow.push(cyl(R * 0.5, R * 0.5, 0.01, new THREE.Color(0.25, 0.6, 0.8), { pos: [0.12, 0.575, 0.08] }, 12));
  for (const sx of [-1, 1]) {
    m.solid.push(rbox(0.2, 2.5, 0.2, PAL.timber, { pos: [sx * (R + 0.05), 1.25, 0] }, 0.04));
    m.solid.push(beam([sx * (R + 0.05), 1.4, 0], [sx * (R - 0.45), 2.3, 0], 0.1, PAL.timber));
  }
  m.solid.push(cyl(0.12, 0.12, 2.3, PAL.wood, { pos: [0, 1.75, 0], rot: [0, 0, Math.PI / 2] }, 8));
  m.solid.push(cyl(0.2, 0.2, 0.5, PAL.rope, { pos: [0, 1.75, 0], rot: [0, 0, Math.PI / 2] }, 10));
  m.solid.push(beam([R + 0.2, 1.75, 0], [R + 0.2, 1.4, 0.05], 0.06, PAL.iron));
  m.solid.push(cyl(0.04, 0.04, 0.3, PAL.woodDark, { pos: [R + 0.33, 1.4, 0.05], rot: [0, 0, Math.PI / 2] }, 5));
  m.solid.push(cyl(0.02, 0.02, 0.55, PAL.rope, { pos: [0, 1.42, 0] }, 4));
  addModel(m, bucket(), placeAt(0, 0.82, 0));
  // Roof
  const rh = 0.75;
  const span = 0.95;
  const L = Math.hypot(span + 0.25, rh);
  const slope = Math.atan2(rh, span);
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const t = (i + 0.5) / 3;
      m.solid.push(rbox(2.7, 0.12, L / 3 + 0.12, new THREE.Color("#c4553a").multiplyScalar(i % 2 ? 0.92 : 1.04), { pos: [0, 2.55 + rh - (rh + 0.2) * t + 0.08, sz * (span + 0.25) * t], rot: [sz * slope + sz * 0.05, 0, 0] }, 0.04));
    }
  }
  m.solid.push(cyl(0.12, 0.12, 2.8, "#8e3b28", { pos: [0, 2.55 + rh + 0.12, 0], rot: [0, 0, Math.PI / 2] }, 8));
  for (const sx of [-1, 1]) m.solid.push(triangles([sx * 1.15, 2.4, sx * span, sx * 1.15, 2.4, -sx * span, sx * 1.15, 2.4 + rh, 0], PAL.timber));
  m.solid.push(box(2.4, 0.14, 0.14, PAL.timber, { pos: [0, 2.42, 0] }));
  return m;
}

/** Market stall with a striped awning, fruit crates and a sign. */
export function marketStall(atlas: SignAtlas, seed: number): Model {
  const rand = mulberry32(seed + 43);
  const m = emptyModel();
  const W = 3.0;
  for (const sx of [-1, 1]) {
    m.solid.push(rbox(0.16, 2.6, 0.16, PAL.wood, { pos: [sx * W / 2, 1.3, -0.7] }, 0.04));
    m.solid.push(rbox(0.16, 2.25, 0.16, PAL.wood, { pos: [sx * W / 2, 1.12, 0.75] }, 0.04));
  }
  m.solid.push(rbox(W, 0.9, 0.9, "#c58b52", { pos: [0, 0.45, 0.45] }, 0.05));
  m.solid.push(rbox(W + 0.15, 0.1, 1.05, PAL.woodLight, { pos: [0, 0.95, 0.45] }, 0.03));
  m.solid.push(box(W - 0.3, 0.5, 0.04, "#3f7fbf", { pos: [0, 0.45, 0.92] }));
  const fruits = ["#e0352b", "#ff9a1f", "#8bd13f", "#ffe14a", "#8a3fb8"];
  fruits.forEach((c, i) => addModel(m, fruitCrate(seed + i, c, 0.52), placeAt(-W / 2 + 0.35 + i * 0.58, 1.0, 0.45, (rand() - 0.5) * 0.2)));
  addModel(m, fruitCrate(seed + 9, "#e0352b", 0.62), placeAt(-0.9, 0, 1.35, 0.3));
  addModel(m, fruitCrate(seed + 10, "#ffe14a", 0.62), placeAt(0.95, 0, 1.3, -0.2));
  // Striped awning (separate strips so the stripes stay crisp) with a scalloped valance
  const strips = 8;
  const sw = (W + 0.5) / strips;
  const back: [number, number] = [2.65, -0.85];
  const front: [number, number] = [2.2, 1.15];
  const ang = Math.atan2(back[0] - front[0], front[1] - back[1]);
  const len = Math.hypot(front[1] - back[1], back[0] - front[0]);
  for (let i = 0; i < strips; i++) {
    const x = -(W + 0.5) / 2 + (i + 0.5) * sw;
    const c = i % 2 ? "#fff3df" : "#e2432f";
    m.solid.push(box(sw, 0.06, len, c, { pos: [x, (back[0] + front[0]) / 2, (back[1] + front[1]) / 2], rot: [ang, 0, 0] }));
    const v = [x - sw / 2, front[0], front[1], x + sw / 2, front[0], front[1], x, front[0] - 0.32, front[1] + 0.02];
    m.cloth.push(withSway(triangles(v, c), (p) => Math.max(0, front[0] - p.y) * 0.25));
  }
  const sign = atlas.quad("Markt", 1.3, 0.36);
  sign.translate(0, 3.0, -0.6);
  m.solid.push(rbox(1.5, 0.48, 0.08, "#f3d27a", { pos: [0, 3.0, -0.66] }, 0.03));
  m.text.push(sign);
  return m;
}

/** Village gate: two log posts, a small tiled roof, hanging welcome sign, lanterns and a flower garland. */
export function villageGate(atlas: SignAtlas, seed: number): Model {
  const rand = mulberry32(seed + 47);
  const m = emptyModel();
  const X = 2.7;
  for (const sx of [-1, 1]) {
    m.solid.push(rbox(0.8, 0.7, 0.8, PAL.stone, { pos: [sx * X, 0.25, 0] }, 0.12));
    m.solid.push(cyl(0.22, 0.26, 3.9, PAL.wood, { pos: [sx * X, 2.2, 0] }, 9));
    addModel(m, flowerPot(seed + (sx > 0 ? 1 : 0)), placeAt(sx * (X + 0.75), 0, 0.5));
    m.solid.push(beam([sx * X, 3.6, 0.2], [sx * X, 3.6, 0.75], 0.07, PAL.iron));
    addModel(m, hangingLantern(WINDOW_GLOW), placeAt(sx * X, 3.6, 0.72, 0, 0.9));
  }
  m.solid.push(rbox(X * 2 + 0.9, 0.3, 0.36, PAL.timber, { pos: [0, 3.95, 0] }, 0.06));
  m.solid.push(rbox(X * 2 + 0.3, 0.2, 0.3, PAL.timber, { pos: [0, 3.35, 0] }, 0.05));
  for (const sx of [-1, 1]) m.solid.push(beam([sx * X, 2.9, 0], [sx * (X - 0.7), 3.35, 0], 0.14, PAL.timber));
  // Roof
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const t = (i + 0.5) / 2;
      m.solid.push(rbox(X * 2 + 1.4, 0.12, 0.62, new THREE.Color("#c4553a").multiplyScalar(i % 2 ? 0.92 : 1.04), { pos: [0, 4.75 - 0.6 * t, sz * 1.0 * t], rot: [sz * 0.62, 0, 0] }, 0.04));
    }
  }
  m.solid.push(cyl(0.11, 0.11, X * 2 + 1.5, "#8e3b28", { pos: [0, 4.82, 0], rot: [0, 0, Math.PI / 2] }, 8));
  m.solid.push(box(X * 2 + 0.6, 0.6, 0.14, PAL.timber, { pos: [0, 4.35, 0] }));
  // Hanging sign
  const sw = 3.4;
  m.solid.push(rbox(sw, 0.78, 0.1, "#f3d27a", { pos: [0, 2.75, 0] }, 0.05));
  m.solid.push(rbox(sw + 0.1, 0.08, 0.14, PAL.woodDark, { pos: [0, 3.15, 0] }, 0.03));
  for (const sx of [-1, 1]) m.solid.push(rope([sx * (sw / 2 - 0.3), 3.15, 0], [sx * (sw / 2 - 0.3), 3.35, 0], 0, 0.025, PAL.iron, 2));
  const front = atlas.quad("Willkommen", sw * 0.9, 0.68);
  front.translate(0, 2.75, 0.056);
  const backText = atlas.quad("Willkommen", sw * 0.9, 0.68);
  backText.rotateY(Math.PI);
  backText.translate(0, 2.75, -0.056);
  m.text.push(front, backText);
  // Flower garland draped along the front beam
  const colors = ["#ff5f7e", "#ffd23f", "#ffffff", "#c86bff", "#ff8c3a"];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const x = -X + t * X * 2;
    const y = 3.8 - Math.sin(t * Math.PI * 3) ** 2 * 0.35;
    m.solid.push(ball(0.09, "#4f9a3c", [x, y, 0.22], 0));
    if (i % 2 === 0) m.solid.push(ball(0.08, colors[Math.floor(rand() * colors.length)], [x, y + 0.02, 0.3], 1));
  }
  return m;
}
