/**
 * The island's newer regions (lagoon, jungle, swamp, flower hills). Each one is
 * a coastline ellipse ("lobe") added around the original island. This module
 * owns the maths shared by the heightfield and the decorators: the coast
 * distance of the whole island, how much each spot belongs to a region, and
 * how each region shapes the ground.
 */

import { Noise2D, smoothstep, lerp } from "../core/noise";
import { ISLAND, LOBES, SPOTS, RegionName, P2 } from "./layout";

export const REGION_INDEX: Record<RegionName, 0 | 1 | 2 | 3> = { lagoon: 0, jungle: 1, swamp: 2, hills: 3 };
const NAMES = Object.keys(REGION_INDEX) as RegionName[];

/** Normalised ellipse distance: 1 on the ellipse, 0 at its centre. */
const ellipse = (x: number, z: number, cx: number, cz: number, rx: number, rz: number): number =>
  Math.hypot((x - cx) / rx, (z - cz) / rz);

const islandDistance = (x: number, z: number): number => ellipse(x, z, ISLAND.cx, ISLAND.cz, ISLAND.rx, ISLAND.rz);
/** Lobe distance with its own large-scale wobble, so the new coasts don't look like circles. */
const lobeDistance = (x: number, z: number, r: RegionName, noise: Noise2D): number => {
  const l = LOBES[r];
  const seed = REGION_INDEX[r] * 37.3;
  return ellipse(x, z, l.c[0], l.c[1], l.rx, l.rz) + noise.fbm(x * 0.022 + seed, z * 0.022 - seed, 3) * 0.2;
};
/**
 * 0 near a lobe's rim, 1 deep inside it.
 * Reason: tall region terrain only grows away from the seams, so the borders with the old island stay walkable.
 */
const lobeDepth = (x: number, z: number, r: RegionName, noise: Noise2D): number => smoothstep(0.95, 0.5, lobeDistance(x, z, r, noise));
const dist = (x: number, z: number, p: P2): number => Math.hypot(x - p[0], z - p[1]);

/** Polynomial smooth minimum: blends the corners where two coastlines meet. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Coast distance of the whole island before the coast noise (< 1 is land, 1 is the coastline). */
export function coastDistance(x: number, z: number, noise: Noise2D): number {
  let d = islandDistance(x, z);
  for (const r of NAMES) d = smin(d, lobeDistance(x, z, r, noise), 0.25);
  return d;
}

/**
 * How much (x, z) belongs to each region, 0..1, written to `out` in REGION_INDEX order.
 * A spot belongs to the lobe it is deepest inside; the borders blend over a noisy band.
 * The original island is region-free (all zeros).
 */
export function regionWeights(x: number, z: number, noise: Noise2D, out: [number, number, number, number]): void {
  const own = NAMES.map((r) => lobeDistance(x, z, r, noise));
  const isle = islandDistance(x, z);
  const wobble = noise.fbm(x * 0.05 + 31, z * 0.05 - 17, 2) * 0.12;
  for (let i = 0; i < 4; i++) {
    let others = isle;
    for (let j = 0; j < 4; j++) if (j !== i) others = Math.min(others, own[j]);
    out[i] = smoothstep(0.3, -0.3, own[i] - others + wobble);
  }
}

/**
 * Inland ground height of each region before the coast falls into the sea
 * (blended in by the region weights).
 */
export function regionInland(x: number, z: number, noise: Noise2D, w: readonly number[], inland: number, coast: number): number {
  if (w[0] + w[1] + w[2] + w[3] < 0.001) return inland;
  let h = inland;
  // Lagoon: grassy dunes inland, flat white beaches along the sea and around the lagoon
  if (w[0] > 0) {
    let dunes = 1.0 + smoothstep(0.88, 0.45, coast) * 1.7 + noise.fbm(x * 0.04, z * 0.04, 2) * 0.4;
    dunes = lerp(dunes, 1.0, smoothstep(1.75, 1.1, lagoonBasin(x, z, noise)));
    h = lerp(h, dunes, w[0]);
  }
  // Jungle: lush, bumpy hills
  if (w[1] > 0) {
    const bumps = noise.fbm(x * 0.035 + 50, z * 0.035, 3) * 0.5 + 0.5;
    h = lerp(h, 2.4 + bumps * 5.5 * lobeDepth(x, z, "jungle", noise), w[1]);
  }
  // Swamp: flat and low
  if (w[2] > 0) h = lerp(h, 0.75 + noise.fbm(x * 0.06 - 9, z * 0.06, 2) * 0.3, w[2]);
  // Flower hills: rolling, with the windmill on the highest hill
  if (w[3] > 0) {
    const roll = noise.fbm(x * 0.028 - 40, z * 0.028 + 12, 3) * 0.5 + 0.5;
    const top = Math.exp(-((dist(x, z, SPOTS.windmill) / 20) ** 2));
    h = lerp(h, 3 + (roll * 5 + top * 7) * lobeDepth(x, z, "hills", noise), w[3]);
  }
  return h;
}

/**
 * Water carved into the regions after the coast is shaped: the lagoon basin and
 * its channel to the sea, the jungle pool, the swamp pond with the frog islet and
 * wadeable puddles.
 */
export function regionWater(h: number, x: number, z: number, noise: Noise2D, w: readonly number[], pathD: number): number {
  // Lagoon basin (shallow, turquoise) and the channel out to the sea
  if (w[0] > 0) {
    const basin = lagoonBasin(x, z, noise);
    const channel = segmentDistance(x, z, SPOTS.lagoonWater, SPOTS.lagoonMouth) / 6;
    const water = smoothstep(1.05, 0.75, Math.min(basin, channel));
    const depth = -0.55 - smoothstep(0.8, 0.1, basin) * 0.45 + noise.noise(x * 0.2, z * 0.2) * 0.08;
    h = lerp(h, Math.min(h, depth), water * w[0]);
  }
  // Jungle pool
  if (w[1] > 0) {
    const pool = smoothstep(7.5, 4.5, dist(x, z, SPOTS.junglePool) + noise.fbm(x * 0.15, z * 0.15, 2) * 2);
    h = lerp(h, Math.min(h, -0.9), pool * w[1]);
  }
  if (w[2] > 0) {
    // Puddles shallow enough to wade through; they stay off the paths so the way through the swamp is dry
    // Reason: water only digs down — region weights reach out over the sea, where lifting would make shoals
    const puddle = smoothstep(0.32, 0.5, noise.fbm(x * 0.09 + 3, z * 0.09 - 8, 2)) * smoothstep(1.5, 4.5, pathD);
    h = lerp(h, Math.min(h, -0.25), puddle * w[2]);
    // The pond (too deep to wade) around the dry frog islet
    const pond = ellipse(x, z, SPOTS.swampPond[0], SPOTS.swampPond[1], 13, 10) + noise.fbm(x * 0.1, z * 0.1, 2) * 0.1;
    h = lerp(h, Math.min(h, -1.2), smoothstep(1.0, 0.8, pond) * w[2]);
    h = lerp(h, 0.7, smoothstep(3.6, 2.6, dist(x, z, SPOTS.frogIslet)) * w[2]);
  }
  return h;
}

/** Normalised distance from the lagoon basin's centre (1 = its shore). */
const lagoonBasin = (x: number, z: number, noise: Noise2D): number =>
  ellipse(x, z, SPOTS.lagoonWater[0], SPOTS.lagoonWater[1], 17, 12) + noise.fbm(x * 0.08, z * 0.08, 2) * 0.12;

function segmentDistance(x: number, z: number, a: P2, b: P2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t));
}
