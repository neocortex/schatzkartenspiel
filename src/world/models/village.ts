/**
 * The village set piece: five cottages around the plaza (the elder's is the
 * biggest), the well, a market stall, lantern posts with a ring of bunting,
 * benches, a vegetable garden, haystack, fences and the welcome gate.
 * NPC spots from VILLAGE are kept free.
 */

import { LANDMARKS, VILLAGE } from "../layout";
import { mulberry32 } from "../../core/noise";
import { Site } from "./site";
import { Model, emptyModel, faceDir, ball, box, cyl, V3 } from "./shapes";
import { cottage, CottageStyle, well, marketStall, villageGate } from "./buildings";
import { barrel, crate, bench, haystack, lanternPost, fence, bunting, flowerPot } from "./props";

const STYLES: Omit<CottageStyle, "size" | "seed" | "elder">[] = [
  { roof: "tile", roofColor: "#c4553a", shutter: "#3f8f4a" },
  { roof: "straw", roofColor: "#e2b85a", shutter: "#3f7fbf", plaster: "#f6dccd" },
  { roof: "tile", roofColor: "#4f78b8", shutter: "#d0453a" },
  { roof: "straw", roofColor: "#d9ae52", shutter: "#e8b73a", plaster: "#f5ebc0" },
  { roof: "tile", roofColor: "#d0703a", shutter: "#2f9a8f", plaster: "#eef0e2" },
];

/** Little vegetable patch with rows of cabbages and pumpkins (origin at its centre). */
function garden(seed: number, w: number, d: number): Model {
  const rand = mulberry32(seed);
  const m = emptyModel();
  m.solid.push(box(w - 0.3, 0.12, d - 0.3, "#6b4a30", { pos: [0, 0.0, 0] }));
  for (let r = 0; r < 3; r++) {
    const z = -d / 2 + 0.7 + r * ((d - 1.4) / 2);
    for (let x = -w / 2 + 0.7; x <= w / 2 - 0.6; x += 0.75) {
      if (r === 1) {
        m.solid.push(ball(0.28, "#f08a24", [x, 0.22, z], 1, [1.15, 0.8, 1.15]));
        m.solid.push(cyl(0.04, 0.05, 0.14, "#4f7a2a", { pos: [x, 0.48, z] }, 5));
      } else {
        m.solid.push(ball(0.3, "#3f8f35", [x, 0.14, z], 0, [1.2, 0.4, 1.2]));
        m.solid.push(ball(0.24, rand() < 0.5 ? "#6fbf4a" : "#8fd35a", [x, 0.24, z], 1, [1, 0.85, 1]));
      }
    }
  }
  return m;
}

/** Build the whole village into one site. */
export function buildVillage(site: Site): void {
  const rand = mulberry32(4711);

  // Cottages
  VILLAGE.houses.forEach((h, i) => {
    const elder = "elder" in h && h.elder === true;
    const { model, colliders } = cottage({ ...STYLES[i], size: h.size, seed: 100 + i * 7, elder });
    const [x, z] = h.at;
    const y = site.groundMin(x, z, 3.2 * h.size);
    // Flower pots beside the steps
    const D = 4.3 * h.size;
    for (const sx of [-1, 1]) {
      const pot = flowerPot(i * 3 + sx);
      for (const g of pot.solid) g.translate(sx * 1.35, 0.42 - 0.3, D / 2 + 0.85);
      model.solid.push(...pot.solid);
    }
    site.putAt(model, x, y, z, h.facing);
    for (const [lx, lz, r] of colliders) {
      const [wx, wz] = Site.local(x, z, h.facing, lx, lz);
      site.block(wx, wz, r);
    }
    site.clearGrass(x, z, 4.2 * h.size);
  });

  // Well in the middle of the plaza
  const [wx, wz] = VILLAGE.well;
  site.put(well(3), wx, wz, 0.3, 1, 1.2);
  site.block(wx, wz, 1.45);

  // Lantern posts around the plaza, joined by a ring of bunting
  const posts: [number, number][] = [[60.2, 36.2], [69.6, 36.4], [72.6, 44.2], [70.8, 51.6], [58.2, 51.2], [55.8, 41.2]];
  const tops: V3[] = [];
  for (const [x, z] of posts) {
    const toWell = faceDir(wx - x, wz - z);
    const y = site.groundMin(x, z, 0.3);
    site.putAt(lanternPost(3.4), x, y, z, toWell + Math.PI / 2);
    site.block(x, z, 0.3);
    tops.push([x, y + 3.35, z]);
  }
  for (let i = 0; i < tops.length; i++) {
    const a = tops[i];
    const b = tops[(i + 1) % tops.length];
    site.putAt(bunting(a, b, 0.55, i * 2), 0, 0, 0);
  }

  // Market stall facing the plaza, with barrels and crates around it
  const stall: [number, number] = [72.4, 32.6];
  const stallRot = faceDir(VILLAGE.plaza[0] - stall[0], VILLAGE.plaza[1] - stall[1]);
  site.put(marketStall(site.atlas, 5), stall[0], stall[1], stallRot, 1, 1.5);
  for (const [lx, lz] of [[-1.0, -0.2], [1.0, -0.2]]) {
    const [x, z] = Site.local(stall[0], stall[1], stallRot, lx, lz);
    site.block(x, z, 1.0);
  }
  for (const [lx, lz, kind] of [[2.2, 0.2, 0], [2.4, -0.7, 1], [-2.3, -0.3, 0], [-2.1, 0.6, 2]] as const) {
    const [x, z] = Site.local(stall[0], stall[1], stallRot, lx, lz);
    site.put(kind === 0 ? barrel(lx * 10, 1.0) : crate(lz * 10 + kind, 0.75), x, z, rand() * 3);
    site.block(x, z, 0.45);
  }

  // Benches facing the well
  for (const [x, z] of [[68.6, 49.4], [59.4, 49.2], [61.0, 38.6]] as const) {
    site.put(bench(x, 1.9), x, z, faceDir(wx - x, wz - z), 1, 0.9);
    site.block(x, z, 0.75);
  }

  // Haystack and a stack of barrels on the south-east edge
  site.put(haystack(2), 74.5, 59.5, 0.4, 1, 1.3);
  site.block(74.5, 59.5, 1.5);
  site.put(barrel(8, 1.0), 72.2, 57.8, 0);
  site.put(barrel(9, 1.0), 72.9, 58.6, 0);
  site.put(crate(4, 0.8), 71.9, 59.0, 0.5);
  site.block(72.5, 58.4, 1.0);

  // Vegetable garden with a picket fence between the gate path and the west cottage
  const g: [number, number] = [50.6, 43.6];
  const gw = 4.6;
  const gd = 3.6;
  site.put(garden(9, gw, gd), g[0], g[1], 0, 1, 1.5);
  const fy = site.groundMin(g[0], g[1], 2.5);
  site.putAt(fence(gw, 1, true), g[0] - gw / 2, fy, g[1] + gd / 2);
  site.putAt(fence(gw, 2, true), g[0] - gw / 2, fy, g[1] - gd / 2);
  site.putAt(fence(gd, 3, true), g[0] - gw / 2, fy, g[1] + gd / 2, Math.PI / 2);
  site.putAt(fence(gd, 4, true), g[0] + gw / 2, fy, g[1] + gd / 2, Math.PI / 2);
  for (const [x, z] of [[g[0] - gw / 4, g[1]], [g[0] + gw / 4, g[1]]]) site.block(x, z, 1.6);
  site.clearGrass(g[0], g[1], 2.6);

  // Rail fences lining the road in from the gate
  const [gx, gz] = LANDMARKS.villageGate;
  const gateRot = faceDir(1, 12);
  site.put(villageGate(site.atlas, 7), gx, gz, gateRot, 1, 2.8);
  for (const sx of [-1, 1]) {
    const [px, pz] = Site.local(gx, gz, gateRot, sx * 2.7, 0);
    site.block(px, pz, 0.45);
    const [fx, fz] = Site.local(gx, gz, gateRot, sx * 3.3, 0.2);
    const outward = gateRot + (sx > 0 ? 0 : Math.PI);
    site.putAt(fence(5.5, 10 + sx, false), fx, site.ground(fx, fz), fz, outward);
    for (let k = 1; k <= 3; k++) {
      const [cx, cz] = Site.local(gx, gz, gateRot, sx * (3.3 + k * 1.4), 0.2);
      site.block(cx, cz, 0.25);
    }
  }
}
